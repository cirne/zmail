import { Hono } from "hono";
import { logger } from "~/lib/logger";

export function createApp() {
  const app = new Hono();

  // Routes removed - web UI functionality moved to CLI

  return app;
}

export async function startWebServer() {
  const app = createApp();
  const port = Number(process.env.PORT || "3000");

  Bun.serve({
    port,
    fetch: app.fetch,
  });

  logger.info(`Web UI running`, { url: `http://localhost:${port}` });
}
