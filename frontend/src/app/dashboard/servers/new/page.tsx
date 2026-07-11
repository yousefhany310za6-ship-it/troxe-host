"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

interface Egg {
  id: string;
  name: string;
  startup_command: string;
  default_memory_mb: number;
  default_disk_mb: number;
}

interface Node {
  id: string;
  name: string;
  status: string;
}

export default function NewServerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [eggId, setEggId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [memoryMb, setMemoryMb] = useState("1024");
  const [diskMb, setDiskMb] = useState("5120");
  const [startupCommand, setStartupCommand] = useState("");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    []
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: eggData } = useSWR<{ eggs: Egg[] }>("/api/v1/eggs", (url) =>
    fetchApi<{ eggs: Egg[] }>(url)
  );

  const { data: nodeData } = useSWR<{ nodes: Node[] }>(
    "/api/v1/nodes",
    (url) => fetchApi<{ nodes: Node[] }>(url)
  );

  const eggs = eggData?.eggs ?? [];
  const nodes = nodeData?.nodes ?? [];

  const selectedEgg = eggs.find((e) => e.id === eggId);

  useEffect(() => {
    if (selectedEgg) {
      setStartupCommand(selectedEgg.startup_command);
      setMemoryMb(String(selectedEgg.default_memory_mb));
      setDiskMb(String(selectedEgg.default_disk_mb));
    }
  }, [selectedEgg]);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    const updated = [...envVars];
    updated[index][field] = val;
    setEnvVars(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    const BLOCKED_KEYS = ["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty"];
    const envObject: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      const k = key.trim();
      if (k && !BLOCKED_KEYS.includes(k)) envObject[k] = value;
    });

    try {
      const result = await fetchApi<{ server: { id: string } }>(
        "/api/v1/servers",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            eggId,
            nodeId,
            memoryMb: Number(memoryMb),
            diskMb: Number(diskMb),
            startupCommand: startupCommand || undefined,
            envVars:
              Object.keys(envObject).length > 0 ? envObject : undefined,
          }),
        }
      );
      router.push(`/dashboard/servers/${result.server.id}`);
    } catch (err: any) {
      setFormError(err.message || "Failed to create server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href="/dashboard/servers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Servers
        </Link>
        <h1 className="text-2xl font-bold">Create Server</h1>
        <p className="text-muted-foreground">Deploy a new game server</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Server Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="My Server"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Egg
                </label>
                <select
                  required
                  value={eggId}
                  onChange={(e) => setEggId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select egg</option>
                  {eggs.map((egg) => (
                    <option key={egg.id} value={egg.id}>
                      {egg.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Node
                </label>
                <select
                  required
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select node</option>
                  {nodes
                    .filter((n) => n.status === "online")
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Memory (MB)
                </label>
                <input
                  type="number"
                  required
                  min={128}
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Disk (MB)
                </label>
                <input
                  type="number"
                  required
                  min={512}
                  value={diskMb}
                  onChange={(e) => setDiskMb(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Startup Command
              </label>
              <input
                type="text"
                value={startupCommand}
                onChange={(e) => setStartupCommand(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Pre-filled from egg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">
                  Environment Variables
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addEnvVar}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {envVars.map((env, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={env.key}
                      onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                      className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="KEY"
                    />
                    <input
                      type="text"
                      value={env.value}
                      onChange={(e) =>
                        updateEnvVar(i, "value", e.target.value)
                      }
                      className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="value"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {envVars.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No environment variables added.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/servers">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Server"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
