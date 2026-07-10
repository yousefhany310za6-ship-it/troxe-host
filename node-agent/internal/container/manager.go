package container

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"sync"

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
	client    *client.Client
	containers map[string]*ServerContainer
	mu        sync.RWMutex
}

type ServerContainer struct {
	ServerID    string
	ContainerID string
	Status      string
	Image       string
}

func NewManager(dockerSocket string) (*Manager, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+dockerSocket),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	m := &Manager{
		client:     cli,
		containers: make(map[string]*ServerContainer),
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
		m.containers[serverID] = &ServerContainer{
			ServerID:    serverID,
			ContainerID: c.ID,
			Status:      c.State,
			Image:       c.Image,
		}
		count++
	}

	if count > 0 {
		log.Printf("[container] restored %d container(s) from Docker", count)
	}
	return nil
}

func (m *Manager) Create(ctx context.Context, opts CreateOptions) (*ServerContainer, error) {
	// Ensure data directory exists
	if err := os.MkdirAll(opts.DataPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
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
		p := nat.Port(fmt.Sprintf("%d/tcp", port))
		exposedPorts[p] = struct{}{}
		// For UDP
		pu := nat.Port(fmt.Sprintf("%d/udp", port))
		exposedPorts[pu] = struct{}{}
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
		},
	}
	if opts.Startup != "" {
		containerConfig.Cmd = []string{"/bin/sh", "-c", opts.Startup}
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

	if err := m.client.ContainerStart(ctx, sc.ContainerID, container.StartOptions{}); err != nil {
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

	timeout := 30 // seconds
	if err := m.client.ContainerStop(ctx, sc.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}

	sc.Status = "stopped"
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
	if !ok {
		return fmt.Errorf("container not found for server %s", serverID)
	}

	if err := m.client.ContainerRemove(ctx, sc.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("failed to remove container: %w", err)
	}

	m.mu.Lock()
	delete(m.containers, serverID)
	m.mu.Unlock()

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

	// Disk (from block io)
	var diskBytes uint64
	if statsData.BlkioStats.IoServiceBytesRecursive != nil {
		for _, bio := range statsData.BlkioStats.IoServiceBytesRecursive {
			if bio.Op == "Read" {
				diskBytes += bio.Value
			}
		}
	}

	return map[string]interface{}{
		"memory_bytes":       memUsage,
		"memory_limit_bytes": memLimit,
		"cpu_absolute":       cpuPercent,
		"network": map[string]interface{}{
			"rx_bytes": rxBytes,
			"tx_bytes": txBytes,
		},
		"uptime":     0,
		"state":      sc.Status,
		"disk_bytes": diskBytes,
	}, nil
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

type CreateOptions struct {
	ServerID    string
	Image       string
	Startup     string
	Environment map[string]string
	MemoryBytes int64
	CpuPercent  float64
	PidLimit    int64
	DataPath    string
	Ports       []int
}
