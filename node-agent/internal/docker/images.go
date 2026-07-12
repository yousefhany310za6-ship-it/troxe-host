package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

type ImageManager struct {
	client *client.Client
	mu     sync.RWMutex
	pulls  map[string]*PullTask
}

type PullTask struct {
	ID        string     `json:"id"`
	Image     string     `json:"image"`
	Status    string     `json:"status"`
	Progress  string     `json:"progress"`
	Error     string     `json:"error,omitempty"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
}

type ImageInfo struct {
	ID           string   `json:"id"`
	Tags         []string `json:"tags"`
	Size         int64    `json:"size"`
	Created      int64    `json:"created"`
	Containers   int64    `json:"containers"`
	ParentID     string   `json:"parent_id"`
	SharedSize   int64    `json:"shared_size"`
	VirtualSize  int64    `json:"virtual_size"`
	Labels       map[string]string `json:"labels"`
}

type ImageHistoryItem struct {
	ID        string   `json:"id"`
	CreatedBy string   `json:"created_by"`
	Tags      []string `json:"tags"`
	Size      int64    `json:"size"`
	Comment   string   `json:"comment"`
}

func NewImageManager(cli *client.Client) *ImageManager {
	return &ImageManager{
		client: cli,
		pulls:  make(map[string]*PullTask),
	}
}

func (m *ImageManager) ListImages(ctx context.Context) ([]ImageInfo, error) {
	images, err := m.client.ImageList(ctx, image.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list images: %w", err)
	}

	result := make([]ImageInfo, 0, len(images))
	for _, img := range images {
		tags := img.RepoTags
		if tags == nil {
			tags = []string{}
		}
		cleanTags := make([]string, 0, len(tags))
		for _, t := range tags {
			if t != "" {
				cleanTags = append(cleanTags, t)
			}
		}

		result = append(result, ImageInfo{
			ID:          img.ID,
			Tags:        cleanTags,
			Size:        img.Size,
			Created:     img.Created,
			Containers:  img.Containers,
			ParentID:    img.ParentID,
			SharedSize:  img.SharedSize,
			VirtualSize: img.VirtualSize,
			Labels:      img.Labels,
		})
	}

	return result, nil
}

func (m *ImageManager) PullImage(ctx context.Context, imageName string) *PullTask {
	taskID := fmt.Sprintf("pull-%d", time.Now().UnixNano())

	task := &PullTask{
		ID:        taskID,
		Image:     imageName,
		Status:    "pulling",
		StartedAt: time.Now(),
	}

	m.mu.Lock()
	m.pulls[taskID] = task
	m.mu.Unlock()

	go m.doPull(task)

	return task
}

func (m *ImageManager) GetPullStatus(taskID string) *PullTask {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.pulls[taskID]
}

func (m *ImageManager) doPull(task *PullTask) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	reader, err := m.client.ImagePull(ctx, task.Image, image.PullOptions{})
	if err != nil {
		m.mu.Lock()
		task.Status = "error"
		task.Error = err.Error()
		now := time.Now()
		task.EndedAt = &now
		m.mu.Unlock()
		return
	}
	defer reader.Close()

	decoder := json.NewDecoder(reader)
	for {
		var event map[string]interface{}
		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			m.mu.Lock()
			task.Status = "error"
			task.Error = err.Error()
			now := time.Now()
			task.EndedAt = &now
			m.mu.Unlock()
			return
		}

		if status, ok := event["status"].(string); ok {
			progress := ""
			if detail, ok := event["progress"].(string); ok {
				progress = detail
			}

			m.mu.Lock()
			task.Status = status
			task.Progress = progress
			m.mu.Unlock()
		}
	}

	m.mu.Lock()
	task.Status = "completed"
	now := time.Now()
	task.EndedAt = &now
	m.mu.Unlock()
}

func (m *ImageManager) RemoveImage(ctx context.Context, imageID string, force bool) error {
	_, err := m.client.ImageRemove(ctx, imageID, image.RemoveOptions{
		Force: force,
	})
	if err != nil {
		return fmt.Errorf("failed to remove image: %w", err)
	}
	return nil
}

func (m *ImageManager) GetImageHistory(ctx context.Context, imageID string) ([]ImageHistoryItem, error) {
	history, err := m.client.ImageHistory(ctx, imageID)
	if err != nil {
		return nil, fmt.Errorf("failed to get image history: %w", err)
	}

	result := make([]ImageHistoryItem, 0, len(history))
	for _, h := range history {
		tags := h.Tags
		if tags == nil {
			tags = []string{}
		}
		result = append(result, ImageHistoryItem{
			ID:        h.ID,
			CreatedBy: h.CreatedBy,
			Tags:      tags,
			Size:      h.Size,
			Comment:   strings.TrimSpace(h.Comment),
		})
	}

	return result, nil
}
