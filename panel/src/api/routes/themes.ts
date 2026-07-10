import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticateSession, requireAdmin } from "../middleware/rbac.js";

const themeSchema = z.object({
  name: z.string().min(1).max(50),
  colors: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    success: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    warning: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    error: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  fonts: z.object({
    heading: z.string().optional(),
    body: z.string().optional(),
    mono: z.string().optional(),
  }).optional(),
  borderRadius: z.string().optional(),
  logo: z.string().optional(),
  favicon: z.string().optional(),
});

// Default themes
const defaultThemes = {
  dark: {
    name: "Troxe Dark",
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#f8fafc",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    borderRadius: "0.75rem",
  },
  light: {
    name: "Troxe Light",
    colors: {
      primary: "#4f46e5",
      secondary: "#7c3aed",
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    borderRadius: "0.75rem",
  },
  midnight: {
    name: "Midnight",
    colors: {
      primary: "#06b6d4",
      secondary: "#0891b2",
      background: "#020617",
      surface: "#0f172a",
      text: "#e2e8f0",
      success: "#10b981",
      warning: "#fbbf24",
      error: "#f43f5e",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    borderRadius: "0.5rem",
  },
  forest: {
    name: "Forest",
    colors: {
      primary: "#22c55e",
      secondary: "#16a34a",
      background: "#052e16",
      surface: "#14532d",
      text: "#f0fdf4",
      success: "#4ade80",
      warning: "#facc15",
      error: "#ef4444",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    borderRadius: "1rem",
  },
  sunset: {
    name: "Sunset",
    colors: {
      primary: "#f97316",
      secondary: "#ea580c",
      background: "#1c1917",
      surface: "#292524",
      text: "#fafaf9",
      success: "#84cc16",
      warning: "#eab308",
      error: "#dc2626",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    borderRadius: "0.75rem",
  },
};

export default async function themeRoutes(app: FastifyInstance) {
  // Get all themes
  app.get(
    "/themes",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Fetch user's custom themes from DB
      return reply.send({ themes: defaultThemes });
    }
  );

  // Get a specific theme
  app.get(
    "/themes/:name",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const theme = defaultThemes[name as keyof typeof defaultThemes];

      if (!theme) {
        return reply.status(404).send({ error: "Theme not found" });
      }

      return reply.send({ theme });
    }
  );

  // Create custom theme
  app.post(
    "/themes",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = themeSchema.parse(request.body);

      // TODO: Save to DB
      // For now return the theme with a generated ID
      const id = `custom_${Date.now()}`;

      return reply.status(201).send({
        theme: {
          id,
          ...body,
          createdBy: request.user!.userId,
          createdAt: new Date().toISOString(),
        },
      });
    }
  );

  // Update theme
  app.put(
    "/themes/:id",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = themeSchema.partial().parse(request.body);

      // TODO: Update in DB
      return reply.send({ success: true });
    }
  );

  // Delete theme
  app.delete(
    "/themes/:id",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // TODO: Delete from DB
      return reply.send({ success: true });
    }
  );

  // Get CSS variables for a theme
  app.get(
    "/themes/:name/css",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const theme = defaultThemes[name as keyof typeof defaultThemes];

      if (!theme) {
        return reply.status(404).send({ error: "Theme not found" });
      }

      // Generate CSS custom properties
      const css = `
:root {
  --primary: ${theme.colors.primary};
  --secondary: ${theme.colors.secondary};
  --background: ${theme.colors.background};
  --surface: ${theme.colors.surface};
  --text: ${theme.colors.text};
  --success: ${theme.colors.success};
  --warning: ${theme.colors.warning};
  --error: ${theme.colors.error};
  --font-heading: ${theme.fonts?.heading || "Inter"};
  --font-body: ${theme.fonts?.body || "Inter"};
  --font-mono: ${theme.fonts?.mono || "JetBrains Mono"};
  --radius: ${theme.borderRadius || "0.75rem"};
}
`.trim();

      reply.header("Content-Type", "text/css");
      return reply.send(css);
    }
  );
}
