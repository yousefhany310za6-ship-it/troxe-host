"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Settings, Save, Trash2, AlertTriangle, Plus, X, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ServerSettings {
  name: string;
  startupCommand: string;
  memoryLimit: number;
  cpuLimit: number;
  diskLimit: number;
  environment: Record<string, string>;
}

export default function SettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rootAdmin || user?.isAdmin;
  const { data, error, isLoading } = useSWR<{ server: ServerSettings }>(
    `/api/v1/servers/${id}/settings`,
    (url: string) => fetchApi<{ server: ServerSettings }>(url)
  );
  const settings = data?.server;

  const [name, setName] = useState("");
  const [startupCommand, setStartupCommand] = useState("");
  const [memoryLimit, setMemoryLimit] = useState(512);
  const [cpuLimit, setCpuLimit] = useState(100);
  const [diskLimit, setDiskLimit] = useState(1024);
  const [environment, setEnvironment] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setName(settings.name || "");
      setStartupCommand(settings.startup_command || settings.startupCommand || "");
      setMemoryLimit(settings.memory_mb || settings.memoryLimit || 512);
      setCpuLimit(settings.cpu_percent || settings.cpuLimit || 100);
      setDiskLimit(settings.disk_mb || settings.diskLimit || 1024);
      setEnvironment(
        settings.environment
          ? Object.entries(settings.environment).map(([key, value]) => ({ key, value: String(value) }))
          : []
      );
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const env: Record<string, string> = {};
      environment.forEach(({ key, value }) => {
        if (key.trim()) env[key] = value;
      });
      const body: Record<string, any> = { name, startup: startupCommand, environment: env };
      if (isAdmin) {
        body.memoryMb = memoryLimit;
        body.cpuPercent = cpuLimit;
        body.diskMb = diskLimit;
      }
      await fetchApi(`/api/v1/servers/${id}/settings`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure? This will permanently delete the server.")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}`, { method: "DELETE" });
      window.location.href = "/dashboard/servers";
    } catch {
    }
  }

  async function handleReinstall() {
    if (!confirm("Reinstall the server? All data will be lost.")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/reinstall`, { method: "POST" });
    } catch {
    }
  }

  function addEnvVar() {
    setEnvironment([...environment, { key: "", value: "" }]);
  }

  function removeEnvVar(index: number) {
    setEnvironment(environment.filter((_, i) => i !== index));
  }

  function updateEnvVar(index: number, field: "key" | "value", val: string) {
    const updated = [...environment];
    updated[index][field] = val;
    setEnvironment(updated);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-secondary rounded w-48 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-40 bg-secondary rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load server settings.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} variant={saved ? "default" : "default"}>
          {saved ? (
            <span className="flex items-center text-green-400"><Save className="h-4 w-4 mr-2" /> Saved!</span>
          ) : (
            <><Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Changes"}</>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic server configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Startup Command</label>
            <input
              type="text"
              value={startupCommand}
              onChange={(e) => setStartupCommand(e.target.value)}
              placeholder="node server.js"
              className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-muted-foreground">
              Command to run when the server starts. The main file must exist in the root directory.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {["node index.js", "python main.py", "java -jar server.jar", "./start.sh"].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setStartupCommand(ex)}
                  className="text-xs bg-secondary/50 hover:bg-secondary border border-border rounded px-2 py-1 font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resources</CardTitle>
              <CardDescription>Adjust resource allocation limits</CardDescription>
            </div>
            {!isAdmin && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-md">
                <Lock className="h-3 w-3" />
                Admin only
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Memory</label>
              <span className="text-sm text-muted-foreground">{memoryLimit} MB</span>
            </div>
            <input
              type="range"
              min={128}
              max={16384}
              step={128}
              value={memoryLimit}
              onChange={(e) => setMemoryLimit(Number(e.target.value))}
              disabled={!isAdmin}
              className="w-full accent-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">CPU</label>
              <span className="text-sm text-muted-foreground">{cpuLimit}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={400}
              step={10}
              value={cpuLimit}
              onChange={(e) => setCpuLimit(Number(e.target.value))}
              disabled={!isAdmin}
              className="w-full accent-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Disk</label>
              <span className="text-sm text-muted-foreground">{diskLimit} MB</span>
            </div>
            <input
              type="range"
              min={256}
              max={32768}
              step={256}
              value={diskLimit}
              onChange={(e) => setDiskLimit(Number(e.target.value))}
              disabled={!isAdmin}
              className="w-full accent-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>Set environment variables for the server</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addEnvVar}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {environment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No environment variables configured.</p>
          ) : (
            environment.map((env, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={env.key}
                  onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                  placeholder="KEY"
                  className="flex-1 min-w-0 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={env.value}
                  onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                  placeholder="value"
                  className="flex-1 min-w-0 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 text-destructive hover:text-destructive self-end sm:self-center flex-shrink-0"
                  onClick={() => removeEnvVar(i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible and destructive actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="font-medium">Reinstall Server</p>
              <p className="text-sm text-muted-foreground">Reset the server to its default state. All data will be lost.</p>
            </div>
            <Button variant="outline" onClick={handleReinstall}>
              Reinstall
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
            <div>
              <p className="font-medium text-destructive">Delete Server</p>
              <p className="text-sm text-muted-foreground">Permanently delete this server and all its data.</p>
            </div>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
