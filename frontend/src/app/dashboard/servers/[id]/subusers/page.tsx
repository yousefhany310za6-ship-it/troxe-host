"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { UserPlus, Trash2, Shield, Pencil, Check, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Permissions {
  control?: Record<string, boolean>;
  file?: Record<string, boolean>;
  backup?: Record<string, boolean>;
  database?: Record<string, boolean>;
  schedule?: Record<string, boolean>;
  websocket?: Record<string, boolean>;
}

interface Subuser {
  id: string;
  user_id: string;
  permissions: Permissions;
  created_at: string;
  username: string;
  email: string;
}

interface SubuserInfo {
  subusers: Subuser[];
}

const PERMISSION_GROUPS: { key: keyof Permissions; label: string; actions: string[] }[] = [
  { key: "control", label: "Control", actions: ["start", "stop", "restart", "console"] },
  { key: "file", label: "File", actions: ["read", "write", "delete", "upload", "create"] },
  { key: "backup", label: "Backup", actions: ["create", "read", "delete"] },
  { key: "database", label: "Database", actions: ["create", "read", "delete"] },
  { key: "schedule", label: "Schedule", actions: ["create", "read", "delete"] },
  { key: "websocket", label: "WebSocket", actions: ["connect"] },
];

function emptyPermissions(): Permissions {
  return { control: {}, file: {}, backup: {}, database: {}, schedule: {}, websocket: {} };
}

function countPermissions(p: Permissions): number {
  let n = 0;
  for (const group of PERMISSION_GROUPS) {
    const g = p[group.key];
    if (g) n += Object.values(g).filter(Boolean).length;
  }
  return n;
}

function PermissionsEditor({
  value,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  submitting,
  emailEditable,
  email,
  setEmail,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
  emailEditable?: boolean;
  email?: string;
  setEmail?: (v: string) => void;
}) {
  function toggle(group: keyof Permissions, action: string, checked: boolean) {
    const next: Permissions = { ...value };
    next[group] = { ...(next[group] || {}), [action]: checked };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {emailEditable && setEmail && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.key} className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold mb-2">{group.label}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {group.actions.map((action) => (
                <label key={action} className="flex items-center gap-1.5 text-xs capitalize">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={!!value[group.key]?.[action]}
                    onChange={(e) => toggle(group.key, action, e.target.checked)}
                  />
                  {action}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export default function SubusersPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [formPerms, setFormPerms] = useState<Permissions>(emptyPermissions());
  const [error, setError] = useState<string | null>(null);

  const { data: info, isLoading, mutate } = useSWR<SubuserInfo>(
    `/api/v1/servers/${id}/subusers`,
    (url: string) => fetchApi<SubuserInfo>(url)
  );

  const subusers = info?.subusers ?? [];

  function startAdd() {
    setError(null);
    setEmail("");
    setFormPerms(emptyPermissions());
    setAdding(true);
  }

  function startEdit(s: Subuser) {
    setError(null);
    setEditingId(s.id);
    setFormPerms(JSON.parse(JSON.stringify(s.permissions || emptyPermissions())));
  }

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchApi(`/api/v1/servers/${id}/subusers`, {
        method: "POST",
        body: JSON.stringify({ email, permissions: formPerms }),
      });
      setAdding(false);
      mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(subuserId: string) {
    setSubmitting(true);
    setError(null);
    try {
      await fetchApi(`/api/v1/servers/${id}/subusers/${subuserId}`, {
        method: "PUT",
        body: JSON.stringify({ permissions: formPerms }),
      });
      setEditingId(null);
      mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(subuserId: string) {
    if (!confirm("Remove this subuser?")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/subusers/${subuserId}`, { method: "DELETE" });
      mutate();
    } catch {
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subusers</h1>
          <p className="text-sm text-muted-foreground">
            Grant limited access to other users for this server
          </p>
        </div>
        {!adding && (
          <Button onClick={startAdd}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Subuser
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{error}</p>
      )}

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle>Add Subuser</CardTitle>
          </CardHeader>
          <CardContent>
            <PermissionsEditor
              value={formPerms}
              onChange={setFormPerms}
              onCancel={() => setAdding(false)}
              onSubmit={handleAdd}
              submitLabel="Add"
              submitting={submitting}
              emailEditable
              email={email}
              setEmail={setEmail}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subuser List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading subusers...</p>
          ) : subusers.length === 0 && !adding ? (
            <div className="text-center py-8">
              <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No subusers yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subusers.map((s) => (
                <div key={s.id} className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-border">
                    <div className="flex items-center gap-4 min-w-0">
                      <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium truncate">{s.username}</p>
                        <p className="text-sm text-muted-foreground truncate">{s.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="secondary">{countPermissions(s.permissions)} perms</Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => startEdit(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {editingId === s.id && (
                    <div className="p-4 rounded-lg border border-border bg-muted/40">
                      <PermissionsEditor
                        value={formPerms}
                        onChange={setFormPerms}
                        onCancel={() => setEditingId(null)}
                        onSubmit={() => handleUpdate(s.id)}
                        submitLabel="Save"
                        submitting={submitting}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
