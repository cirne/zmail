import { Hono } from "hono";
import { setupRoutes } from "./routes/setup";
import { dashboardRoutes } from "./routes/dashboard";
import { searchRoutes } from "./routes/search";
import { config } from "~/lib/config";
import { logger } from "~/lib/logger";

export function createApp() {
  const app = new Hono();

  app.route("/setup", setupRoutes);
  app.route("/", dashboardRoutes);
  app.route("/search", searchRoutes);

  return app;
}

export async function startWebServer() {
  const app = createApp();

  Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });

  logger.info(`Web UI running`, { url: `http://localhost:${config.port}` });
}
