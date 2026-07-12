"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Egg,
  Container,
  Terminal,
  Plus,
  Pencil,
  Trash2,
  X,
  Variable,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EggType {
  id: string;
  name: string;
  nest_id: string;
  nest_name: string;
  docker_image: string;
  startup_command: string;
  install_script: string | null;
  variables: any[];
  config_files: any[];
  max_databases: number;
  max_allocations: number;
  max_backups: number;
  default_memory_mb: number;
  default_disk_mb: number;
  default_cpu_percent: number;
  default_pid_limit: number;
  description: string | null;
}

interface Nest {
  id: string;
  name: string;
}

interface EggForm {
  name: string;
  nestId: string;
  dockerImage: string;
  startupCommand: string;
  installScript: string;
  variables: { name: string; default: string; description: string }[];
  configFiles: { path: string; content: string }[];
  maxDatabases: number;
  maxAllocations: number;
  maxBackups: number;
  defaultMemoryMb: number;
  defaultDiskMb: number;
  defaultCpuPercent: number;
  defaultPidLimit: number;
}

const emptyForm: EggForm = {
  name: "",
  nestId: "",
  dockerImage: "",
  startupCommand: "",
  installScript: "",
  variables: [],
  configFiles: [],
  maxDatabases: 0,
  maxAllocations: 1,
  maxBackups: 5,
  defaultMemoryMb: 1024,
  defaultDiskMb: 10240,
  defaultCpuPercent: 100,
  defaultPidLimit: 1024,
};

export default function EggsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editEgg, setEditEgg] = useState<EggType | null>(null);
  const [form, setForm] = useState<EggForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ eggs: EggType[] }>("/api/v1/eggs", (url) =>
    fetchApi<{ eggs: EggType[] }>(url)
  );

  const { data: nestData } = useSWR<{ nests: Nest[] }>(
    "/api/v1/nests",
    (url) => fetchApi<{ nests: Nest[] }>(url)
  );

  const eggs = data?.eggs ?? [];
  const nests = nestData?.nests ?? [];

  const grouped = eggs.reduce<Record<string, EggType[]>>((acc, egg) => {
    const nest = egg.nest_name;
    if (!acc[nest]) acc[nest] = [];
    acc[nest].push(egg);
    return acc;
  }, {});

  const nestNames = Object.keys(grouped).sort();

  const openCreate = () => {
    setEditEgg(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (egg: EggType) => {
    setEditEgg(egg);
    const variables = Array.isArray(egg.variables) ? egg.variables : [];
    const configFiles = Array.isArray(egg.config_files) ? egg.config_files : [];
    setForm({
      name: egg.name,
      nestId: egg.nest_id,
      dockerImage: egg.docker_image,
      startupCommand: egg.startup_command,
      installScript: egg.install_script || "",
      variables: variables.map((v: any) => ({
        name: v.name || "",
        default: v.default || "",
        description: v.description || "",
      })),
      configFiles: configFiles.map((f: any) => ({
        path: f.path || "",
        content: f.content || "",
      })),
      maxDatabases: egg.max_databases,
      maxAllocations: egg.max_allocations,
      maxBackups: egg.max_backups,
      defaultMemoryMb: egg.default_memory_mb,
      defaultDiskMb: egg.default_disk_mb,
      defaultCpuPercent: egg.default_cpu_percent,
      defaultPidLimit: egg.default_pid_limit,
    });
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const payload = {
        name: form.name,
        nestId: form.nestId,
        dockerImage: form.dockerImage,
        startupCommand: form.startupCommand,
        installScript: form.installScript || undefined,
        variables: form.variables,
        configFiles: form.configFiles,
        maxDatabases: form.maxDatabases,
        maxAllocations: form.maxAllocations,
        maxBackups: form.maxBackups,
        defaultMemoryMb: form.defaultMemoryMb,
        defaultDiskMb: form.defaultDiskMb,
        defaultCpuPercent: form.defaultCpuPercent,
        defaultPidLimit: form.defaultPidLimit,
      };

      if (editEgg) {
        await fetchApi(`/api/v1/eggs/${editEgg.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi("/api/v1/eggs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      setEditEgg(null);
      setForm(emptyForm);
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to save egg");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete egg "${name}"? This cannot be undone.`)) return;
    try {
      await fetchApi(`/api/v1/eggs/${id}`, { method: "DELETE" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete egg");
    }
  };

  const updateVariable = (
    index: number,
    field: "name" | "default" | "description",
    value: string
  ) => {
    const vars = [...form.variables];
    vars[index] = { ...vars[index], [field]: value };
    setForm({ ...form, variables: vars });
  };

  const addVariable = () => {
    setForm({
      ...form,
      variables: [...form.variables, { name: "", default: "", description: "" }],
    });
  };

  const removeVariable = (index: number) => {
    setForm({
      ...form,
      variables: form.variables.filter((_, i) => i !== index),
    });
  };

  const updateConfigFile = (
    index: number,
    field: "path" | "content",
    value: string
  ) => {
    const files = [...form.configFiles];
    files[index] = { ...files[index], [field]: value };
    setForm({ ...form, configFiles: files });
  };

  const addConfigFile = () => {
    setForm({
      ...form,
      configFiles: [...form.configFiles, { path: "", content: "" }],
    });
  };

  const removeConfigFile = (index: number) => {
    setForm({
      ...form,
      configFiles: form.configFiles.filter((_, i) => i !== index),
    });
  };

  const inputClass =
    "w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelClass = "block text-sm font-medium mb-1.5";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eggs</h1>
          <p className="text-muted-foreground">
            Manage egg configurations for game servers
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Egg
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
          <Card className="w-full max-w-2xl mx-4 my-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  {editEgg ? "Edit Egg" : "Create Egg"}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      className={inputClass}
                      placeholder="Minecraft"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Nest</label>
                    <select
                      required
                      value={form.nestId}
                      onChange={(e) =>
                        setForm({ ...form, nestId: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">Select nest</option>
                      {nests.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Docker Image</label>
                  <input
                    type="text"
                    required
                    value={form.dockerImage}
                    onChange={(e) =>
                      setForm({ ...form, dockerImage: e.target.value })
                    }
                    className={inputClass}
                    placeholder="itzg/minecraft-server:latest"
                  />
                </div>
                <div>
                  <label className={labelClass}>Startup Command</label>
                  <input
                    type="text"
                    required
                    value={form.startupCommand}
                    onChange={(e) =>
                      setForm({ ...form, startupCommand: e.target.value })
                    }
                    className={inputClass}
                    placeholder="java -Xms512M -Xmx512M -jar server.jar nogui"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Install Script (optional)
                  </label>
                  <textarea
                    value={form.installScript}
                    onChange={(e) =>
                      setForm({ ...form, installScript: e.target.value })
                    }
                    className={inputClass}
                    placeholder="#!/bin/bash&#10;apt-get update && apt-get install -y wget"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Default Memory (MB)</label>
                    <input
                      type="number"
                      min={128}
                      value={form.defaultMemoryMb}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultMemoryMb: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Default Disk (MB)</label>
                    <input
                      type="number"
                      min={128}
                      value={form.defaultDiskMb}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultDiskMb: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Default CPU %</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.defaultCpuPercent}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultCpuPercent: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>PID Limit</label>
                    <input
                      type="number"
                      min={64}
                      value={form.defaultPidLimit}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultPidLimit: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Max Databases</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxDatabases}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxDatabases: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max Allocations</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxAllocations}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxAllocations: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max Backups</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxBackups}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxBackups: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Variables Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Variables
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addVariable}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  {form.variables.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No variables defined
                    </p>
                  )}
                  {form.variables.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3"
                    >
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Name"
                          value={v.name}
                          onChange={(e) =>
                            updateVariable(i, "name", e.target.value)
                          }
                          className={inputClass}
                        />
                        <input
                          type="text"
                          placeholder="Default"
                          value={v.default}
                          onChange={(e) =>
                            updateVariable(i, "default", e.target.value)
                          }
                          className={inputClass}
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={v.description}
                          onChange={(e) =>
                            updateVariable(i, "description", e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariable(i)}
                        className="text-muted-foreground hover:text-destructive mt-2"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Config Files Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Config Files
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addConfigFile}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  {form.configFiles.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No config files defined
                    </p>
                  )}
                  {form.configFiles.map((f, i) => (
                    <div
                      key={i}
                      className="space-y-2 bg-secondary/50 rounded-lg p-3"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          placeholder="File path (e.g. server.properties)"
                          value={f.path}
                          onChange={(e) =>
                            updateConfigFile(i, "path", e.target.value)
                          }
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => removeConfigFile(i)}
                          className="text-muted-foreground hover:text-destructive mt-2"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        placeholder="File content"
                        value={f.content}
                        onChange={(e) =>
                          updateConfigFile(i, "content", e.target.value)
                        }
                        className={inputClass}
                        rows={3}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting
                      ? "Saving..."
                      : editEgg
                      ? "Save Changes"
                      : "Create Egg"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-5 bg-secondary rounded w-1/4" />
                <div className="h-16 bg-secondary rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load eggs. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : nestNames.length > 0 ? (
        <div className="space-y-6">
          {nestNames.map((nestName) => (
            <div key={nestName} className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">
                {nestName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grouped[nestName].map((egg) => (
                  <Card key={egg.id}>
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Egg className="h-4 w-4 text-purple-400" />
                          <h3 className="font-semibold">{egg.name}</h3>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(egg)}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(egg.id, egg.name)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Container className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">
                          {egg.docker_image}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Terminal className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs truncate">
                          {egg.startup_command}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {egg.default_memory_mb}MB
                        </Badge>
                        <Badge variant="secondary">
                          {egg.default_disk_mb}MB
                        </Badge>
                        <Badge variant="secondary">
                          {egg.default_cpu_percent}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Egg className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No eggs available
            </h3>
            <p className="text-muted-foreground mb-4">
              Create an egg configuration to get started.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Egg
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
