package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/troxe-host/node-agent/internal/auth"
	"github.com/troxe-host/node-agent/internal/config"
	troxcontainer "github.com/troxe-host/node-agent/internal/container"
)

type Server struct {
	cfg           *config.Config
	containerMgr  *troxcontainer.Manager
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
	containerMgr, err := troxcontainer.NewManager(cfg.DockerSocket)
	if err != nil {
		return nil, fmt.Errorf("failed to create container manager: %w", err)
	}

	return &Server{
		cfg:          cfg,
		containerMgr: containerMgr,
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Server action routes
	mux.HandleFunc("POST /api/servers/{id}/create", s.handleCreateServer)
	mux.HandleFunc("POST /api/servers/{id}/start", s.handleStartServer)
	mux.HandleFunc("POST /api/servers/{id}/stop", s.handleStopServer)
	mux.HandleFunc("POST /api/servers/{id}/restart", s.handleRestartServer)
	mux.HandleFunc("POST /api/servers/{id}/kill", s.handleKillServer)
	mux.HandleFunc("POST /api/servers/{id}/remove", s.handleRemoveServer)
	mux.HandleFunc("POST /api/servers/{id}/command", s.handleServerCommand)

	// Server info routes
	mux.HandleFunc("GET /api/servers/{id}/status", s.handleServerStatus)
	mux.HandleFunc("GET /api/servers/{id}/logs", s.handleGetLogs)

	// Console WebSocket
	mux.HandleFunc("GET /api/servers/{id}/ws", s.handleWebSocket)

	// File management
	mux.HandleFunc("GET /api/servers/{id}/files", s.handleFileListRoute)
	mux.HandleFunc("GET /api/servers/{id}/files/*", s.handleFileReadRoute)
	mux.HandleFunc("PUT /api/servers/{id}/files/*", s.handleFileWriteRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/create", s.handleFileCreateRoute)
	mux.HandleFunc("DELETE /api/servers/{id}/files/*", s.handleFileDeleteRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/rename", s.handleFileRenameRoute)
	mux.HandleFunc("POST /api/servers/{id}/files/upload", s.handleFileUploadRoute)

	// Stats
	mux.HandleFunc("GET /api/servers/{id}/stats", s.handleStatsRoute)

	// Health
	mux.HandleFunc("GET /api/health", s.handleHealth)

	// Auth middleware
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

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		ctx := context.WithValue(r.Context(), "claims", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// --- Server Actions ---

type CreateServerRequest struct {
	Image       string            `json:"image"`
	Startup     string            `json:"startup"`
	Environment map[string]string `json:"environment"`
	MemoryBytes int64             `json:"memory_bytes"`
	CpuPercent  float64           `json:"cpu_percent"`
	PidLimit    int64             `json:"pid_limit"`
	DataPath    string            `json:"data_path"`
	Ports       []int             `json:"ports"`
}

func (s *Server) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	var req CreateServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.DataPath == "" {
		req.DataPath = fmt.Sprintf("%s/%s", s.cfg.DataDirectory, serverID)
	}
	if req.MemoryBytes == 0 {
		req.MemoryBytes = 2 * 1024 * 1024 * 1024 // 2GB default
	}
	if req.CpuPercent == 0 {
		req.CpuPercent = 100
	}
	if req.PidLimit == 0 {
		req.PidLimit = 512
	}

	sc, err := s.containerMgr.Create(r.Context(), troxcontainer.CreateOptions{
		ServerID:    serverID,
		Image:       req.Image,
		Startup:     req.Startup,
		Environment: req.Environment,
		MemoryBytes: req.MemoryBytes,
		CpuPercent:  req.CpuPercent,
		PidLimit:    req.PidLimit,
		DataPath:    req.DataPath,
		Ports:       req.Ports,
	})
	if err != nil {
		log.Printf("Failed to create container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success":      true,
		"container_id": sc.ContainerID,
		"status":       sc.Status,
	})
}

func (s *Server) handleStartServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	if err := s.containerMgr.Start(r.Context(), serverID); err != nil {
		log.Printf("Failed to start container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status": "running"})
}

func (s *Server) handleStopServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	if err := s.containerMgr.Stop(r.Context(), serverID); err != nil {
		log.Printf("Failed to stop container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status": "stopped"})
}

func (s *Server) handleRestartServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	if err := s.containerMgr.Restart(r.Context(), serverID); err != nil {
		log.Printf("Failed to restart container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status": "running"})
}

func (s *Server) handleKillServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	if err := s.containerMgr.Kill(r.Context(), serverID); err != nil {
		log.Printf("Failed to kill container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status": "stopped"})
}

func (s *Server) handleRemoveServer(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	if err := s.containerMgr.Remove(r.Context(), serverID); err != nil {
		log.Printf("Failed to remove container for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleServerCommand(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	var req struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.Command == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Command required"})
		return
	}

	output, err := s.containerMgr.Exec(r.Context(), serverID, []string{"/bin/sh", "-c", req.Command})
	if err != nil {
		log.Printf("Failed to exec command for %s: %v", serverID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"output":  output,
	})
}

func (s *Server) handleServerStatus(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	status, err := s.containerMgr.GetStatus(r.Context(), serverID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "not_found",
			"error":  err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": status,
	})
}

func (s *Server) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	tail := 100
	if t := r.URL.Query().Get("tail"); t != "" {
		fmt.Sscanf(t, "%d", &tail)
	}

	logs, err := s.containerMgr.GetLogs(r.Context(), serverID, tail)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"logs": logs,
	})
}

// --- WebSocket Console ---

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")

	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}

	claims, err := auth.ValidateJWT(tokenStr, s.cfg.DaemonToken)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	if !claims.HasPermission("websocket.connect") {
		http.Error(w, "permission denied", http.StatusForbidden)
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
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

	go s.streamLogs(client)

	go client.writePump()
	client.readPump(s)
}

func (s *Server) streamLogs(client *WSClient) {
	ctx := context.Background()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			logs, err := s.containerMgr.GetLogs(ctx, client.serverID, 10)
			if err == nil && len(logs) > 0 {
				client.sendJSON(map[string]interface{}{
					"type": "output",
					"data": logs,
				})
			}
			time.Sleep(2 * time.Second)
		}
	}
}

func (c *WSClient) readPump(s *Server) {
	defer func() {
		c.mu.Lock()
		if !c.closed {
			c.conn.Close()
			c.closed = true
		}
		c.mu.Unlock()
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
			c.sendJSON(map[string]interface{}{
				"event": "auth",
				"args":  []string{"success"},
			})

		case "send command":
			if len(msg.Args) > 0 {
				if _, err := s.containerMgr.Exec(context.Background(), c.serverID, []string{"/bin/sh", "-c", msg.Args[0]}); err != nil {
					log.Printf("Exec failed: %v", err)
					c.sendJSON(map[string]interface{}{
						"type":  "output",
						"data":  fmt.Sprintf("Error: %v\n", err),
					})
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
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"version": "0.1.0",
		"uptime":  time.Since(startTime).String(),
	})
}

var startTime = time.Now()

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// --- File route delegates ---

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
