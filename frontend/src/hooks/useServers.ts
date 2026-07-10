import useSWR from "swr";
import { fetchApi } from "@/lib/api";

export interface Server {
  id: string;
  name: string;
  game: string;
  status: "running" | "stopped" | "starting" | "error";
  nodeId: string;
  ip: string;
  port: number;
  createdAt: string;
}

export function useServers() {
  const { data, error, isLoading, mutate } = useSWR<Server[]>(
    "/api/v1/servers",
    (url: string) => fetchApi<Server[]>(url)
  );

  return {
    servers: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
