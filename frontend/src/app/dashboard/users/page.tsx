"use client";

import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Users,
  Shield,
  Clock,
  Calendar,
  UserX,
  UserCheck,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  username: string;
  email: string;
  root_admin: boolean;
  suspended: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function UsersPage() {
  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ users: User[] }>("/api/v1/users", (url) =>
    fetchApi<{ users: User[] }>(url)
  );

  const users = data?.users ?? [];

  const handleToggleSuspend = async (id: string, suspended: boolean) => {
    const action = suspended ? "unsuspend" : "suspend";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await fetchApi(`/api/v1/users/${id}/suspend`, {
        method: "PATCH",
        body: JSON.stringify({ suspended: !suspended }),
      });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await fetchApi(`/api/v1/users/${id}`, { method: "DELETE" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          Manage user accounts
          {users.length > 0 && (
            <span className="ml-2 text-foreground font-medium">
              ({users.length})
            </span>
          )}
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="px-6 py-4 border-b border-border animate-pulse"
                >
                  <div className="h-4 bg-secondary rounded w-1/4" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load users. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : users.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    User
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Role
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Last Login
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 text-sm font-medium">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-6 py-4">
                      {user.root_admin ? (
                        <Badge>
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.suspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {user.last_login_at ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(user.last_login_at).toLocaleString()}
                        </div>
                      ) : (
                        "Never"
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            handleToggleSuspend(user.id, user.suspended)
                          }
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={user.suspended ? "Unsuspend" : "Suspend"}
                        >
                          {user.suspended ? (
                            <UserCheck className="h-4 w-4" />
                          ) : (
                            <UserX className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.username)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No users found</h3>
            <p className="text-muted-foreground">
              No user accounts have been registered yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
