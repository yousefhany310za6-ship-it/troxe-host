package container

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
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

	return &Manager{
		client:     cli,
		containers: make(map[string]*ServerContainer),
	}, nil
}

func (m *Manager) Create(ctx context.Context, opts CreateOptions) (*ServerContainer, error) {
	// Pull image if not exists
	_, err := m.client.ImagePull(ctx, opts.Image, types.ImagePullOptions{})
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

	// Container config
	containerConfig := &container.Config{
		Image:        opts.Image,
		Env:          env,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/home/container",
		User:         "1000:1000",
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
		RestartPolicy: container.NeverRestart(),
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

	data, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}

	return string(data), nil
}

func (m *Manager) Exec(ctx context.Context, serverID string, cmd []string) (string, error) {
	m.mu.RLock()
	sc, ok := m.containers[serverID]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("container not found for server %s", serverID)
	}

	execConfig := types.ExecConfig{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		User:         "1000:1000",
	}

	execResp, err := m.client.ContainerExecCreate(ctx, sc.ContainerID, execConfig)
	if err != nil {
		return "", err
	}

	hijacked, err := m.client.ContainerExecAttach(ctx, execResp.ID, types.ExecStartCheck{})
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

type CreateOptions struct {
	ServerID    string
	Image       string
	Startup     string
	Environment map[string]string
	MemoryBytes int64
	CpuPercent  float64
	PidLimit    int
	DataPath    string
	Ports       []int
}
