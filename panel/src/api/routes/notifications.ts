import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticateSession } from "../middleware/rbac.js";

export default async function notificationRoutes(app: FastifyInstance) {
  app.get(
    "/notifications/preferences",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;

      const result = await app.db.query(
        `SELECT email_on_install, email_on_crash, email_on_remove, email_on_api_key
         FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.send({
          preferences: {
            emailOnInstall: true,
            emailOnCrash: true,
            emailOnRemove: true,
            emailOnApiKey: true,
          },
        });
      }

      const row = result.rows[0];
      return reply.send({
        preferences: {
          emailOnInstall: row.email_on_install,
          emailOnCrash: row.email_on_crash,
          emailOnRemove: row.email_on_remove,
          emailOnApiKey: row.email_on_api_key,
        },
      });
    }
  );

  app.put(
    "/notifications/preferences",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const body = request.body as {
        emailOnInstall?: boolean;
        emailOnCrash?: boolean;
        emailOnRemove?: boolean;
        emailOnApiKey?: boolean;
      };

      const fields = [
        { key: "email_on_install", value: body.emailOnInstall },
        { key: "email_on_crash", value: body.emailOnCrash },
        { key: "email_on_remove", value: body.emailOnRemove },
        { key: "email_on_api_key", value: body.emailOnApiKey },
      ];

      const existing = await app.db.query(
        "SELECT user_id FROM notification_preferences WHERE user_id = $1",
        [userId]
      );

      if (existing.rows.length === 0) {
        await app.db.query(
          `INSERT INTO notification_preferences (user_id, email_on_install, email_on_crash, email_on_remove, email_on_api_key)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            body.emailOnInstall ?? true,
            body.emailOnCrash ?? true,
            body.emailOnRemove ?? true,
            body.emailOnApiKey ?? true,
          ]
        );
      } else {
        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        for (const field of fields) {
          if (field.value !== undefined) {
            updates.push(`${field.key} = $${idx++}`);
            values.push(field.value);
          }
        }

        if (updates.length > 0) {
          updates.push(`updated_at = now()`);
          values.push(userId);
          await app.db.query(
            `UPDATE notification_preferences SET ${updates.join(", ")} WHERE user_id = $${idx}`,
            values
          );
        }
      }

      return reply.send({ success: true });
    }
  );
}
