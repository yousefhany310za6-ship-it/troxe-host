"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Database, Plus, Trash2, Copy, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ServerDatabase {
  id: string;
  name: string;
  username: string;
  host_name: string;
  db_host: string;
  db_port: number;
  remote: string;
  created_at: string;
}

interface CreatedDb extends ServerDatabase {
  password: string;
  host: string;
  port: number;
}

export default function ServerDatabasesPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [creating, setCreating] = useState(false);
  const [createdDb, setCreatedDb] = useState<CreatedDb | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ databases: ServerDatabase[] }>(
    `/api/v1/servers/${id}/databases`,
    (url: string) => fetchApi<{ databases: ServerDatabase[] }>(url)
  );

  const databases = data?.databases ?? [];

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await fetchApi<{ database: CreatedDb }>(
        `/api/v1/servers/${id}/databases`,
        { method: "POST" }
      );
      setCreatedDb(result.database);
      mutate();
    } catch {
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(dbId: string) {
    if (!confirm("Delete this database? This cannot be undone.")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/databases/${dbId}`, { method: "DELETE" });
      mutate();
    } catch {
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Databases</h1>
          <p className="text-sm text-muted-foreground">
            {databases.length} database{databases.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          <Plus className="h-4 w-4 mr-2" />
          {creating ? "Creating..." : "Create Database"}
        </Button>
      </div>

      {createdDb && (
        <Card className="border-emerald-500/50 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              Database Created
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Save these credentials now. The password will not be shown again.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-background rounded-lg px-4 py-2">
                <span className="text-sm text-muted-foreground">Host</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm">{createdDb.host}:{createdDb.port}</code>
                  <button onClick={() => copyToClipboard(`${createdDb.host}:${createdDb.port}`, "host")}>
                    {copied === "host" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between bg-background rounded-lg px-4 py-2">
                <span className="text-sm text-muted-foreground">Database</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm">{createdDb.name}</code>
                  <button onClick={() => copyToClipboard(createdDb.name, "dbname")}>
                    {copied === "dbname" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between bg-background rounded-lg px-4 py-2">
                <span className="text-sm text-muted-foreground">Username</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm">{createdDb.username}</code>
                  <button onClick={() => copyToClipboard(createdDb.username, "user")}>
                    {copied === "user" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between bg-background rounded-lg px-4 py-2">
                <span className="text-sm text-muted-foreground">Password</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm">{createdDb.password}</code>
                  <button onClick={() => copyToClipboard(createdDb.password, "pass")}>
                    {copied === "pass" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCreatedDb(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Database List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading databases...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load databases.</p>
          ) : databases.length > 0 ? (
            <div className="space-y-3">
              {databases.map((db) => (
                <div
                  key={db.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-background border border-border"
                >
                  <div className="flex items-center gap-4">
                    <Database className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="font-medium font-mono">{db.name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>user: {db.username}</span>
                        <span>&middot;</span>
                        <span>{db.db_host}:{db.db_port}</span>
                        <span>&middot;</span>
                        <span>{new Date(db.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(db.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Database className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No databases yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
