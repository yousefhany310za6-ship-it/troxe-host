"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Trash2,
  History,
  RefreshCw,
  X,
  Search,
} from "lucide-react";
import Link from "next/link";

interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: number;
  containers: number;
  parent_id: string;
  shared_size: number;
  labels: Record<string, string>;
}

interface PullTask {
  id: string;
  image: string;
  status: string;
  progress: string;
  error?: string;
  started_at: string;
  ended_at?: string;
}

interface ImageHistoryItem {
  id: string;
  created_by: string;
  tags: string[];
  size: number;
  comment: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTimestamp(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

function getImageName(tags: string[]) {
  if (tags.length === 0) return "<none>";
  const tag = tags.find((t) => !t.includes("<none")) || tags[0];
  return tag;
}

export default function NodeImagesPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullImage, setPullImage] = useState("");
  const [pullTaskId, setPullTaskId] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<PullTask | null>(null);
  const [pullError, setPullError] = useState("");
  const [pulling, setPulling] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DockerImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [historyImage, setHistoryImage] = useState<DockerImage | null>(null);
  const [history, setHistory] = useState<ImageHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ images: DockerImage[] }>(
    `/api/v1/nodes/${id}/images`,
    (url) => fetchApi<{ images: DockerImage[] }>(url)
  );

  const images = data?.images ?? [];
  const filteredImages = searchQuery
    ? images.filter(
        (img) =>
          getImageName(img.tags)
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          img.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : images;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handlePull() {
    if (!pullImage.trim()) return;
    setPulling(true);
    setPullError("");
    setPullStatus(null);

    try {
      const result = await fetchApi<{ task_id: string; status: string }>(
        `/api/v1/nodes/${id}/images/pull`,
        {
          method: "POST",
          body: JSON.stringify({ image: pullImage.trim() }),
        }
      );
      setPullTaskId(result.task_id);

      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchApi<PullTask>(
            `/api/v1/nodes/${id}/images/pull/${result.task_id}`
          );
          setPullStatus(status);
          if (
            status.status === "completed" ||
            status.status === "error"
          ) {
            stopPolling();
            setPulling(false);
            if (status.status === "completed") {
              mutate();
              setTimeout(() => {
                setShowPullModal(false);
                setPullImage("");
                setPullTaskId(null);
                setPullStatus(null);
              }, 1500);
            }
          }
        } catch {
          stopPolling();
          setPulling(false);
          setPullError("Failed to check pull status");
        }
      }, 1000);
    } catch (err: any) {
      setPullError(err.message || "Failed to start pull");
      setPulling(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetchApi(
        `/api/v1/nodes/${id}/images/${encodeURIComponent(deleteConfirm.id)}?force=true`,
        { method: "DELETE" }
      );
      setDeleteConfirm(null);
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete image");
    } finally {
      setDeleting(false);
    }
  }

  async function handleViewHistory(img: DockerImage) {
    setHistoryImage(img);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const result = await fetchApi<{ history: ImageHistoryItem[] }>(
        `/api/v1/nodes/${id}/images/${encodeURIComponent(img.id)}/history`
      );
      setHistory(result.history || []);
    } catch (err: any) {
      alert(err.message || "Failed to load image history");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href={`/dashboard/nodes/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Node
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Docker Images</h1>
            <p className="text-muted-foreground">
              Manage Docker images on this node
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowPullModal(true)}>
              <Download className="h-4 w-4 mr-1.5" />
              Pull Image
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search images..."
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredImages.length} image{filteredImages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-12 bg-secondary rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load Docker images. The node may be offline.
            </p>
          </CardContent>
        </Card>
      ) : filteredImages.length > 0 ? (
        <div className="space-y-2">
          {filteredImages.map((img) => (
            <Card key={img.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium truncate">
                      {getImageName(img.tags)}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{img.id.slice(0, 19)}</span>
                      <span>{formatBytes(img.size)}</span>
                      <span>{formatTimestamp(img.created)}</span>
                      {img.containers > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {img.containers} container{img.containers !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {img.tags.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {img.tags
                          .filter((t) => t !== getImageName(img.tags))
                          .slice(0, 5)
                          .map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono"
                            >
                              {tag}
                            </span>
                          ))}
                        {img.tags.length > 6 && (
                          <span className="text-xs text-muted-foreground">
                            +{img.tags.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewHistory(img)}
                      title="View layers"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(img)}
                      title="Delete image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "No matching images" : "No Docker images"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "Try a different search term."
                : "Pull a Docker image to get started."}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowPullModal(true)}>
                <Download className="h-4 w-4 mr-2" />
                Pull Image
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pull Modal */}
      {showPullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Pull Docker Image</h2>
                <button
                  onClick={() => {
                    stopPolling();
                    setShowPullModal(false);
                    setPullImage("");
                    setPullTaskId(null);
                    setPullStatus(null);
                    setPulling(false);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Image Name
                  </label>
                  <input
                    type="text"
                    value={pullImage}
                    onChange={(e) => setPullImage(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. nginx:latest, node:20-alpine"
                    disabled={pulling}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !pulling && pullImage.trim()) {
                        handlePull();
                      }
                    }}
                  />
                </div>

                {pullError && (
                  <p className="text-sm text-destructive">{pullError}</p>
                )}

                {pullStatus && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge
                        variant={
                          pullStatus.status === "completed"
                            ? "success"
                            : pullStatus.status === "error"
                            ? "destructive"
                            : "default"
                        }
                      >
                        {pullStatus.status}
                      </Badge>
                    </div>
                    {pullStatus.progress && (
                      <p className="text-xs font-mono text-muted-foreground">
                        {pullStatus.progress}
                      </p>
                    )}
                    {pullStatus.error && (
                      <p className="text-sm text-destructive">
                        {pullStatus.error}
                      </p>
                    )}
                    {pulling && pullStatus.status !== "completed" && pullStatus.status !== "error" && (
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full animate-pulse" style={{ width: "100%" }} />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      stopPolling();
                      setShowPullModal(false);
                      setPullImage("");
                      setPullTaskId(null);
                      setPullStatus(null);
                      setPulling(false);
                    }}
                  >
                    {pullStatus?.status === "completed" ? "Close" : "Cancel"}
                  </Button>
                  {pullStatus?.status !== "completed" && (
                    <Button
                      onClick={handlePull}
                      disabled={pulling || !pullImage.trim()}
                    >
                      {pulling ? "Pulling..." : "Pull"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-2">Delete Image</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete this image? This will force
                remove the image even if containers are using it.
              </p>
              <p className="font-mono text-sm bg-secondary rounded px-3 py-2 mb-4">
                {getImageName(deleteConfirm.tags)}
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Modal */}
      {historyImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <CardContent className="p-6 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Image Layers</h2>
                  <p className="text-sm text-muted-foreground font-mono">
                    {getImageName(historyImage.tags)}
                  </p>
                </div>
                <button
                  onClick={() => setHistoryImage(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 bg-secondary rounded animate-pulse" />
                    ))}
                  </div>
                ) : history.length > 0 ? (
                  <div className="space-y-1">
                    {history.map((item, i) => (
                      <div
                        key={`${item.id}-${i}`}
                        className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-secondary/50 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs truncate">
                            {item.created_by || "<empty>"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span>{formatBytes(item.size)}</span>
                            {item.tags.length > 0 && (
                              <span className="font-mono">
                                {item.tags.join(", ")}
                              </span>
                            )}
                          </div>
                          {item.comment && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No history available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
