package server

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"context"
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

	// Ensure container user can access
	os.Chown(dataPath, 1000, 1000)
	os.Chown(dir, 1000, 1000)

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
		os.Chown(fullPath, 1000, 1000)
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
		os.Chown(fullPath, 1000, 1000)
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

	// Ensure files are owned by container user (1000:1000)
	os.Chown(fullPath, 1000, 1000)
	os.Chown(dir, 1000, 1000)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"files":   []string{fileName},
	})
}

// Handle file compression - creates a zip of the given path
func (s *Server) handleFileCompress(w http.ResponseWriter, r *http.Request, serverID string) {
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}
	if req.Path == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Path is required"})
		return
	}

	dataDir := filepath.Join(s.cfg.DataDirectory, serverID)
	target := filepath.Join(dataDir, req.Path)

	// Security: ensure within data dir
	absData, _ := filepath.Abs(dataDir)
	absTarget, _ := filepath.Abs(target)
	if !strings.HasPrefix(absTarget, absData) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Path outside data directory"})
		return
	}

	zipName := req.Name
	if zipName == "" {
		base := filepath.Base(req.Path)
		zipName = base + ".zip"
	}
	if !strings.HasSuffix(zipName, ".zip") {
		zipName += ".zip"
	}

	// Create zip in the same directory
	zipPath := filepath.Join(filepath.Dir(target), zipName)
	zipFile, err := os.Create(zipPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer zipFile.Close()

	walker := zip.NewWriter(zipFile)
	defer walker.Close()

	err = filepath.Walk(target, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relPath, _ := filepath.Rel(filepath.Dir(target), path)
		relPath = filepath.ToSlash(relPath)

		if info.IsDir() {
			// Add directory entry
			_, err := walker.Create(relPath + "/")
			return err
		}

		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		entry, err := walker.Create(relPath)
		if err != nil {
			return err
		}
		_, err = io.Copy(entry, f)
		return err
	})

	if err != nil {
		os.Remove(zipPath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	walker.Close()
	zipFile.Close()

	zipInfo, _ := os.Stat(zipPath)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"name":    zipName,
		"size":    zipInfo.Size(),
	})
}

// Handle file decompression - detects format by magic bytes, supports zip/gzip/tar/bzip2
func (s *Server) handleFileDecompress(w http.ResponseWriter, r *http.Request, serverID string) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}
	if req.Path == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Path is required"})
		return
	}

	dataDir := filepath.Join(s.cfg.DataDirectory, serverID)
	target := filepath.Join(dataDir, req.Path)

	absData, _ := filepath.Abs(dataDir)
	absTarget, _ := filepath.Abs(target)
	if !strings.HasPrefix(absTarget, absData) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Path outside data directory"})
		return
	}

	// Read magic bytes to detect format
	f, err := os.Open(target)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Cannot open file: " + err.Error()})
		return
	}

	// Read first 263 bytes to check ZIP/GZIP magic and tar "ustar" at offset 257
	magic := make([]byte, 263)
	n, _ := io.ReadFull(f, magic)
	f.Close()

	if n < 4 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "File too small to be an archive"})
		return
	}

	destDir := filepath.Dir(target)
	archiveType := detectArchiveType(magic)

	// If unknown, check if it's tar (ustar magic at offset 257)
	if archiveType == "unknown" && n >= 262 && string(magic[257:262]) == "ustar" {
		archiveType = "tar"
	}

	switch archiveType {
	case "zip":
		count, err := extractZip(target, destDir, absData)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "files": count})

	case "gzip":
		// Decompress gzip, then check if the result is tar
		tmpPath := target + ".tmp"
		count, err := decompressGzip(target, tmpPath, destDir, absData)
		if err != nil {
			os.Remove(tmpPath)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "files": count})

	case "tar":
		count, err := extractTar(target, destDir, absData)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "files": count})

	case "bzip2":
		count, err := decompressBzip2(target, destDir, absData)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "files": count})

	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Unsupported archive format. Supported: zip, gzip, tar, tar.gz, tar.bz2"})
	}
}

func detectArchiveType(magic []byte) string {
	// ZIP: PK\x03\x04
	if magic[0] == 'P' && magic[1] == 'K' && magic[2] == 0x03 && magic[3] == 0x04 {
		return "zip"
	}
	// GZIP: \x1f\x8b
	if magic[0] == 0x1f && magic[1] == 0x8b {
		return "gzip"
	}
	return "unknown"
}

func extractZip(zipPath, destDir, absData string) (int, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return 0, fmt.Errorf("failed to open zip: %v", err)
	}
	defer reader.Close()

	count := 0
	for _, f := range reader.File {
		fpath := filepath.Join(destDir, f.Name)
		absFpath, _ := filepath.Abs(fpath)
		if !strings.HasPrefix(absFpath, absData) {
			continue
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, 0755)
			count++
			continue
		}

		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return count, err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			return count, err
		}

		zf, err := f.Open()
		if err != nil {
			outFile.Close()
			return count, err
		}

		_, err = io.Copy(outFile, zf)
		zf.Close()
		outFile.Close()
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func extractTar(tarPath, destDir, absData string) (int, error) {
	f, err := os.Open(tarPath)
	if err != nil {
		return 0, fmt.Errorf("failed to open tar: %v", err)
	}
	defer f.Close()

	tr := tar.NewReader(f)
	count := 0
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Partial/truncated tar — return what we extracted so far
			if count > 0 {
				return count, nil
			}
			return 0, fmt.Errorf("tar read error: %v", err)
		}

		fpath := filepath.Join(destDir, header.Name)
		absFpath, _ := filepath.Abs(fpath)
		if !strings.HasPrefix(absFpath, absData) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(fpath, 0755)
			count++
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
				return count, err
			}
			outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return count, err
			}
			_, copyErr := io.Copy(outFile, tr)
			outFile.Close()
			if copyErr != nil && copyErr != io.ErrUnexpectedEOF {
				return count, copyErr
			}
			count++
		case tar.TypeSymlink:
			if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
				return count, err
			}
			os.Remove(fpath)
			if err := os.Symlink(header.Linkname, fpath); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}

func decompressGzip(gzPath, tmpPath, destDir, absData string) (int, error) {
	// Peek at decompressed content to detect tar
	f, err := os.Open(gzPath)
	if err != nil {
		return 0, err
	}
	gz, err := gzip.NewReader(f)
	if err != nil {
		f.Close()
		return 0, fmt.Errorf("failed to open gzip: %v", err)
	}

	peek := make([]byte, 263)
	n, _ := io.ReadFull(gz, peek)
	gz.Close()
	f.Close()

	isTar := n >= 262 && string(peek[257:262]) == "ustar"

	// Re-open for actual extraction
	f2, err := os.Open(gzPath)
	if err != nil {
		return 0, err
	}
	defer f2.Close()
	gz2, err := gzip.NewReader(f2)
	if err != nil {
		return 0, err
	}
	defer gz2.Close()

	if isTar {
		// Write decompressed data to temp tar file, then extract
		tmpTar := gzPath + ".tar"
		tf, err := os.Create(tmpTar)
		if err != nil {
			return 0, err
		}
		io.Copy(tf, gz2)
		tf.Close()

		count, err := extractTar(tmpTar, destDir, absData)
		os.Remove(tmpTar)
		return count, err
	}

	// Not tar — decompress as plain gzip, output same name without .gz
	outName := strings.TrimSuffix(strings.TrimSuffix(filepath.Base(gzPath), ".gz"), ".gzip")
	outPath := filepath.Join(destDir, outName)

	outFile, err := os.OpenFile(outPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return 0, err
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, gz2); err != nil {
		return 0, err
	}

	return 1, nil
}

func decompressBzip2(bz2Path, destDir, absData string) (int, error) {
	f, err := os.Open(bz2Path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	bz2 := bzip2.NewReader(f)

	// Write to temp file, check if tar
	tmpPath := bz2Path + ".tmp"
	tf, err := os.Create(tmpPath)
	if err != nil {
		return 0, err
	}
	io.Copy(tf, bz2)
	tf.Close()

	tmpType := make([]byte, 263)
	tf2, _ := os.Open(tmpPath)
	tn, _ := io.ReadFull(tf2, tmpType)
	tf2.Close()

	if tn >= 262 && string(tmpType[257:262]) == "ustar" {
		count, err := extractTar(tmpPath, destDir, absData)
		os.Remove(tmpPath)
		return count, err
	}

	// Plain bzip2 — output without .bz2
	outName := strings.TrimSuffix(filepath.Base(bz2Path), ".bz2")
	outPath := filepath.Join(destDir, outName)
	os.Rename(tmpPath, outPath)
	return 1, nil
}

// Handle stats collection
func (s *Server) getContainerStats(serverID string) map[string]interface{} {
	stats, err := s.containerMgr.GetStats(context.Background(), serverID)
	if err != nil {
		return map[string]interface{}{
			"memory_bytes":       0,
			"memory_limit_bytes": 0,
			"cpu_absolute":       0,
			"network": map[string]interface{}{
				"rx_bytes": 0,
				"tx_bytes": 0,
			},
			"uptime":     0,
			"state":      "stopped",
			"disk_bytes": 0,
		}
	}
	return stats
}
