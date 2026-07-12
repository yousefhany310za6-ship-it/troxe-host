"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Settings, Save, Trash2, AlertTriangle, Plus, X, Lock, ArrowRightFromLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ConfirmModal from "@/components/confirm-modal";

interface Transfer {
  id: string;
  server_id: string;
  old_node_id: string;
  new_node_id: string;
  old_allocation_id: string;
  new_allocation_id: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  old_node_name: string | null;
  new_node_name: string | null;
}

interface Node {
  id: string;
  name: string;
  fqdn: string;
}

interface Allocation {
  id: string;
  ip: string;
  port: number;
}

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
  const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedAllocationId, setSelectedAllocationId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<Transfer | null>(null);
  const [transferHistory, setTransferHistory] = useState<Transfer[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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
      const BLOCKED_KEYS = ["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty"];
      const env: Record<string, string> = {};
      environment.forEach(({ key, value }) => {
        const k = key.trim();
        if (k && !BLOCKED_KEYS.includes(k)) env[k] = value;
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
    setShowDeleteConfirm(false);
    try {
      await fetchApi(`/api/v1/servers/${id}`, { method: "DELETE" });
      window.location.href = "/dashboard/servers";
    } catch {
    }
  }

  async function handleReinstall() {
    setShowReinstallConfirm(false);
    setReinstalling(true);
    try {
      await fetchApi(`/api/v1/servers/${id}/reinstall`, { method: "POST" });
    } catch {
    } finally {
      setReinstalling(false);
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

  // --- Transfer functions ---

  async function loadTransferStatus() {
    try {
      const res = await fetchApi<{ transfer: Transfer }>(`/api/v1/servers/${id}/transfer`);
      setActiveTransfer(res.transfer);
    } catch {
      // No transfer
    }
    try {
      const res = await fetchApi<{ transfers: Transfer[] }>(`/api/v1/servers/${id}/transfers`);
      setTransferHistory(res.transfers);
    } catch {
      // No transfers
    }
  }

  useEffect(() => {
    loadTransferStatus();
  }, [id]);

  // Poll during active transfer
  useEffect(() => {
    if (!activeTransfer || activeTransfer.status === "completed" || activeTransfer.status === "failed") return;
    const interval = setInterval(loadTransferStatus, 5000);
    return () => clearInterval(interval);
  }, [activeTransfer?.status]);

  async function openTransferModal() {
    setSelectedNodeId("");
    setSelectedAllocationId("");
    setAllocations([]);
    try {
      const nodeRes = await fetchApi<{ nodes: Node[] }>("/api/v1/admin/nodes");
      setNodes(nodeRes.nodes || []);
    } catch {}
    setShowTransferModal(true);
  }

  async function onNodeSelect(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedAllocationId("");
    try {
      const res = await fetchApi<{ allocations: Allocation[] }>(`/api/v1/admin/nodes/${nodeId}/allocations?assigned=false`);
      setAllocations(res.allocations || []);
    } catch {
      setAllocations([]);
    }
  }

  async function handleTransfer() {
    if (!selectedNodeId || !selectedAllocationId) return;
    setTransferring(true);
    try {
      await fetchApi(`/api/v1/servers/${id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ newNodeId: selectedNodeId, newAllocationId: selectedAllocationId }),
      });
      setShowTransferModal(false);
      await loadTransferStatus();
    } catch {} finally {
      setTransferring(false);
    }
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
            <Button
              variant="outline"
              onClick={() => setShowReinstallConfirm(true)}
              disabled={reinstalling}
            >
              {reinstalling ? "Reinstalling..." : "Reinstall"}
            </Button>
          </div>
          {isAdmin && (
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="font-medium">Transfer Server</p>
                <p className="text-sm text-muted-foreground">Move this server to a different node. The server will be stopped during transfer.</p>
                {activeTransfer && activeTransfer.status === "transferring" && (
                  <p className="text-xs text-yellow-500 mt-1">Transfer in progress...</p>
                )}
                {activeTransfer && activeTransfer.status === "completed" && (
                  <p className="text-xs text-green-500 mt-1">Last transfer completed.</p>
                )}
                {activeTransfer && activeTransfer.status === "failed" && (
                  <p className="text-xs text-destructive mt-1">Last transfer failed: {activeTransfer.error}</p>
                )}
              </div>
              <div className="flex gap-2">
                {activeTransfer && activeTransfer.status === "transferring" ? (
                  <span className="text-sm text-yellow-500 px-3 py-1.5">Transferring...</span>
                ) : (
                  <Button variant="outline" onClick={openTransferModal}>
                    <ArrowRightFromLine className="h-4 w-4 mr-2" />
                    Transfer
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
            <div>
              <p className="font-medium text-destructive">Delete Server</p>
              <p className="text-sm text-muted-foreground">Permanently delete this server and all its data.</p>
            </div>
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      {transferHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transfer History</CardTitle>
                <CardDescription>Server migration history</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">From Node</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">To Node</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferHistory.map((t) => (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-2 px-3">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className="py-2 px-3">{t.old_node_name || t.old_node_id?.slice(0, 8)}</td>
                        <td className="py-2 px-3">{t.new_node_name || t.new_node_id?.slice(0, 8)}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            t.status === "completed" ? "bg-green-500/10 text-green-500" :
                            t.status === "failed" ? "bg-destructive/10 text-destructive" :
                            t.status === "transferring" ? "bg-yellow-500/10 text-yellow-500" :
                            "bg-secondary text-muted-foreground"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-destructive text-xs max-w-[200px] truncate">{t.error || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTransferModal(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <ArrowRightFromLine className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">Transfer Server</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Server will be stopped during transfer. This may take a while.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Node</label>
                <select
                  value={selectedNodeId}
                  onChange={(e) => onNodeSelect(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select a node...</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.name} ({n.fqdn})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Allocation on Target</label>
                <select
                  value={selectedAllocationId}
                  onChange={(e) => setSelectedAllocationId(e.target.value)}
                  disabled={!selectedNodeId}
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                >
                  <option value="">Select allocation...</option>
                  {allocations.map((a) => (
                    <option key={a.id} value={a.id}>{a.ip}:{a.port}</option>
                  ))}
                </select>
                {selectedNodeId && allocations.length === 0 && (
                  <p className="text-xs text-destructive">No free allocations on this node.</p>
                )}
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-xs text-yellow-500 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  Server will be stopped during transfer. This may take a while depending on the amount of data.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowTransferModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-yellow-600 text-white hover:bg-yellow-700"
                disabled={!selectedNodeId || !selectedAllocationId || transferring}
                onClick={handleTransfer}
              >
                {transferring ? "Transferring..." : "Transfer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reinstall Confirmation Modal */}
      <ConfirmModal
        open={showReinstallConfirm}
        title="Reinstall Server"
        description="This will reinstall the server. All data may be lost. Are you sure you want to continue?"
        confirmLabel="Reinstall"
        variant="warning"
        onConfirm={handleReinstall}
        onCancel={() => setShowReinstallConfirm(false)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Server"
        description="This will permanently delete this server and all of its data. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
