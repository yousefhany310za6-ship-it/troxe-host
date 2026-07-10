package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/troxe-host/node-agent/internal/auth"
	"github.com/troxe-host/node-agent/internal/config"
	"github.com/troxe-host/node-agent/internal/container"
	"github.com/troxe-host/node-agent/internal/websocket"
)

type Server struct {
	cfg           *config.Config
	containerMgr  *container.Manager
	wsManager     *websocket.Manager
	httpServer    *http.Server
	mu            sync.RWMutex
}

type WSClient struct {
	conn      *websocket.Conn
	serverID  string
	userID    string
	send      chan []byte
	closed    bool
	mu        sync.Mutex
}

func New(cfg *config.Config) (*Server, error) {
	containerMgr, err := container.NewManager(cfg.DockerSocket)
	if err != nil {
		return nil, fmt.Errorf("failed to create container manager: %w", err)
	}

	wsManager := websocket.NewManager()

	return &Server{
		cfg:          cfg,
		containerMgr: containerMgr,
		wsManager:    wsManager,
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("GET /api/servers/", s.handleServerRoutes)
	mux.HandleFunc("POST /api/servers/", s.handleServerActions)
	mux.HandleFunc("GET /api/servers/{id}/ws", s.handleWebSocket)
	mux.HandleFunc("GET /api/servers/{id}/logs", s.handleGetLogs)
	mux.HandleFunc("GET /api/servers/{id}/files", s.handleFileListRoute)
	mux.HandleFunc("GET /api/servers/{id}/files/*", s.handleFileReadRoute)
	mux.HandleFunc("PUT /api/servers/{id}/files/*", s.handleFileWriteRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/create", s.handleFileCreateRoute)
	mux.HandleFunc("DELETE /api/servers/{id}/files/*", s.handleFileDeleteRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/rename", s.handleFileRenameRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/upload", s.handleFileUploadRoute)
	mux.HandleFunc("GET /api/servers/{id}/stats", s.handleStatsRoute)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	// Add auth middleware
	handler := s.authMiddleware(mux)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.cfg.ListenPort),
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Node Agent listening on port %d", s.cfg.ListenPort)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	s.httpServer.Shutdown(ctx)
}

// Auth middleware
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Health check doesn't need auth
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || len(authHeader) < 8 || authHeader[:7] != "Bearer " {
			http.Error(w, `{"error":"Bearer token required"}`, http.StatusUnauthorized)
			return
		}

		token := authHeader[7:]
		claims, err := auth.ValidateJWT(token, s.cfg.DaemonToken)
		if err != nil {
			http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
			return
		}

		// Add claims to context
		ctx := context.WithValue(r.Context(), "claims", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// WebSocket handler for console
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	// Get JWT from query param
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}

	// Validate JWT
	claims, err := auth.ValidateJWT(tokenStr, s.cfg.DaemonToken)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Check permission
	if !claims.HasPermission("websocket.connect") {
		http.Error(w, "permission denied", http.StatusForbidden)
		return
	}

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			return origin == s.cfg.PanelURL
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &WSClient{
		conn:     conn,
		serverID: serverID,
		userID:   claims.UserID,
		send:     make(chan []byte, 256),
	}

	s.wsManager.Register(client)
	defer s.wsManager.Unregister(client)

	// Start goroutines for reading and writing
	go client.writePump()
	client.readPump(s)
}

// Read pump for WebSocket
func (c *WSClient) readPump(s *Server) {
	defer func() {
		c.mu.Lock()
		if !c.closed {
			c.conn.Close()
			c.closed = true
		}
		c.mu.Unlock()
		s.wsManager.Unregister(c)
	}()

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg struct {
			Event string   `json:"event"`
			Args  []string `json:"args"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Event {
		case "auth":
			// Already authenticated via JWT
			c.sendJSON(map[string]interface{}{
				"event": "auth",
				"args":  []string{"success"},
			})

		case "send command":
			if len(msg.Args) > 0 {
				if err := s.containerMgr.Exec(context.Background(), c.serverID, []string{"/bin/sh", "-c", msg.Args[0]}); err != nil {
					log.Printf("Exec failed: %v", err)
				}
			}

		case "set state":
			if len(msg.Args) > 0 {
				switch msg.Args[0] {
				case "start":
					s.containerMgr.Start(context.Background(), c.serverID)
				case "stop":
					s.containerMgr.Stop(context.Background(), c.serverID)
				case "restart":
					s.containerMgr.Restart(context.Background(), c.serverID)
				case "kill":
					s.containerMgr.Kill(context.Background(), c.serverID)
				}
			}
		}
	}
}

// Write pump for WebSocket
func (c *WSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *WSClient) sendJSON(data interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	jsonData, _ := json.Marshal(data)
	select {
	case c.send <- jsonData:
	default:
		// Channel full, drop message
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"version":   "0.1.0",
		"uptime":    time.Since(startTime).String(),
	})
}

var startTime = time.Now()

func (s *Server) handleServerRoutes(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement server info endpoint
	json.NewEncoder(w).Encode(map[string]interface{}{"message": "TODO"})
}

func (s *Server) handleServerActions(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement server actions
	json.NewEncoder(w).Encode(map[string]interface{}{"message": "TODO"})
}

func (s *Server) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement log streaming
	json.NewEncoder(w).Encode(map[string]interface{}{"message": "TODO"})
}

func (s *Server) handleFileListRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	s.handleFileList(w, r, serverID)
}

func (s *Server) handleFileReadRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	filePath := r.PathValue("*")
	s.handleFileRead(w, r, serverID, filePath)
}

func (s *Server) handleFileWriteRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	filePath := r.PathValue("*")
	s.handleFileWrite(w, r, serverID, filePath)
}

func (s *Server) handleFileCreateRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	s.handleFileCreate(w, r, serverID)
}

func (s *Server) handleFileDeleteRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	filePath := r.PathValue("*")
	s.handleFileDelete(w, r, serverID, filePath)
}

func (s *Server) handleFileRenameRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	s.handleFileRename(w, r, serverID)
}

func (s *Server) handleFileUploadRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	s.handleFileUpload(w, r, serverID)
}

func (s *Server) handleStatsRoute(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	stats := s.getContainerStats(serverID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"stats": stats})
}
