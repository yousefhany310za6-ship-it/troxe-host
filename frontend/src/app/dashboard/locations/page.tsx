"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { MapPin, Plus, X, Network } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Location {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Node {
  id: string;
  location_id: string;
}

export default function LocationsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ locations: Location[] }>("/api/v1/locations", (url) =>
    fetchApi<{ locations: Location[] }>(url)
  );

  const { data: nodeData } = useSWR<{ nodes: Node[] }>(
    "/api/v1/nodes",
    (url) => fetchApi<{ nodes: Node[] }>(url)
  );

  const locations = data?.locations ?? [];
  const nodes = nodeData?.nodes ?? [];

  const getNodeCount = (locationId: string) =>
    nodes.filter((n) => n.location_id === locationId).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await fetchApi("/api/v1/locations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
        }),
      });
      setShowAdd(false);
      setForm({ name: "", description: "" });
      mutate();
    } catch (err: any) {
      setFormError(err.message || "Failed to create location");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-muted-foreground">
            Manage data center locations
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Add Location</h2>
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
                    placeholder="US East"
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
                    onClick={() => setShowAdd(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Location"}
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
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load locations. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : locations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => {
            const count = getNodeCount(loc.id);
            return (
              <Card key={loc.id}>
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{loc.name}</h3>
                  </div>
                  {loc.description && (
                    <p className="text-sm text-muted-foreground">
                      {loc.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Network className="h-3.5 w-3.5" />
                    {count} node{count !== 1 ? "s" : ""}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No locations available
            </h3>
            <p className="text-muted-foreground mb-4">
              Add a location to organize your nodes.
            </p>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
