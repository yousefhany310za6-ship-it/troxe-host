package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

type Manager struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type Client struct {
	send     chan []byte
	serverID string
	userID   string
	closed   bool
	mu       sync.Mutex
}

func NewManager() *Manager {
	m := &Manager{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go m.run()
	return m
}

func (m *Manager) run() {
	for {
		select {
		case client := <-m.register:
			m.mu.Lock()
			m.clients[client] = true
			m.mu.Unlock()
			log.Printf("WebSocket client connected: server=%s user=%s", client.serverID, client.userID)

		case client := <-m.unregister:
			m.mu.Lock()
			if _, ok := m.clients[client]; ok {
				delete(m.clients, client)
				close(client.send)
			}
			m.mu.Unlock()
			log.Printf("WebSocket client disconnected: server=%s user=%s", client.serverID, client.userID)

		case message := <-m.broadcast:
			m.mu.RLock()
			for client := range m.clients {
				select {
				case client.send <- message:
				default:
					// Client too slow, drop message
				}
			}
			m.mu.RUnlock()
		}
	}
}

func (m *Manager) Register(client *Client) {
	m.register <- client
}

func (m *Manager) Unregister(client *Client) {
	m.unregister <- client
}

func (m *Manager) BroadcastToServer(serverID string, event string, args []string) {
	msg := map[string]interface{}{
		"event": event,
		"args":  args,
	}
	data, _ := json.Marshal(msg)

	m.mu.RLock()
	defer m.mu.RUnlock()

	for client := range m.clients {
		if client.serverID == serverID {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func (m *Manager) BroadcastToAll(event string, args []string) {
	msg := map[string]interface{}{
		"event": event,
		"args":  args,
	}
	data, _ := json.Marshal(msg)

	m.mu.RLock()
	defer m.mu.RUnlock()

	for client := range m.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

// Start token refresh timer
func (m *Manager) StartTokenRefresh() {
	ticker := time.NewTicker(20 * time.Second)
	go func() {
		for range ticker.C {
			m.BroadcastToAll("token expiring", []string{})
		}
	}()
}
