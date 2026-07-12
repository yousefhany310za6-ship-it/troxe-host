import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireAdmin,
} from "../middleware/rbac.js";
import { agentGet, agentPost, agentDelete } from "../../lib/node-agent.js";

async function getNodeInfo(db: any, nodeId: string) {
  const result = await db.query(
    `SELECT fqdn, daemon_listen_port FROM nodes WHERE id = $1`,
    [nodeId]
  );
  if (result.rows.length === 0) return null;
  return {
    fqdn: result.rows[0].fqdn,
    daemon_listen_port: result.rows[0].daemon_listen_port,
  };
}

export default async function nodeImageRoutes(app: FastifyInstance) {
  // List Docker images on a node
  app.get(
    "/nodes/:id/images",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const node = await getNodeInfo(app.db, id);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentGet(node, "/api/images");
      if (!resp.ok) {
        return reply.status(resp.status).send({ error: resp.error });
      }
      return reply.send(resp.data);
    }
  );

  // Pull a Docker image
  app.post(
    "/nodes/:id/images/pull",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { image } = request.body as { image: string };

      if (!image) {
        return reply.status(400).send({ error: "Image name required" });
      }

      const node = await getNodeInfo(app.db, id);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentPost(node, "/api/images/pull", { image });
      if (!resp.ok) {
        return reply.status(resp.status).send({ error: resp.error });
      }
      return reply.status(202).send(resp.data);
    }
  );

  // Get pull task status
  app.get(
    "/nodes/:id/images/pull/:taskId",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, taskId } = request.params as { id: string; taskId: string };
      const node = await getNodeInfo(app.db, id);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentGet(node, `/api/images/pull/${taskId}`);
      if (!resp.ok) {
        return reply.status(resp.status).send({ error: resp.error });
      }
      return reply.send(resp.data);
    }
  );

  // Delete a Docker image
  app.delete(
    "/nodes/:id/images/:imageId",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, imageId } = request.params as { id: string; imageId: string };
      const force = (request.query as any).force === "true";

      const node = await getNodeInfo(app.db, id);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const path = `/api/images/${encodeURIComponent(imageId)}${force ? "?force=true" : ""}`;
      const resp = await agentDelete(node, path);
      if (!resp.ok) {
        return reply.status(resp.status).send({ error: resp.error });
      }
      return reply.send(resp.data);
    }
  );

  // Get image history/layers
  app.get(
    "/nodes/:id/images/:imageId/history",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, imageId } = request.params as { id: string; imageId: string };
      const node = await getNodeInfo(app.db, id);
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const resp = await agentGet(node, `/api/images/${encodeURIComponent(imageId)}/history`);
      if (!resp.ok) {
        return reply.status(resp.status).send({ error: resp.error });
      }
      return reply.send(resp.data);
    }
  );
}
