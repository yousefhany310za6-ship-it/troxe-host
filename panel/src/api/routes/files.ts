import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";
import { eventBus } from "../../events/index.js";

export default async function fileRoutes(app: FastifyInstance) {
  // List files in directory
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

      const result = await app.db.query(
        `SELECT n.fqdn, n.daemon_listen_port, s.runtime_id
         FROM servers s JOIN nodes n ON s.node_id = n.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const node = result.rows[0];

      // TODO: Call Node Agent to list files
      // const response = await fetch(`http://${node.fqdn}:${node.daemon_listen_port}/api/servers/${id}/files?path=${dirPath || '/'}`, {
      //   headers: { Authorization: `Bearer ${daemonToken}` }
      // });

      // Mock response for now
      const files = [
        { name: "server.jar", type: "file", size: 52428800, modified: new Date().toISOString() },
        { name: "plugins", type: "directory", size: 0, modified: new Date().toISOString() },
        { name: "world", type: "directory", size: 0, modified: new Date().toISOString() },
        { name: "server.properties", type: "file", size: 1024, modified: new Date().toISOString() },
        { name: "logs", type: "directory", size: 0, modified: new Date().toISOString() },
        { name: "eula.txt", type: "file", size: 12, modified: new Date().toISOString() },
      ];

      return reply.send({ files, path: dirPath || "/" });
    }
  );

  // Read file content
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

      // Security: prevent path traversal
      if (filePath.includes("..") || filePath.startsWith("/")) {
        return reply.status(400).send({ error: "Invalid file path" });
      }

      // TODO: Call Node Agent to read file
      // For now return mock
      return reply.send({
        content: "# Server Properties\nserver-port=25565\nmax-players=20\n",
        path: filePath,
        encoding: "utf-8",
      });
    }
  );

  // Write/update file content
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

      // TODO: Call Node Agent to write file
      await eventBus.emit("file.written", {
        subjectType: "server",
        subjectId: id,
        filePath,
      });

      return reply.send({ success: true, path: filePath });
    }
  );

  // Create file or directory
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

      const fullPath = dirPath ? `${dirPath}/${name}` : name;

      // TODO: Call Node Agent
      return reply.status(201).send({ success: true, path: fullPath });
    }
  );

  // Delete file or directory
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

      // TODO: Call Node Agent
      return reply.send({ success: true });
    }
  );

  // Rename/move file
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

      // TODO: Call Node Agent
      return reply.send({ success: true });
    }
  );

  // Compress files
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
      const { id } = request.params as { id: string };
      const { files } = request.body as { files: string[] };

      // TODO: Call Node Agent
      return reply.send({ success: true });
    }
  );

  // Decompress files
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
      const { id } = request.params as { id: string };
      const { file } = request.body as { file: string };

      // TODO: Call Node Agent
      return reply.send({ success: true });
    }
  );

  // Upload file
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

      // Handle multipart upload
      const parts = request.parts();
      let uploadedFiles: string[] = [];

      for await (const part of parts) {
        if (part.type === "file") {
          // TODO: Stream file to Node Agent
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
