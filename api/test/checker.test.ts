import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "../src/checker.js";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/ok") res.end("fine");
    else if (req.url === "/boom") { res.statusCode = 503; res.end("down"); }
    else if (req.url === "/slow") setTimeout(() => res.end("late"), 1500);
    else res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

describe("runCheck", () => {
  it("passes on the expected status and records timing", async () => {
    const r = await runCheck({ url: `${base}/ok`, method: "GET", timeoutMs: 2000, expectedStatus: 200 });
    expect(r.ok).toBe(true);
    expect(r.responseMs).toBeGreaterThanOrEqual(0);
  });
  it("fails on an unexpected status", async () => {
    const r = await runCheck({ url: `${base}/boom`, method: "GET", timeoutMs: 2000, expectedStatus: 200 });
    expect(r).toMatchObject({ ok: false, statusCode: 503 });
    expect(r.error).toContain("503");
  });
  it("fails on timeout", async () => {
    const r = await runCheck({ url: `${base}/slow`, method: "GET", timeoutMs: 300, expectedStatus: 200 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Timed out");
  });
  it("fails without throwing when the host is unreachable", async () => {
    const r = await runCheck({ url: "http://127.0.0.1:1", method: "GET", timeoutMs: 1000, expectedStatus: 200 });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBeNull();
  });
});
