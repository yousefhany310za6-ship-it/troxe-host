import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import WebSocket from "ws";

interface NodeInfo {
  fqdn: string;
  daemon_listen_port: number;
  daemon_token?: string;
}

interface AgentResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

const daemonToken = config.NODE_DEFAULT_TOKEN;

export function signAgentJWT(
  serverId: string,
  permissions: Record<string, boolean> = {}
): string {
  return jwt.sign(
    {
      server_id: serverId,
      user_id: "panel",
      permissions: {
        "websocket.connect": true,
        "send command": true,
        "set state": true,
        ...permissions,
      },
    },
    daemonToken,
    { expiresIn: "60s" }
  );
}

function agentBaseUrl(node: NodeInfo): string {
  return `http://${node.fqdn}:${node.daemon_listen_port}`;
}

export async function agentRequest<T = any>(
  node: NodeInfo,
  method: string,
  path: string,
  body?: any
): Promise<AgentResponse<T>> {
  const url = `${agentBaseUrl(node)}${path}`;
  const token = signAgentJWT("system");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    const init: RequestInit = { method, headers };
    if (body && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const resp = await fetch(url, init);
    const text = await resp.text();
    let data: T | null = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = text as any;
    }

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data: null,
        error: typeof data === "object" && data !== null && "error" in data
          ? (data as any).error
          : text,
      };
    }

    return { ok: true, status: resp.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Agent connection failed: ${err.message}`,
    };
  }
}

export async function agentGet<T = any>(
  node: NodeInfo,
  path: string
): Promise<AgentResponse<T>> {
  return agentRequest<T>(node, "GET", path);
}

export async function agentPost<T = any>(
  node: NodeInfo,
  path: string,
  body?: any
): Promise<AgentResponse<T>> {
  return agentRequest<T>(node, "POST", path, body);
}

export async function agentPut<T = any>(
  node: NodeInfo,
  path: string,
  body?: any
): Promise<AgentResponse<T>> {
  return agentRequest<T>(node, "PUT", path, body);
}

export async function agentDelete<T = any>(
  node: NodeInfo,
  path: string
): Promise<AgentResponse<T>> {
  return agentRequest<T>(node, "DELETE", path);
}

export function agentWebSocketUrl(
  node: NodeInfo,
  serverId: string
): { url: string; token: string } {
  const token = signAgentJWT(serverId);
  const url = `ws://${node.fqdn}:${node.daemon_listen_port}/api/servers/${serverId}/ws?token=${token}`;
  return { url, token };
}

export function createAgentWebSocket(
  node: NodeInfo,
  serverId: string,
  onMessage: (data: string) => void,
  onError?: (err: Error) => void,
  onClose?: () => void
): WebSocket {
  const { url } = agentWebSocketUrl(node, serverId);
  const ws = new WebSocket(url);

  ws.on("message", (data: Buffer) => {
    onMessage(data.toString());
  });

  ws.on("error", (err: Error) => {
    onError?.(err);
  });

  ws.on("close", () => {
    onClose?.();
  });

  return ws;
}

export async function sendServerCommand(
  node: NodeInfo,
  serverId: string,
  command: string
): Promise<AgentResponse<{ output: string }>> {
  return agentPost<{ output: string }>(
    node,
    `/api/servers/${serverId}/command`,
    { command }
  );
}

export async function agentStreamBody(
  node: NodeInfo,
  method: string,
  path: string,
): Promise<{ ok: boolean; status: number; body: ReadableStream | null; error?: string }> {
  const url = `${agentBaseUrl(node)}${path}`;
  const token = signAgentJWT("system");

  try {
    const resp = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "unknown error");
      return { ok: false, status: resp.status, body: null, error: text };
    }

    return { ok: true, status: resp.status, body: resp.body };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: `Agent connection failed: ${err.message}`,
    };
  }
}

export async function agentSendBody(
  node: NodeInfo,
  method: string,
  path: string,
  bodyStream: ReadableStream,
): Promise<AgentResponse> {
  const url = `${agentBaseUrl(node)}${path}`;
  const token = signAgentJWT("system");

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/gzip",
      },
      body: bodyStream as any,
      duplex: "half",
    } as any);

    const text = await resp.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data: null,
        error: typeof data === "object" && data?.error ? data.error : text,
      };
    }

    return { ok: true, status: resp.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Agent connection failed: ${err.message}`,
    };
  }
}

export async function getNodeForServer(
  serverId: string,
  db: any
): Promise<NodeInfo | null> {
  const result = await db.query(
    `SELECT n.fqdn, n.daemon_listen_port
     FROM servers s JOIN nodes n ON s.node_id = n.id
     WHERE s.id = $1`,
    [serverId]
  );

  if (result.rows.length === 0) return null;

  return {
    fqdn: result.rows[0].fqdn,
    daemon_listen_port: result.rows[0].daemon_listen_port,
  };
}
