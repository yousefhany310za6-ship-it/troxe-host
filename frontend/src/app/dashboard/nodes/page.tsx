"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Network,
  Plus,
  Trash2,
  X,
  Server as ServerIcon,
  MemoryStick,
  HardDrive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Node {
  id: string;
  name: string;
  location_name: string;
  status: string;
  maintenance_mode: boolean;
  fqdn: string;
  public_ip: string;
  total_memory_mb: number;
  allocated_memory_mb: number;
  total_disk_mb: number;
  allocated_disk_mb: number;
  server_count: number;
}

interface Location {
  id: string;
  name: string;
}

function formatMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function getNodeStatus(node: Node) {
  if (node.maintenance_mode) return "maintenance";
  return node.status;
}

const statusVariant: Record<string, "success" | "destructive" | "warning"> = {
  online: "success",
  offline: "destructive",
  maintenance: "warning",
};

export default function NodesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    locationId: "",
    fqdn: "",
    publicIp: "",
    totalMemoryMb: "2048",
    totalDiskMb: "10240",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ nodes: Node[] }>("/api/v1/nodes", (url) =>
    fetchApi<{ nodes: Node[] }>(url)
  );

  const { data: locData } = useSWR<{ locations: Location[] }>(
    showAdd ? "/api/v1/locations" : null,
    (url) => fetchApi<{ locations: Location[] }>(url)
  );

  const nodes = data?.nodes ?? [];
  const locations = locData?.locations ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await fetchApi("/api/v1/nodes", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          locationId: form.locationId,
          fqdn: form.fqdn,
          publicIp: form.publicIp,
          totalMemoryMb: Number(form.totalMemoryMb),
          totalDiskMb: Number(form.totalDiskMb),
        }),
      });
      setShowAdd(false);
      setForm({
        name: "",
        locationId: "",
        fqdn: "",
        publicIp: "",
        totalMemoryMb: "2048",
        totalDiskMb: "10240",
      });
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to create node");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete node "${name}"? This cannot be undone.`)) return;
    try {
      await fetchApi(`/api/v1/nodes/${id}`, { method: "DELETE" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete node");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nodes</h1>
          <p className="text-muted-foreground">
            Manage your infrastructure nodes
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Node
        </Button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Add Node</h2>
                <button
                  onClick={() => setShowAdd(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Node 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Location
                  </label>
                  <select
                    required
                    value={form.locationId}
                    onChange={(e) =>
                      setForm({ ...form, locationId: e.target.value })
                    }
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select location</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    FQDN
                  </label>
                  <input
                    type="text"
                    required
                    value={form.fqdn}
                    onChange={(e) =>
                      setForm({ ...form, fqdn: e.target.value })
                    }
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="node1.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Public IP
                  </label>
                  <input
                    type="text"
                    required
                    value={form.publicIp}
                    onChange={(e) =>
                      setForm({ ...form, publicIp: e.target.value })
                    }
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Total Memory (MB)
                    </label>
                    <input
                      type="number"
                      required
                      min={512}
                      value={form.totalMemoryMb}
                      onChange={(e) =>
                        setForm({ ...form, totalMemoryMb: e.target.value })
                      }
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Total Disk (MB)
                    </label>
                    <input
                      type="number"
                      required
                      min={1024}
                      value={form.totalDiskMb}
                      onChange={(e) =>
                        setForm({ ...form, totalDiskMb: e.target.value })
                      }
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowAdd(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Node"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-5 bg-secondary rounded w-1/3" />
                <div className="h-4 bg-secondary rounded w-1/2" />
                <div className="h-20 bg-secondary rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : fetchError ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load nodes. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : nodes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const status = getNodeStatus(node);
            const memoryPercent =
              node.total_memory_mb > 0
                ? (node.allocated_memory_mb / node.total_memory_mb) * 100
                : 0;
            const diskPercent =
              node.total_disk_mb > 0
                ? (node.allocated_disk_mb / node.total_disk_mb) * 100
                : 0;
            return (
              <Card key={node.id}>
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">{node.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {node.location_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[status] ?? "secondary"}>
                        {status}
                      </Badge>
                      <button
                        onClick={() => handleDelete(node.id, node.name)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground font-mono">
                    {node.fqdn}
                  </p>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ServerIcon className="h-3.5 w-3.5" />
                    {node.server_count} server
                    {node.server_count !== 1 ? "s" : ""}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MemoryStick className="h-3.5 w-3.5" />
                        Memory
                      </div>
                      <span>
                        {formatMb(node.allocated_memory_mb)} /{" "}
                        {formatMb(node.total_memory_mb)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{
                          width: `${Math.min(memoryPercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <HardDrive className="h-3.5 w-3.5" />
                        Disk
                      </div>
                      <span>
                        {formatMb(node.allocated_disk_mb)} /{" "}
                        {formatMb(node.total_disk_mb)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{
                          width: `${Math.min(diskPercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No nodes available</h3>
            <p className="text-muted-foreground mb-4">
              Add a node to start hosting game servers.
            </p>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Node
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
