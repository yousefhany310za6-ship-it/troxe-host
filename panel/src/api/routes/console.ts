import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WebSocket } from "ws";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";
import { agentGet, getNodeForServer, createAgentWebSocket } from "../../lib/node-agent.js";

export default async function consoleRoutes(app: FastifyInstance) {
  app.get(
    "/servers/:id/console",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("control.console"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentGet(node, `/api/servers/${id}/logs?tail=100`);
      if (!resp.ok) {
        return reply.send({ logs: [] });
      }

      const rawLogs = (resp.data as any)?.logs || "";
      const rawEvents = (resp.data as any)?.events || [];
      const lines = rawLogs.split("\n").filter(Boolean).map((line: string, i: number) => ({
        line: i + 1,
        content: line,
        timestamp: new Date().toISOString(),
      }));

      return reply.send({ logs: lines, events: rawEvents });
    }
  );

  app.get(
    "/servers/:id/console/ws",
    { websocket: true },
    (ws: WebSocket, request: FastifyRequest) => {
      const serverId = (request.params as any).id;

      app.log.info(`WebSocket connected for server console: ${serverId}`);

      ws.send(JSON.stringify({ type: "connected", serverId }));

      getNodeForServer(serverId, app.db).then((node) => {
        if (!node) {
          ws.send(JSON.stringify({ type: "output", data: "[Panel] Error: Node not found\n" }));
          ws.close();
          return;
        }

        const agentWs = createAgentWebSocket(
          node,
          serverId,
          (data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                const msg = JSON.parse(data);
                if (msg.type === "output") {
                  ws.send(JSON.stringify({ type: "output", data: msg.data }));
                } else if (msg.event === "auth") {
                  ws.send(JSON.stringify({ type: "output", data: "[Panel] Authenticated with node agent\n" }));
                }
              } catch {
                ws.send(JSON.stringify({ type: "output", data }));
              }
            }
          },
          (err) => {
            app.log.error(err, `Agent WebSocket error for server: ${serverId}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "output", data: `[Panel] Agent connection error: ${err.message}\n` }));
            }
          },
          () => {
            app.log.info(`Agent WebSocket closed for server: ${serverId}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "output", data: "[Panel] Agent disconnected\n" }));
            }
          }
        );

        ws.on("message", (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());

            if (msg.type === "command") {
              const cmd = msg.data?.trim();
              if (!cmd) return;

              app.log.info(`Console command: ${cmd}`);

              if (agentWs.readyState === WebSocket.OPEN) {
                agentWs.send(JSON.stringify({
                  event: "send command",
                  args: [cmd],
                }));
              }
            }

            if (msg.type === "resize") {
              // Forward resize to agent if needed
            }
          } catch {
            // Raw text
            if (agentWs.readyState === WebSocket.OPEN) {
              agentWs.send(JSON.stringify({
                event: "send command",
                args: [data.toString()],
              }));
            }
          }
        });

        ws.on("close", () => {
          app.log.info(`WebSocket disconnected for server: ${serverId}`);
          if (agentWs.readyState === WebSocket.OPEN) {
            agentWs.close();
          }
        });

        ws.on("error", (err) => {
          app.log.error(err, `WebSocket error for server: ${serverId}`);
          if (agentWs.readyState === WebSocket.OPEN) {
            agentWs.close();
          }
        });
      });
    }
  );

  app.post(
    "/servers/:id/console",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("control.console"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { command } = request.body as { command: string };

      if (!command || command.trim().length === 0) {
        return reply.status(400).send({ error: "Command required" });
      }

      return reply.send({ success: true, command });
    }
  );
}
