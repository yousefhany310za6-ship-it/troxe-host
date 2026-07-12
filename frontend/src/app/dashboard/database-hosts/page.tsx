"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Database, Plus, X, Trash2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DatabaseHost {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password_hash: string;
  max_databases: number;
  database_count: string;
  created_at: string;
}

const defaultForm = {
  name: "",
  host: "",
  port: 3306,
  username: "",
  password: "",
  maxDatabases: 50,
};

export default function DatabaseHostsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<DatabaseHost | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{ databaseHosts: DatabaseHost[] }>(
    "/api/v1/database-hosts",
    (url) => fetchApi<{ databaseHosts: DatabaseHost[] }>(url)
  );

  const hosts = data?.databaseHosts ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await fetchApi("/api/v1/database-hosts", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm(defaultForm);
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to create database host");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEdit) return;
    setSubmitting(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        host: form.host,
        port: form.port,
        username: form.username,
        maxDatabases: form.maxDatabases,
      };
      if (form.password) body.password = form.password;
      await fetchApi(`/api/v1/database-hosts/${showEdit.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setShowEdit(null);
      setForm(defaultForm);
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to update database host");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (hostId: string) => {
    if (!confirm("Delete this database host?")) return;
    try {
      await fetchApi(`/api/v1/database-hosts/${hostId}`, { method: "DELETE" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  const openEdit = (host: DatabaseHost) => {
    setForm({
      name: host.name,
      host: host.host,
      port: host.port,
      username: host.username,
      password: "",
      maxDatabases: host.max_databases,
    });
    setShowEdit(host);
  };

  const formBody = (
    <form onSubmit={showEdit ? handleEdit : handleCreate} className="space-y-4">
      {formError && (
        <p className="text-sm text-destructive">{formError}</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="MySQL Primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Host</label>
          <input
            type="text"
            required
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="127.0.0.1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Port</label>
          <input
            type="number"
            required
            value={form.port}
            onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 3306 })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Max Databases</label>
          <input
            type="number"
            required
            value={form.maxDatabases}
            onChange={(e) => setForm({ ...form, maxDatabases: parseInt(e.target.value) || 50 })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Username</label>
        <input
          type="text"
          required
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="root"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Password {showEdit && "(leave blank to keep current)"}
        </label>
        <input
          type="password"
          required={!showEdit}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="••••••••"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => { setShowCreate(false); setShowEdit(null); setForm(defaultForm); }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : showEdit ? "Save Changes" : "Create Host"}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Database Hosts</h1>
          <p className="text-muted-foreground">
            Manage MySQL database hosts
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Host
        </Button>
      </div>

      {(showCreate || showEdit) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  {showEdit ? "Edit Database Host" : "Add Database Host"}
                </h2>
                <button
                  onClick={() => { setShowCreate(false); setShowEdit(null); setForm(defaultForm); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {formBody}
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load database hosts. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : hosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hosts.map((host) => {
            const count = parseInt(host.database_count);
            const full = count >= host.max_databases;
            return (
              <Card key={host.id}>
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{host.name}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(host)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(host.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">
                    {host.host}:{host.port}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant={full ? "destructive" : "success"}>
                      {count}/{host.max_databases} databases
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No database hosts configured
            </h3>
            <p className="text-muted-foreground mb-4">
              Add a MySQL host to start creating databases for servers.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Host
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
