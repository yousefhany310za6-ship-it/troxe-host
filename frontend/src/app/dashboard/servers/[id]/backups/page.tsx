"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Database, Plus, Download, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Backup {
  id: string;
  name: string;
  size_bytes: number;
  status: "building" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
}

interface BackupInfo {
  backups: Backup[];
  limit: number;
}

const statusVariant: Record<Backup["status"], "success" | "destructive" | "warning"> = {
  completed: "success",
  failed: "destructive",
  building: "warning",
};

const statusIcon: Record<Backup["status"], typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  building: Loader2,
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupsPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [creating, setCreating] = useState(false);

  const { data: info, error, isLoading, mutate } = useSWR<BackupInfo>(
    `/api/v1/servers/${id}/backups`,
    (url: string) => fetchApi<BackupInfo>(url)
  );

  async function handleCreate() {
    setCreating(true);
    try {
      await fetchApi(`/api/v1/servers/${id}/backups`, { method: "POST" });
      mutate();
    } catch {
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(backupId: string) {
    if (!confirm("Delete this backup?")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/backups/${backupId}`, { method: "DELETE" });
      mutate();
    } catch {
    }
  }

  const backups = info?.backups ?? [];
  const limit = info?.limit ?? 5;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backups</h1>
          <p className="text-sm text-muted-foreground">
            {backups.length} of {limit} backups used
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating || backups.length >= limit}>
          <Plus className="h-4 w-4 mr-2" />
          {creating ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading backups...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load backups.</p>
          ) : backups.length > 0 ? (
            <div className="space-y-3">
              {backups.map((backup) => {
                const StatusIcon = statusIcon[backup.status];
                return (
                  <div
                    key={backup.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-background border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <Database className="h-5 w-5 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <p className="font-medium">{backup.name}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{formatBytes(backup.size_bytes)}</span>
                          <span>&middot;</span>
                          <span>{new Date(backup.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusVariant[backup.status]}>
                        <StatusIcon className={`h-3 w-3 mr-1 ${backup.status === "building" ? "animate-spin" : ""}`} />
                        {backup.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {backup.status === "completed" && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(backup.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Database className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No backups yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
