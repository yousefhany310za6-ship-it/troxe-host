package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/troxe-host/node-agent/internal/config"
	"github.com/troxe-host/node-agent/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	fmt.Println("Troxe Host Node Agent v0.1.0")
	fmt.Println("=============================")
	fmt.Printf("Panel URL: %s\n", cfg.PanelURL)
	fmt.Printf("Listen Port: %d\n", cfg.ListenPort)
	fmt.Printf("SFTP Port: %d\n", cfg.SFTPPort)
	fmt.Println("")

	srv, err := server.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		srv.Shutdown()
	}()

	if err := srv.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
