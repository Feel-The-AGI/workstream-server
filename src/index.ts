import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import { authRoutes } from "./routes/auth";
import { programRoutes } from "./routes/programs";
import { applicationRoutes } from "./routes/applications";
import { userRoutes } from "./routes/users";
import { documentRoutes } from "./routes/documents";
import { errorHandler } from "./middleware/error-handler";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.FRONTEND_URL || "",
    ].filter(Boolean),
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Workstream API",
    version: "1.0.0",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// API Routes
const api = new Hono();

api.route("/auth", authRoutes);
api.route("/users", userRoutes);
api.route("/programs", programRoutes);
api.route("/applications", applicationRoutes);
api.route("/documents", documentRoutes);

app.route("/api/v1", api);

// Error handling
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

const port = parseInt(process.env.PORT || "8000", 10);

console.log(`
╔════════════════════════════════════════════════╗
║           WORKSTREAM API SERVER                ║
╠════════════════════════════════════════════════╣
║  Status:  Running                              ║
║  Port:    ${port}                                 ║
║  API:     http://localhost:${port}/api/v1          ║
╚════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
