"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { FolderTree, Plus, Pencil, Trash2, X, Egg } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Nest {
  id: string;
  name: string;
  description: string | null;
  egg_count: number;
  created_at: string;
}

export default function NestsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editNest, setEditNest] = useState<Nest | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ nests: Nest[] }>("/api/v1/nests", (url) =>
    fetchApi<{ nests: Nest[] }>(url)
  );

  const nests = data?.nests ?? [];

  const openCreate = () => {
    setEditNest(null);
    setForm({ name: "", description: "" });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (nest: Nest) => {
    setEditNest(nest);
    setForm({ name: nest.name, description: nest.description || "" });
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      if (editNest) {
        await fetchApi(`/api/v1/nests/${editNest.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            description: form.description || undefined,
          }),
        });
      } else {
        await fetchApi("/api/v1/nests", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            description: form.description || undefined,
          }),
        });
      }
      setShowForm(false);
      setEditNest(null);
      setForm({ name: "", description: "" });
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to save nest");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete nest "${name}"? This cannot be undone.`)) return;
    try {
      await fetchApi(`/api/v1/nests/${id}`, { method: "DELETE" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete nest");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nests</h1>
          <p className="text-muted-foreground">
            Organize eggs into groups
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Nest
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  {editNest ? "Edit Nest" : "Create Nest"}
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
                    placeholder="Game Servers"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Optional description"
                    rows={3}
                  />
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
                      : editNest
                      ? "Save Changes"
                      : "Create Nest"}
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : fetchError ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load nests. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : nests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nests.map((nest) => (
            <Card key={nest.id}>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{nest.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(nest)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(nest.id, nest.name)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {nest.description && (
                  <p className="text-sm text-muted-foreground">
                    {nest.description}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Egg className="h-3.5 w-3.5" />
                  {nest.egg_count} egg{nest.egg_count !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderTree className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No nests available
            </h3>
            <p className="text-muted-foreground mb-4">
              Create a nest to organize your eggs.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Nest
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
