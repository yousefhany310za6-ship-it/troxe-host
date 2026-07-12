"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Activity,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_type: string;
  event: string;
  subject_type: string | null;
  subject_id: string | null;
  data: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  "server.created",
  "server.started",
  "server.stopped",
  "server.crashed",
  "server.installed",
  "server.command.sent",
  "server.restarted",
  "backup.completed",
  "user.login",
  "user.created",
];

function formatEventName(event: string): string {
  return event
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" > ");
}

function getEventVariant(
  event: string
): "success" | "destructive" | "warning" | "secondary" {
  if (event.includes("crashed") || event.includes("failed"))
    return "destructive";
  if (
    event.includes("started") ||
    event.includes("created") ||
    event.includes("completed")
  )
    return "success";
  if (event.includes("stopped") || event.includes("deleted"))
    return "warning";
  return "secondary";
}

export default function ActivityPage() {
  const [page, setPage] = useState(0);
  const [eventFilter, setEventFilter] = useState("");
  const limit = 50;

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(page * limit));
  if (eventFilter) params.set("event", eventFilter);

  const {
    data,
    error,
    isLoading,
  } = useSWR<{ logs: ActivityLog[]; total: number }>(
    `/api/v1/activity?${params.toString()}`,
    (url) => fetchApi<{ logs: ActivityLog[]; total: number }>(url)
  );

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">
            Monitor all system events and user actions
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={eventFilter}
          onChange={(e) => {
            setEventFilter(e.target.value);
            setPage(0);
          }}
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Events</option>
          {EVENT_TYPES.map((ev) => (
            <option key={ev} value={ev}>
              {formatEventName(ev)}
            </option>
          ))}
        </select>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">
            {total} event{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="px-6 py-4 border-b border-border animate-pulse"
                >
                  <div className="h-4 bg-secondary rounded w-1/3" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load activity logs. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : logs.length > 0 ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Time
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Actor
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Event
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Subject
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 text-xs font-medium">
                          {log.actor_username
                            ? log.actor_username.charAt(0).toUpperCase()
                            : "?"}
                        </div>
                        <span className="font-medium">
                          {log.actor_username || log.actor_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={getEventVariant(log.event)}>
                        {log.event}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {log.subject_type ? (
                        <span className="font-mono text-xs">
                          {log.subject_type}
                          {log.subject_id
                            ? ` / ${log.subject_id.slice(0, 8)}`
                            : ""}
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground font-mono text-xs">
                      {log.ip_address || "--"}
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
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No activity yet</h3>
            <p className="text-muted-foreground">
              Events will appear here as users interact with the system.
            </p>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
