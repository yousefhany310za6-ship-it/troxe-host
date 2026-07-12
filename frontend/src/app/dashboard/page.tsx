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
import Link from "next/link";

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
      gradient: "from-brand-500 to-blue-500",
      textColor: "text-brand-400",
      glowClass: "hover:shadow-glow-brand",
    },
    {
      label: "Online Nodes",
      value: stats?.onlineNodes ?? 0,
      icon: Network,
      gradient: "from-emerald-500 to-cyan-500",
      textColor: "text-emerald-400",
      glowClass: "hover:shadow-glow-success",
    },
    {
      label: "Total Users",
      value: stats?.users ?? 0,
      icon: Users,
      gradient: "from-cyan-500 to-blue-500",
      textColor: "text-cyan-400",
      glowClass: "hover:shadow-glow-cyan",
    },
    {
      label: "Total Eggs",
      value: stats?.eggs ?? 0,
      icon: Egg,
      gradient: "from-purple-500 to-pink-500",
      textColor: "text-purple-400",
      glowClass: "",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back,{" "}
            <span className="text-gradient-brand font-medium">
              {user?.username}
            </span>
          </p>
        </div>
        {user?.rootAdmin && (
          <Link href="/dashboard/servers/new">
            <Button variant="glow">
              <Plus className="h-4 w-4 mr-2" />
              Create Server
            </Button>
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card
            key={stat.label}
            className={`group transition-all duration-300 hover:-translate-y-1 ${stat.glowClass}`}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1 text-foreground">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`h-12 w-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110`}
                >
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Servers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-400" />
            Recent Servers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentServers && stats.recentServers.length > 0 ? (
            <div className="space-y-2">
              {stats.recentServers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        server.status === "running"
                          ? "bg-emerald-400 shadow-glow-success"
                          : server.status === "stopped"
                          ? "bg-red-400 shadow-glow-danger"
                          : "bg-yellow-400 shadow-glow-warning"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {server.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created{" "}
                        {new Date(server.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      server.status === "running"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : server.status === "stopped"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                    }`}
                  >
                    {server.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Server className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No servers yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
