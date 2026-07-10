package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type FileInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type FileContent struct {
	Content  string `json:"content"`
	Path     string `json:"path"`
	Encoding string `json:"encoding"`
}

// Handle file listing
func (s *Server) handleFileList(w http.ResponseWriter, r *http.Request, serverID string) {
	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "/"
	}

	// Security: prevent path traversal
	if strings.Contains(dirPath, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	dataPath := filepath.Join(s.cfg.DataDirectory, serverID, dirPath)

	entries, err := os.ReadDir(dataPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		fileType := "file"
		if entry.IsDir() {
			fileType = "directory"
		}

		files = append(files, FileInfo{
			Name:     entry.Name(),
			Type:     fileType,
			Size:     info.Size(),
			Modified: info.ModTime().Format(time.RFC3339),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"files": files,
		"path":  dirPath,
	})
}

// Handle file read
func (s *Server) handleFileRead(w http.ResponseWriter, r *http.Request, serverID string, filePath string) {
	if strings.Contains(filePath, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	dataPath := filepath.Join(s.cfg.DataDirectory, serverID, filePath)

	// Check if it's a directory
	info, err := os.Stat(dataPath)
	if err != nil {
		http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
		return
	}
	if info.IsDir() {
		http.Error(w, `{"error":"Is a directory"}`, http.StatusBadRequest)
		return
	}

	// Check file size (limit to 5MB for reading)
	if info.Size() > 5*1024*1024 {
		http.Error(w, `{"error":"File too large to read"}`, http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(dataPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(FileContent{
		Content:  string(content),
		Path:     filePath,
		Encoding: "utf-8",
	})
}

// Handle file write
func (s *Server) handleFileWrite(w http.ResponseWriter, r *http.Request, serverID string, filePath string) {
	if strings.Contains(filePath, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	dataPath := filepath.Join(s.cfg.DataDirectory, serverID, filePath)

	// Create directory if it doesn't exist
	dir := filepath.Dir(dataPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(dataPath, []byte(body.Content), 0644); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "path": filePath})
}

// Handle file create
func (s *Server) handleFileCreate(w http.ResponseWriter, r *http.Request, serverID string) {
	var body struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if strings.Contains(body.Name, "..") {
		http.Error(w, `{"error":"Invalid name"}`, http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(s.cfg.DataDirectory, serverID, body.Path, body.Name)

	if body.Type == "directory" {
		if err := os.MkdirAll(fullPath, 0755); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
	} else {
		// Create empty file
		dir := filepath.Dir(fullPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		if err := os.WriteFile(fullPath, []byte(""), 0644); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// Handle file delete
func (s *Server) handleFileDelete(w http.ResponseWriter, r *http.Request, serverID string, filePath string) {
	if strings.Contains(filePath, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	dataPath := filepath.Join(s.cfg.DataDirectory, serverID, filePath)

	if err := os.RemoveAll(dataPath); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// Handle file rename
func (s *Server) handleFileRename(w http.ResponseWriter, r *http.Request, serverID string) {
	var body struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if strings.Contains(body.From, "..") || strings.Contains(body.To, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	fromPath := filepath.Join(s.cfg.DataDirectory, serverID, body.From)
	toPath := filepath.Join(s.cfg.DataDirectory, serverID, body.To)

	if err := os.Rename(fromPath, toPath); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// Handle file upload
func (s *Server) handleFileUpload(w http.ResponseWriter, r *http.Request, serverID string) {
	// Limit upload size to 100MB
	r.ParseMultipartForm(100 << 20)

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"No file provided"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	uploadPath := r.FormValue("path")
	fileName := handler.Filename

	if strings.Contains(fileName, "..") {
		http.Error(w, `{"error":"Invalid filename"}`, http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(s.cfg.DataDirectory, serverID, uploadPath, fileName)

	// Create directory if needed
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(fullPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"files":   []string{fileName},
	})
}

// Handle stats collection
func (s *Server) getContainerStats(serverID string) map[string]interface{} {
	// TODO: Use Docker SDK to get real container stats
	// For now return mock data
	return map[string]interface{}{
		"memory_bytes":      0,
		"memory_limit_bytes": 0,
		"cpu_absolute":      0,
		"network": map[string]interface{}{
			"rx_bytes": 0,
			"tx_bytes": 0,
		},
		"uptime": 0,
		"state":  "stopped",
		"disk_bytes": 0,
	}
}
