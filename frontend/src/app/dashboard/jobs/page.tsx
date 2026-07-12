"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Hourglass,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Job {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  error: string | null;
  attempts: number;
  max_attempts: number;
  server_id: string | null;
  server_name: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const STATUS_OPTIONS = ["pending", "active", "completed", "failed"];

function getStatusVariant(
  status: string
): "success" | "destructive" | "warning" | "secondary" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    case "active":
      return "warning";
    case "pending":
    default:
      return "secondary";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return CheckCircle;
    case "failed":
      return AlertTriangle;
    case "active":
      return Loader2;
    case "pending":
    default:
      return Hourglass;
  }
}

function formatTypeName(type: string): string {
  return type
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" > ");
}

export default function JobsPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const limit = 50;

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(page * limit));
  if (statusFilter) params.set("status", statusFilter);

  const { data, error, isLoading, mutate } = useSWR<{ jobs: Job[]; total: number }>(
    `/api/v1/jobs?${params.toString()}`,
    (url) => fetchApi<{ jobs: Job[]; total: number }>(url),
    { refreshInterval: 10_000 }
  );

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  async function handleRetry(jobId: string) {
    setRetryingId(jobId);
    try {
      await fetchApi(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to retry job");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Queue</h1>
          <p className="text-muted-foreground">
            View and manage background jobs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">
            {total} job{total !== 1 ? "s" : ""}
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
              Failed to load jobs. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : jobs.length > 0 ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Server
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Attempts
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Error
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                    Completed
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const StatusIcon = getStatusIcon(job.status);
                  return (
                    <tr
                      key={job.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-6 py-3 font-medium">
                        {formatTypeName(job.type)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={getStatusVariant(job.status)}
                          className="gap-1"
                        >
                          <StatusIcon
                            className={`h-3 w-3 ${
                              job.status === "active" ? "animate-spin" : ""
                            }`}
                          />
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {job.server_name || (
                          <span className="font-mono text-xs">
                            {job.server_id
                              ? job.server_id.slice(0, 8)
                              : "--"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {job.attempts} / {job.max_attempts}
                      </td>
                      <td className="px-6 py-3 max-w-[200px]">
                        {job.error ? (
                          <p
                            className="text-xs text-destructive truncate"
                            title={job.error}
                          >
                            {job.error}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(job.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {job.completed_at
                          ? new Date(job.completed_at).toLocaleString()
                          : "--"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {job.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(job.id)}
                            disabled={retryingId === job.id}
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 mr-1 ${
                                retryingId === job.id ? "animate-spin" : ""
                              }`}
                            />
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Hourglass className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No jobs found</h3>
            <p className="text-muted-foreground">
              Background jobs will appear here when servers are managed.
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
