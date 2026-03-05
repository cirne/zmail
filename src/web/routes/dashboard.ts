import { Hono } from "hono";
import { html } from "hono/html";
import { getDb } from "~/db";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", (c) => {
  return c.html(html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>zmail</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <link rel="stylesheet" href="/public/app.css" />
      </head>
      <body>
        <main>
          <h1>zmail</h1>

          <!-- Sync status — HTMX polls every 3s -->
          <section
            hx-get="/status"
            hx-trigger="every 3s"
            hx-swap="outerHTML"
          >
            Loading sync status…
          </section>
        </main>
      </body>
    </html>
  `);
});

// HTMX polls this endpoint for live sync status
dashboardRoutes.get("/status", (c) => {
  const db = getDb();
  const summary = db
    .query("SELECT * FROM sync_summary WHERE id = 1")
    .get() as Record<string, unknown> | null;

  if (!summary) {
    return c.html(html`<section id="status">No sync data yet.</section>`);
  }

  return c.html(html`
    <section id="status" hx-get="/status" hx-trigger="every 3s" hx-swap="outerHTML">
      <p>Messages: ${summary.total_messages}</p>
      <p>Last sync: ${summary.last_sync_at ?? "never"}</p>
      <p>Running: ${summary.is_running ? "yes" : "no"}</p>
    </section>
  `);
});
