"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  Network,
  Users,
  Egg,
  Plus,
  Activity,
} from "lucide-react";

interface DashboardStats {
  servers: number;
  onlineNodes: number;
  users: number;
  eggs: number;
  recentServers: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<DashboardStats>("/api/v1/dashboard/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Servers",
      value: stats?.servers ?? 0,
      icon: Server,
      color: "text-brand-400",
      bg: "bg-brand-400/10",
    },
    {
      label: "Online Nodes",
      value: stats?.onlineNodes ?? 0,
      icon: Network,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Total Users",
      value: stats?.users ?? 0,
      icon: Users,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      label: "Total Eggs",
      value: stats?.eggs ?? 0,
      icon: Egg,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.username}
          </p>
        </div>
        {user?.rootAdmin && (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Server
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div
                  className={`h-12 w-12 rounded-lg ${stat.bg} flex items-center justify-center`}
                >
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Servers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentServers && stats.recentServers.length > 0 ? (
            <div className="space-y-3">
              {stats.recentServers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(server.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      server.status === "running"
                        ? "text-green-400"
                        : server.status === "stopped"
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {server.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No servers yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
