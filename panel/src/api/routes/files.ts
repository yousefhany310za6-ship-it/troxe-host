import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";
import { eventBus } from "../../events/index.js";
import {
  agentGet,
  agentPut,
  agentPost,
  agentDelete,
  getNodeForServer,
} from "../../lib/node-agent.js";

export default async function fileRoutes(app: FastifyInstance) {
  app.get(
    "/servers/:id/files/list",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.read"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { path: dirPath } = request.query as { path?: string };

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const queryPath = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const resp = await agentGet(node, `/api/servers/${id}/files${queryPath}`);

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      return reply.send(resp.data);
    }
  );

  app.get(
    "/servers/:id/files/*",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.read"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const filePath = (request.params as any)["*"];

      if (filePath.includes("..") || filePath.startsWith("/")) {
        return reply.status(400).send({ error: "Invalid file path" });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentGet(node, `/api/servers/${id}/files/${filePath}`);

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      return reply.send(resp.data);
    }
  );

  app.put(
    "/servers/:id/files/*",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.write"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const filePath = (request.params as any)["*"];
      const { content } = request.body as { content: string };

      if (filePath.includes("..") || filePath.startsWith("/")) {
        return reply.status(400).send({ error: "Invalid file path" });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentPut(node, `/api/servers/${id}/files/${filePath}`, { content });

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      await eventBus.emit("file.written", {
        subjectType: "server",
        subjectId: id,
        filePath,
      });

      return reply.send(resp.data);
    }
  );

  app.post(
    "/servers/:id/files/create",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.create"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { name, type, path: dirPath } = request.body as {
        name: string;
        type: "file" | "directory";
        path?: string;
      };

      if (name.includes("..") || name.startsWith("/")) {
        return reply.status(400).send({ error: "Invalid name" });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentPost(node, `/api/servers/${id}/files/create`, {
        name,
        type,
        path: dirPath || "",
      });

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      return reply.status(201).send(resp.data);
    }
  );

  app.delete(
    "/servers/:id/files/*",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.delete"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const filePath = (request.params as any)["*"];

      if (filePath.includes("..") || filePath.startsWith("/")) {
        return reply.status(400).send({ error: "Invalid file path" });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentDelete(node, `/api/servers/${id}/files/${filePath}`);

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      return reply.send(resp.data);
    }
  );

  app.post(
    "/servers/:id/files/rename",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.write"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { from, to } = request.body as { from: string; to: string };

      if (from.includes("..") || to.includes("..")) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentPost(node, `/api/servers/${id}/files/rename`, { from, to });

      if (!resp.ok) {
        return reply.status(resp.status || 500).send({ error: resp.error });
      }

      return reply.send(resp.data);
    }
  );

  app.post(
    "/servers/:id/files/compress",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.write"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ success: true, message: "Compression not yet implemented" });
    }
  );

  app.post(
    "/servers/:id/files/decompress",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.write"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ success: true, message: "Decompression not yet implemented" });
    }
  );

  app.post(
    "/servers/:id/files/upload",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("file.upload"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const parts = request.parts();
      let uploadedFiles: string[] = [];

      for await (const part of parts) {
        if (part.type === "file") {
          uploadedFiles.push(part.filename);
        }
      }

      return reply.send({
        success: true,
        files: uploadedFiles,
      });
    }
  );
}
