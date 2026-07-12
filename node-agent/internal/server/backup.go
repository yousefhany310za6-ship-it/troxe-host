package server

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) handleBackupCreate(w http.ResponseWriter, r *http.Request, serverID string) {
	var ignorePatterns []string
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&ignorePatterns)
	}

	dataDir := filepath.Join(s.cfg.DataDirectory, serverID)
	backupDir := filepath.Join(dataDir, ".backups")

	if err := os.MkdirAll(backupDir, 0755); err != nil {
		log.Printf("[backup] failed to create backup dir: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("backup-%s.zip", time.Now().Format("20060102-150405"))
	zipPath := filepath.Join(backupDir, filename)

	zipFile, err := os.Create(zipPath)
	if err != nil {
		log.Printf("[backup] failed to create zip file: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	err = filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(dataDir, path)

		// Always skip .backups directory
		if relPath == ".backups" || strings.HasPrefix(relPath, ".backups"+string(filepath.Separator)) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Check ignore patterns
		for _, pattern := range ignorePatterns {
			if matched, _ := filepath.Match(pattern, relPath); matched {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if matched, _ := filepath.Match(pattern, filepath.Base(relPath)); matched {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
		}

		zipEntry := filepath.ToSlash(relPath)
		if info.IsDir() {
			zipEntry += "/"
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = zipEntry
		header.Method = zip.Deflate

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		_, err = io.Copy(writer, f)
		return err
	})

	if err != nil {
		log.Printf("[backup] failed to create backup: %v", err)
		os.Remove(zipPath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if err := zipWriter.Close(); err != nil {
		log.Printf("[backup] failed to finalize zip: %v", err)
		os.Remove(zipPath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	zipFile.Close()

	zipInfo, err := os.Stat(zipPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"filename": filename,
		"size":     zipInfo.Size(),
	})
}

func (s *Server) handleBackupDownload(w http.ResponseWriter, r *http.Request, serverID string, filename string) {
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid filename"})
		return
	}

	backupDir := filepath.Join(s.cfg.DataDirectory, serverID, ".backups")
	filePath := filepath.Join(backupDir, filename)

	info, err := os.Stat(filePath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Backup not found"})
		return
	}

	if info.IsDir() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Not a file"})
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))

	f, err := os.Open(filePath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer f.Close()

	io.Copy(w, f)
}

func (s *Server) handleBackupDelete(w http.ResponseWriter, r *http.Request, serverID string, filename string) {
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid filename"})
		return
	}

	backupDir := filepath.Join(s.cfg.DataDirectory, serverID, ".backups")
	filePath := filepath.Join(backupDir, filename)

	if _, err := os.Stat(filePath); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Backup not found"})
		return
	}

	if err := os.Remove(filePath); err != nil {
		log.Printf("[backup] failed to delete backup: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
