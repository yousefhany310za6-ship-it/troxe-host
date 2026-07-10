package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	PanelURL      string `json:"panel_url"`
	DaemonToken   string `json:"daemon_token"`
	NodeID        string `json:"node_id"`
	ListenPort    int    `json:"listen_port"`
	SFTPPort      int    `json:"sftp_port"`
	DockerSocket  string `json:"docker_socket"`
	DataDirectory string `json:"data_directory"`
	MaxServers    int    `json:"max_servers"`
}

func Load() (*Config, error) {
	cfg := &Config{
		PanelURL:      getEnv("PANEL_URL", "http://localhost:3001"),
		DaemonToken:   getEnv("DAEMON_TOKEN", ""),
		NodeID:        getEnv("NODE_ID", ""),
		ListenPort:    8080,
		SFTPPort:      2022,
		DockerSocket:  getEnv("DOCKER_SOCKET", "/var/run/docker.sock"),
		DataDirectory: getEnv("DATA_DIRECTORY", "/var/lib/troxe"),
		MaxServers:    250,
	}

	// Try loading from config file
	configPath := getEnv("CONFIG_FILE", "/etc/troxe/node.json")
	if _, err := os.Stat(configPath); err == nil {
		data, err := os.ReadFile(configPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
		if err := json.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("failed to parse config file: %w", err)
		}
	}

	if cfg.DaemonToken == "" {
		return nil, fmt.Errorf("DAEMON_TOKEN is required")
	}
	if cfg.NodeID == "" {
		return nil, fmt.Errorf("NODE_ID is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
