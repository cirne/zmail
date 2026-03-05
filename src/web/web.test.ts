import { describe, it, expect } from "bun:test";
import { createApp } from "./index";

describe("web routes", () => {
  const app = createApp();

  describe("GET /setup", () => {
    it("returns 200", async () => {
      const res = await app.request("/setup");
      expect(res.status).toBe(200);
    });

    it("returns HTML content-type", async () => {
      const res = await app.request("/setup");
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("includes zmail in the page", async () => {
      const res = await app.request("/setup");
      const body = await res.text();
      expect(body).toContain("zmail");
    });
  });

  describe("GET /", () => {
    it("returns 200", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
    });

    it("returns HTML content-type", async () => {
      const res = await app.request("/");
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("includes HTMX polling for /status", async () => {
      const res = await app.request("/");
      const body = await res.text();
      expect(body).toContain("hx-get");
      expect(body).toContain("/status");
    });
  });

  describe("GET /status", () => {
    it("returns 200", async () => {
      const res = await app.request("/status");
      expect(res.status).toBe(200);
    });

    it("returns HTML fragment", async () => {
      const res = await app.request("/status");
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });

  describe("GET /search", () => {
    it("returns 200 with no query", async () => {
      const res = await app.request("/search");
      expect(res.status).toBe(200);
    });

    it("returns 200 with a query param", async () => {
      const res = await app.request("/search?q=invoice");
      expect(res.status).toBe(200);
    });

    it("includes a search input", async () => {
      const res = await app.request("/search");
      const body = await res.text();
      expect(body).toContain('name="q"');
    });
  });
});
