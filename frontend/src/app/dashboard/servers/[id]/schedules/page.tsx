"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Clock, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ScheduleTask {
  type: "command" | "power" | "backup" | "announce";
  payload: string;
}

interface Schedule {
  id: string;
  name: string;
  cron: string;
  active: boolean;
  lastRun: string | null;
  tasks: ScheduleTask[];
}

export default function SchedulesPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [taskType, setTaskType] = useState<ScheduleTask["type"]>("command");
  const [taskPayload, setTaskPayload] = useState("");

  const { data: schedules, error, isLoading, mutate } = useSWR<Schedule[]>(
    `/api/v1/servers/${id}/schedules`,
    (url: string) => fetchApi<Schedule[]>(url)
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !cron.trim() || !taskPayload.trim()) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/schedules`, {
        method: "POST",
        body: JSON.stringify({
          name,
          cron,
          tasks: [{ type: taskType, payload: taskPayload }],
        }),
      });
      setName("");
      setCron("");
      setTaskPayload("");
      setShowForm(false);
      mutate();
    } catch {
    }
  }

  async function handleToggle(scheduleId: string, active: boolean) {
    try {
      await fetchApi(`/api/v1/servers/${id}/schedules/${scheduleId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      mutate();
    } catch {
    }
  }

  async function handleDelete(scheduleId: string) {
    if (!confirm("Delete this schedule?")) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/schedules/${scheduleId}`, {
        method: "DELETE",
      });
      mutate();
    } catch {
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Schedules</h1>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Daily Restart"
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cron Expression</label>
                  <input
                    type="text"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    placeholder="0 4 * * *"
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as ScheduleTask["type"])}
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="command">Command</option>
                    <option value="power">Power</option>
                    <option value="backup">Backup</option>
                    <option value="announce">Announce</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Payload</label>
                  <input
                    type="text"
                    value={taskPayload}
                    onChange={(e) => setTaskPayload(e.target.value)}
                    placeholder="say Server restarting..."
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">Create</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Cron</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Active</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Last Run</th>
                <th className="text-right px-6 py-3 font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Loading schedules...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-destructive">
                    Failed to load schedules.
                  </td>
                </tr>
              ) : schedules && schedules.length > 0 ? (
                schedules.map((schedule) => (
                  <tr
                    key={schedule.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium">{schedule.name}</td>
                    <td className="px-6 py-3 font-mono text-muted-foreground">{schedule.cron}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleToggle(schedule.id, schedule.active)}
                        className="flex items-center"
                      >
                        {schedule.active ? (
                          <ToggleRight className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : "Never"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(schedule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No schedules configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
