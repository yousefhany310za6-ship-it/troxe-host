import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WebSocket } from "ws";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";

export default async function consoleRoutes(app: FastifyInstance) {
  // Get recent console logs
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
      const logs = [
        { line: 1, content: "[12:00:00] [ServerThread/INFO]: Starting minecraft server version 1.21", timestamp: new Date().toISOString() },
        { line: 2, content: "[12:00:01] [ServerThread/INFO]: Loading properties", timestamp: new Date().toISOString() },
        { line: 3, content: "[12:00:01] [ServerThread/INFO]: Default game type: SURVIVAL", timestamp: new Date().toISOString() },
        { line: 4, content: "[12:00:02] [ServerThread/INFO]: Generating keypair", timestamp: new Date().toISOString() },
        { line: 5, content: "[12:00:02] [ServerThread/INFO]: Starting Minecraft server on *:25565", timestamp: new Date().toISOString() },
        { line: 6, content: "[12:00:03] [ServerThread/INFO]: Using epoll channel type", timestamp: new Date().toISOString() },
        { line: 7, content: "[12:00:05] [ServerThread/INFO]: Preparing level \"world\"", timestamp: new Date().toISOString() },
        { line: 8, content: "[12:00:10] [ServerThread/INFO]: Done (10.123s)! For help, type \"help\"", timestamp: new Date().toISOString() },
      ];

      return reply.send({ logs });
    }
  );

  // WebSocket console
  app.get(
    "/servers/:id/console/ws",
    { websocket: true },
    (connection: any, request: FastifyRequest) => {
      const ws: WebSocket = connection.socket;
      const serverId = (request.params as any).id;

      app.log.info(`WebSocket connected for server console: ${serverId}`);

      // Send welcome message
      ws.send(JSON.stringify({ type: "connected", serverId }));
      ws.send(JSON.stringify({ type: "output", data: "[Panel] Connected to console\n" }));

      // Simulated console output for demo
      const demoMessages = [
        "[ServerThread/INFO]: Server is running",
        "[ServerThread/INFO]: TPS: 19.8",
        "[ServerThread/INFO]: Players online: 0/20",
      ];

      let msgIndex = 0;
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && msgIndex < demoMessages.length) {
          ws.send(JSON.stringify({ type: "output", data: demoMessages[msgIndex] + "\n" }));
          msgIndex++;
        }
      }, 3000);

      // Handle incoming commands from client
      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === "command") {
            const cmd = msg.data?.trim();
            if (!cmd) return;

            app.log.info(`Console command: ${cmd}`);

            // Echo command back
            ws.send(JSON.stringify({ type: "output", data: `> ${cmd}\n` }));

            // Mock responses
            if (cmd === "help") {
              ws.send(JSON.stringify({ type: "output", data: "Available commands: help, list, status, stop\n" }));
            } else if (cmd === "list") {
              ws.send(JSON.stringify({ type: "output", data: "There are 0 of a max of 20 players online\n" }));
            } else if (cmd === "status") {
              ws.send(JSON.stringify({ type: "output", data: "Server is running on port 25565\n" }));
            } else if (cmd === "say") {
              ws.send(JSON.stringify({ type: "output", data: "[Server] Hello from Troxe Host!\n" }));
            } else {
              ws.send(JSON.stringify({ type: "output", data: `Unknown command: ${cmd}\n` }));
            }
          }

          if (msg.type === "resize") {
            // Forward to node agent in production
          }
        } catch {
          // Raw text - treat as command
          ws.send(JSON.stringify({ type: "output", data: `> ${data.toString()}\n` }));
        }
      });

      ws.on("close", () => {
        clearInterval(interval);
        app.log.info(`WebSocket disconnected for server: ${serverId}`);
      });

      ws.on("error", (err) => {
        clearInterval(interval);
        app.log.error(err, `WebSocket error for server: ${serverId}`);
      });
    }
  );

  // Send console command
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
