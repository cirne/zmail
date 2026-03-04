import { Hono } from "hono";
import { html } from "hono/html";

export const setupRoutes = new Hono();

setupRoutes.get("/", (c) => {
  return c.html(html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>agentmail — setup</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <link rel="stylesheet" href="/public/app.css" />
      </head>
      <body>
        <main>
          <h1>Welcome to agentmail</h1>
          <p>Connect your Gmail to get started.</p>

          <!-- TODO: Google OAuth sign-in button -->
          <!-- TODO: IMAP credentials form -->
          <!-- TODO: redirect to /dashboard on success -->
        </main>
      </body>
    </html>
  `);
});
