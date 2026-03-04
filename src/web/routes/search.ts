import { Hono } from "hono";
import { html } from "hono/html";
import { getDb } from "~/db";
import { search } from "~/search";

export const searchRoutes = new Hono();

searchRoutes.get("/", (c) => {
  const q = c.req.query("q") ?? "";
  const db = getDb();
  const results = q ? search(db, { query: q }) : [];

  return c.html(html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>agentmail — search</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <link rel="stylesheet" href="/public/app.css" />
      </head>
      <body>
        <main>
          <form hx-get="/search" hx-target="#results" hx-push-url="true">
            <input name="q" value="${q}" placeholder="Search email…" autofocus />
            <button type="submit">Search</button>
          </form>

          <div id="results">
            ${results.map(
              (r) => html`
                <article>
                  <h3>${r.subject}</h3>
                  <p>${r.fromAddress} · ${r.date}</p>
                  <p>${r.snippet}</p>
                </article>
              `
            )}
          </div>
        </main>
      </body>
    </html>
  `);
});
