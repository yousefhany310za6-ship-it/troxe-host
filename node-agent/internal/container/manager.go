package container

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/docker/go-connections/nat"
)

type Manager struct {
	client        *client.Client
	containers    map[string]*ServerContainer
	mu            sync.RWMutex
	dataDirectory string
}

type ServerEvent struct {
	Type      string    // "start", "stop", "restart"
	Timestamp time.Time
}

type ServerContainer struct {
	ServerID       string
	ContainerID    string
	Status         string
	Image          string
	StartedAt      time.Time
	Events         []ServerEvent
	CrashCount     int
	LastCrashedAt  time.Time
	NeedsAttention bool
	autoRestarted  bool
}

func NewManager(dockerSocket string, dataDirectory string) (*Manager, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+dockerSocket),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	m := &Manager{
		client:        cli,
		containers:    make(map[string]*ServerContainer),
		dataDirectory: dataDirectory,
	}

	// Restore existing containers from Docker so we don't lose tracking after a restart
	if err := m.Restore(context.Background()); err != nil {
		log.Printf("[container] warning: failed to restore containers: %v", err)
	}

	return m, nil
}

// Restore scans Docker for existing Troxe-managed containers and rebuilds the
// in-memory map. This ensures the agent can manage containers that were created
// before a restart.
func (m *Manager) Restore(ctx context.Context) error {
	existing, err := m.client.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(filters.Arg("label", "troxe.managed=true")),
	})
	if err != nil {
		return fmt.Errorf("failed to list containers: %w", err)
	}

	count := 0
	for _, c := range existing {
		serverID := c.Labels["troxe.server_id"]
		if serverID == "" {
			continue
		}
		startedAt := time.Time{}
		if inspect, err := m.client.ContainerInspect(ctx, c.ID); err == nil {
			if inspect.State != nil && inspect.State.StartedAt != "" {
				if t, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt); err == nil {
					startedAt = t
				}
			}
		}
		m.containers[serverID] = &ServerContainer{
			ServerID:    serverID,
			ContainerID: c.ID,
			Status:      c.State,
			Image:       c.Image,
			StartedAt:   startedAt,
		}
		count++
	}

	if count > 0 {
		log.Printf("[container] restored %d container(s) from Docker", count)
	}
	return nil
}

// StartHealthCheck runs a periodic health check loop that inspects Docker state
// for all tracked containers. It marks crashed containers and auto-restarts them
// if the troxe.auto_restart=true label is set. Respects rate limiting to prevent
// restart loops (max 3 restarts per 10-minute window).
func (m *Manager) StartHealthCheck(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.runHealthCheck(ctx)
		}
	}
}

func (m *Manager) runHealthCheck(ctx context.Context) {
	m.mu.RLock()
	serverIDs := make([]string, 0, len(m.containers))
	for id := range m.containers {
		serverIDs = append(serverIDs, id)
	}
	m.mu.RUnlock()

	for _, serverID := range serverIDs {
		m.mu.RLock()
		sc, ok := m.containers[serverID]
		m.mu.RUnlock()
		if !ok {
			continue
		}

		inspect, err := m.client.ContainerInspect(ctx, sc.ContainerID)
		if err != nil {
			log.Printf("[healthcheck] failed to inspect container %s: %v", serverID, err)
			continue
		}

		if inspect.State == nil {
			continue
		}

		crashed := false
		if inspect.State.OOMKilled {
			crashed = true
		} else if inspect.State.ExitCode != 0 && (inspect.State.Status == "exited" || inspect.State.Status == "dead") {
			crashed = true
		}

		if !crashed {
			continue
		}

		m.mu.Lock()
		sc.Status = "crashed"
		sc.CrashCount++
		sc.LastCrashedAt = time.Now()
		sc.NeedsAttention = true
		m.mu.Unlock()

		// Check for auto-restart label
		label, hasLabel := inspect.Config.Labels["troxe.auto_restart"]
		if !hasLabel || label != "true" {
			log.Printf("[healthcheck] server %s crashed (exit code %d, OOM=%v) — no auto-restart label", serverID, inspect.State.ExitCode, inspect.State.OOMKilled)
			continue
		}

		// Rate limit: max 3 restarts in 10 minutes
		m.mu.RLock()
		crashCount := sc.CrashCount
		lastCrashed := sc.LastCrashedAt
		m.mu.RUnlock()

		if crashCount > 3 {
			log.Printf("[healthcheck] server %s exceeded auto-restart limit (3 in 10m), marking NeedsAttention", serverID)
			m.mu.Lock()
			sc.NeedsAttention = true
			m.mu.Unlock()
			continue
		}

		if crashCount > 1 && time.Since(lastCrashed) < 10*time.Minute {
			log.Printf("[healthcheck] server %s auto-restart throttled: %d crashes in last 10m", serverID, crashCount)
			continue
		}

		log.Printf("[healthcheck] auto-restarting server %s (crash #%d)", serverID, crashCount)
		if err := m.Start(ctx, serverID); err != nil {
			log.Printf("[healthcheck] failed to auto-restart server %s: %v", serverID, err)
		}
	}
}

// GetCrashedServers returns a list of server IDs that have crashed since the
// last call. This clears the NeedsAttention flag.
func (m *Manager) GetCrashedServers() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	var crashed []string
	for id, sc := range m.containers {
		if sc.NeedsAttention {
			crashed = append(crashed, id)
			sc.NeedsAttention = false
		}
	}
	return crashed
}

func (m *Manager) Create(ctx context.Context, opts CreateOptions) (*ServerContainer, error) {
	// Ensure data directory exists
	if err := os.MkdirAll(opts.DataPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Chown data directory to container user (1000:1000) so container can write files
	if err := chownRecursive(opts.DataPath, 1000, 1000); err != nil {
		log.Printf("[container] warning: failed to chown data dir %s: %v", opts.DataPath, err)
	}

	// Pull image if not exists
	_, err := m.client.ImagePull(ctx, opts.Image, image.PullOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to pull image: %w", err)
	}

	// Build environment variables
	env := make([]string, 0, len(opts.Environment))
	for k, v := range opts.Environment {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	// Port bindings
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	for _, port := range opts.Ports {
		containerPort := port.ContainerPort
		if containerPort == 0 {
			containerPort = port.HostPort
		}
		p := nat.Port(fmt.Sprintf("%d/tcp", containerPort))
		exposedPorts[p] = struct{}{}
		portBindings[p] = []nat.PortBinding{
			{
				HostIP:   "0.0.0.0",
				HostPort: fmt.Sprintf("%d", port.HostPort),
			},
		}
		pu := nat.Port(fmt.Sprintf("%d/udp", containerPort))
		exposedPorts[pu] = struct{}{}
		portBindings[pu] = []nat.PortBinding{
			{
				HostIP:   "0.0.0.0",
				HostPort: fmt.Sprintf("%d", port.HostPort),
			},
		}
	}

	// Container config — run startup command via shell so env vars expand
	containerConfig := &container.Config{
		Image:        opts.Image,
		Env:          env,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/home/container",
		User:         "1000:1000",
		Labels: map[string]string{
			"troxe.managed":    "true",
			"troxe.server_id":  opts.ServerID,
			"troxe.auto_restart": fmt.Sprintf("%t", opts.AutoRestart),
		},
	}
	if opts.Startup != "" {
		mainFile := extractMainFile(opts.Startup)
		wrapper := buildStartupWrapper(opts.Startup, mainFile)
		containerConfig.Cmd = []string{"/bin/sh", "-c", wrapper}
	}

	// Host config with security
	hostConfig := &container.HostConfig{
		// Security
		Privileged:  false,
		ReadonlyRootfs: false,
		// Drop all capabilities, add only what's needed
		CapDrop: []string{"ALL"},
		CapAdd:  []string{"NET_BIND_SERVICE"},
		// Prevent privilege escalation
		SecurityOpt: []string{"no-new-privileges:true"},
		// Resource limits
		Resources: container.Resources{
			Memory:     opts.MemoryBytes,
			CPUQuota:   int64(opts.CpuPercent * 1000),
			PidsLimit:  &opts.PidLimit,
			BlkioDeviceWriteBps: nil,
		},
		// Network mode
		NetworkMode: "bridge",
		// Port bindings
		PortBindings: portBindings,
		// Restart policy (no auto-restart, panel controls this)
		RestartPolicy: container.RestartPolicy{Name: "no"},
		// Mounts
		Mounts: []mount.Mount{
			{
				Type:     mount.TypeBind,
				Source:   opts.DataPath,
				Target:   "/home/container",
				ReadOnly: false,
			},
			{
				Type:     mount.TypeTmpfs,
				Target:   "/tmp",
				TmpfsOptions: &mount.TmpfsOptions{
					SizeBytes: 100 * 1024 * 1024, // 100MB
				},
			},
		},
	}

	// Create container
	resp, err := m.client.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, fmt.Sprintf("troxe-%s", opts.ServerID))
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	sc := &ServerContainer{
		ServerID:    opts.ServerID,
		ContainerID: resp.ID,
		Status:      "created",
		Image:       opts.Image,
	}

	m.mu.Lock()
	m.containers[opts.ServerID] = sc
	m.mu.Unlock()

	return sc, nil
}

func (m *Manager) Start(ctx context.Context, serverID string) error {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("container not found for server %s", serverID)
	}

	sc.StartedAt = time.Now()
	sc.Events = append(sc.Events, ServerEvent{Type: "start", Timestamp: sc.StartedAt})
	sc.NeedsAttention = false

	if err := m.client.ContainerStart(ctx, sc.ContainerID, container.StartOptions{}); err != nil {
		errStr := err.Error()
		// If Docker says the container doesn't exist, remove stale entry
		if strings.Contains(errStr, "No such container") || strings.Contains(errStr, "no such container") {
			m.mu.Lock()
			delete(m.containers, serverID)
			m.mu.Unlock()
			return fmt.Errorf("container not found for server %s", serverID)
		}
		return fmt.Errorf("failed to start container: %w", err)
	}

	sc.Status = "running"
	return nil
}

func (m *Manager) Stop(ctx context.Context, serverID string) error {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("container not found for server %s", serverID)
	}

	timeout := 5 // seconds
	if err := m.client.ContainerStop(ctx, sc.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}

	sc.Status = "stopped"
	sc.Events = append(sc.Events, ServerEvent{Type: "stop", Timestamp: time.Now()})
	return nil
}

func (m *Manager) Restart(ctx context.Context, serverID string) error {
	if err := m.Stop(ctx, serverID); err != nil {
		return err
	}
	return m.Start(ctx, serverID)
}

func (m *Manager) Kill(ctx context.Context, serverID string) error {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("container not found for server %s", serverID)
	}

	if err := m.client.ContainerKill(ctx, sc.ContainerID, "SIGKILL"); err != nil {
		return fmt.Errorf("failed to kill container: %w", err)
	}

	sc.Status = "stopped"
	return nil
}

func (m *Manager) Remove(ctx context.Context, serverID string) error {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()

	if ok {
		if err := m.client.ContainerRemove(ctx, sc.ContainerID, container.RemoveOptions{Force: true}); err != nil {
			return fmt.Errorf("failed to remove container: %w", err)
		}
		m.mu.Lock()
		delete(m.containers, serverID)
		m.mu.Unlock()
		return nil
	}

	// Not in memory — find and force-remove by label from Docker
	containers, err := m.client.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(filters.Arg("label", "troxe.server_id="+serverID)),
	})
	if err != nil {
		return fmt.Errorf("failed to list containers: %w", err)
	}

	for _, c := range containers {
		_ = m.client.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
	}

	return nil
}

func (m *Manager) GetStatus(ctx context.Context, serverID string) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	inspect, err := m.client.ContainerInspect(ctx, sc.ContainerID)
	if err != nil {
		return "", err
	}

	return inspect.State.Status, nil
}

// StreamLogs opens a live-following log stream. The returned reader yields new
// log lines as they appear until the context is cancelled or the container stops.
func (m *Manager) StreamLogs(ctx context.Context, serverID string) (io.ReadCloser, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("container not found for server %s", serverID)
	}

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "50",
	}

	return m.client.ContainerLogs(ctx, sc.ContainerID, options)
}

func (m *Manager) GetLogs(ctx context.Context, serverID string, tail int) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
	}

	// Only show logs since the last start
	if !sc.StartedAt.IsZero() {
		options.Since = fmt.Sprintf("%d", sc.StartedAt.Unix())
	}

	reader, err := m.client.ContainerLogs(ctx, sc.ContainerID, options)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	// Demultiplex Docker's multiplexed stdout/stderr stream
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, reader); err != nil {
		return "", err
	}

	combined := stdout.String()
	if stderr.Len() > 0 {
		combined += stderr.String()
	}

	return combined, nil
}

func (m *Manager) Exec(ctx context.Context, serverID string, cmd []string) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		User:         "1000:1000",
	}

	execResp, err := m.client.ContainerExecCreate(ctx, sc.ContainerID, execConfig)
	if err != nil {
		return "", err
	}

	hijacked, err := m.client.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", err
	}
	defer hijacked.Close()

	data, err := io.ReadAll(hijacked.Reader)
	if err != nil {
		return "", err
	}

	return string(data), nil
}

func (m *Manager) GetStats(ctx context.Context, serverID string) (map[string]interface{}, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("container not found for server %s", serverID)
	}

	statsResp, err := m.client.ContainerStatsOneShot(ctx, sc.ContainerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get container stats: %w", err)
	}
	defer statsResp.Body.Close()

	var statsData types.StatsJSON
	if err := json.NewDecoder(statsResp.Body).Decode(&statsData); err != nil {
		return nil, fmt.Errorf("failed to decode stats: %w", err)
	}

	// Calculate CPU percentage
	cpuDelta := float64(statsData.CPUStats.CPUUsage.TotalUsage - statsData.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(statsData.CPUStats.SystemUsage - statsData.PreCPUStats.SystemUsage)
	cpuPercent := 0.0
	if systemDelta > 0 && cpuDelta > 0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(statsData.CPUStats.OnlineCPUs) * 100
	}

	// Memory
	memUsage := statsData.MemoryStats.Usage
	memLimit := statsData.MemoryStats.Limit

	// Network
	var rxBytes, txBytes uint64
	if statsData.Networks != nil {
		for _, net := range statsData.Networks {
			rxBytes += net.RxBytes
			txBytes += net.TxBytes
		}
	}

	// Uptime + disk size from container inspect
	uptime := int64(0)
	inspect, err := m.client.ContainerInspect(ctx, sc.ContainerID)
	if err == nil {
		if inspect.State != nil && inspect.State.StartedAt != "" {
			if t, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt); err == nil {
				uptime = int64(time.Since(t).Seconds())
			}
		}
	}

	// Disk = data directory size
	diskBytes := getDirSize(m.dataDirectory, serverID)

	// Get actual state from Docker, not just in-memory cache
	actualState := sc.Status
	if err == nil && inspect.State != nil {
		if inspect.State.Running {
			actualState = "running"
		} else if inspect.State.OOMKilled {
			actualState = "crashed"
		} else if inspect.State.ExitCode != 0 {
			actualState = "crashed"
		} else {
			actualState = "stopped"
		}
		// Sync in-memory cache
		sc.Status = actualState
	}

	return map[string]interface{}{
		"memory_bytes":       memUsage,
		"memory_limit_bytes": memLimit,
		"cpu_absolute":       cpuPercent,
		"network": map[string]interface{}{
			"rx_bytes": rxBytes,
			"tx_bytes": txBytes,
		},
		"uptime":     uptime,
		"state":      actualState,
		"disk_bytes": diskBytes,
	}, nil
}

func getDirSize(basePath, serverID string) uint64 {
	dirPath := basePath + "/" + serverID
	var size uint64
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		if entry.IsDir() {
			size += getDirSizeRecursive(dirPath+"/"+entry.Name())
		} else {
			info, err := entry.Info()
			if err == nil {
				size += uint64(info.Size())
			}
		}
	}
	return size
}

func getDirSizeRecursive(path string) uint64 {
	var size uint64
	entries, err := os.ReadDir(path)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		if entry.IsDir() {
			size += getDirSizeRecursive(path+"/"+entry.Name())
		} else {
			info, err := entry.Info()
			if err == nil {
				size += uint64(info.Size())
			}
		}
	}
	return size
}

func (m *Manager) GetEvents(serverID string) []ServerEvent {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return sc.Events
}

func (m *Manager) ListAll(ctx context.Context) ([]*ServerContainer, error) {
	containers, err := m.client.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(filters.Arg("label", "troxe.managed=true")),
	})
	if err != nil {
		return nil, err
	}

	var result []*ServerContainer
	for _, c := range containers {
		serverID := ""
		for k, v := range c.Labels {
			if k == "troxe.server_id" {
				serverID = v
			}
		}
		result = append(result, &ServerContainer{
			ServerID:    serverID,
			ContainerID: c.ID,
			Status:      c.State,
			Image:       c.Image,
		})
	}

	return result, nil
}

// GetAllocatedStats returns the total memory (MB) and disk (MB) allocated to
// all Troxe-managed containers. Disk usage is reported as 0 when it cannot be
// determined cheaply; the panel tolerates a zero value.
func (m *Manager) GetAllocatedStats(ctx context.Context) (memoryMb int64, diskMb int64) {
	containers, err := m.ListAll(ctx)
	if err != nil {
		return 0, 0
	}

	for _, c := range containers {
		info, err := m.client.ContainerInspect(ctx, c.ContainerID)
		if err != nil {
			continue
		}
		if info.HostConfig != nil && info.HostConfig.Memory > 0 {
			memoryMb += info.HostConfig.Memory / (1024 * 1024)
		}
	}

	return memoryMb, diskMb
}

type PortBinding struct {
	HostPort      int `json:"host_port"`
	ContainerPort int `json:"container_port"`
}

type CreateOptions struct {
	ServerID    string
	Image       string
	Startup     string
	Environment map[string]string
	MemoryBytes int64
	CpuPercent  float64
	PidLimit    int64
	DataPath    string
	Ports       []PortBinding
	AutoRestart bool
}

// extractMainFile tries to extract the main file from a startup command
// e.g. "node server.js" → "server.js", "java -jar server.jar" → "server.jar"
func extractMainFile(startup string) string {
	trimmed := strings.TrimSpace(startup)
	parts := strings.Fields(trimmed)
	if len(parts) == 0 {
		return ""
	}

	// Skip common interpreters/runtimes
	interpreters := map[string]bool{
		"node": true, "python": true, "python3": true, "java": true,
		"ruby": true, "php": true, "dotnet": true, "go": true,
		"bash": true, "sh": true, "zsh": true, "./start.sh": true,
	}

	// If starts with "./" it's likely the file itself
	if strings.HasPrefix(parts[0], "./") {
		return parts[0]
	}

	// For "node server.js", "python main.py", etc.
	if len(parts) >= 2 && interpreters[parts[0]] {
		return parts[1]
	}

	// For "java -jar server.jar" — find the .jar after -jar
	for i, part := range parts {
		if part == "-jar" && i+1 < len(parts) {
			return parts[i+1]
		}
	}

	// For dotnet: "dotnet run --project ." or "dotnet MyServer.dll"
	if parts[0] == "dotnet" {
		for i, part := range parts {
			if part == "--project" && i+1 < len(parts) {
				return ""
			}
			if strings.HasSuffix(part, ".dll") {
				return part
			}
		}
	}

	return ""
}

// chownRecursive recursively changes ownership of a directory tree.
func chownRecursive(path string, uid, gid int) error {
	return filepath.Walk(path, func(name string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		return os.Chown(name, uid, gid)
	})
}

// ExecWithUser runs a command inside a container as a specific user.
func (m *Manager) ExecWithUser(ctx context.Context, serverID string, cmd []string, user string) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		User:         user,
	}

	execResp, err := m.client.ContainerExecCreate(ctx, sc.ContainerID, execConfig)
	if err != nil {
		return "", err
	}

	hijacked, err := m.client.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", err
	}
	defer hijacked.Close()

	data, err := io.ReadAll(hijacked.Reader)
	if err != nil {
		return "", err
	}

	return string(data), nil
}

// ExecWithUserRunning is like ExecWithUser but ensures the container is running first.
// If the container is stopped, it starts it, runs the command, then stops it.
func (m *Manager) ExecWithUserRunning(ctx context.Context, serverID string, cmd []string, user string) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	// Check if running
	inspect, err := m.client.ContainerInspect(ctx, sc.ContainerID)
	if err != nil {
		return "", err
	}

	wasRunning := inspect.State != nil && inspect.State.Running
	if !wasRunning {
		if err := m.client.ContainerStart(ctx, sc.ContainerID, container.StartOptions{}); err != nil {
			return "", fmt.Errorf("failed to start container for exec: %w", err)
		}
		defer func() {
			timeout := 5
			m.client.ContainerStop(context.Background(), sc.ContainerID, container.StopOptions{Timeout: &timeout})
		}()
	}

	return m.ExecWithUser(ctx, serverID, cmd, user)
}

// buildStartupWrapper wraps the startup command with a pre-check
func buildStartupWrapper(startup, mainFile string) string {
	if mainFile == "" {
		return startup
	}

	// Build a wrapper that checks if the file exists before running
	return fmt.Sprintf(
		`if [ ! -f %q ]; then echo ""; echo "=========================================="; echo "  ERROR: Main file not found: %s"; echo "  Expected location: /home/container/%s"; echo ""; echo "  Files in /home/container:"; ls -la 2>/dev/null; echo "=========================================="; exit 1; fi; %s`,
		mainFile, mainFile, mainFile, startup,
	)
}
