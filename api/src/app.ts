import crypto from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { monitorInput, monitorPatch, percentile, uptimePercent } from "./domain.js";
import { checkAndRecord } from "./scheduler.js";

const MONITOR_COLS = "id, name, url, method, interval_seconds, timeout_ms, expected_status, paused, created_at";

function monitorDto(r: Record<string, any>) {
  return {
    id: r.id, name: r.name, url: r.url, method: r.method, intervalSeconds: r.interval_seconds, timeoutMs: r.timeout_ms,
    expectedStatus: r.expected_status, paused: r.paused, createdAt: r.created_at,
  };
}

/** Per-monitor stats for a window (hours). */
const STATS_SQL = `
  SELECT m.id,
    count(c.*)::int AS total, count(c.*) FILTER (WHERE c.ok)::int AS ok,
    round(avg(c.response_ms) FILTER (WHERE c.ok))::int AS avg_ms
  FROM monitors m LEFT JOIN checks c ON c.monitor_id = m.id AND c.checked_at > now() - make_interval(hours => $1)
  GROUP BY m.id`;

function tokenOk(header: string | undefined): boolean {
  if (!config.apiToken) return true;
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(config.apiToken);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: "20kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", (req, res, next) => {
    if (!tokenOk(req.header("authorization"))) return void res.status(401).json({ error: "Unauthorized" });
    next();
  });

  const idParam = (req: Request) => {
    const id = String(req.params.id);
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  };
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  app.get("/api/monitors", wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT ${MONITOR_COLS.split(", ").map((c) => "m." + c).join(", ")},
        last.ok AS last_ok, last.status_code AS last_status, last.response_ms AS last_ms, last.checked_at AS last_at, last.error AS last_error,
        s.total, s.ok AS ok_count, s.avg_ms,
        EXISTS (SELECT 1 FROM incidents i WHERE i.monitor_id = m.id AND i.resolved_at IS NULL) AS has_incident
      FROM monitors m
      LEFT JOIN LATERAL (SELECT * FROM checks WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) last ON true
      LEFT JOIN (${STATS_SQL}) s ON s.id = m.id
      ORDER BY m.created_at DESC`, [24]);
    res.json(rows.map((r) => ({
      ...monitorDto(r),
      status: r.paused ? "paused" : r.last_at == null ? "pending" : r.has_incident ? "down" : r.last_ok ? "up" : "degraded",
      lastCheck: r.last_at ? { at: r.last_at, ok: r.last_ok, statusCode: r.last_status, responseMs: r.last_ms, error: r.last_error } : null,
      uptime24h: uptimePercent(r.ok_count, r.total),
      avgResponseMs24h: r.avg_ms,
    })));
  }));

  app.post("/api/monitors", wrap(async (req, res) => {
    const m = monitorInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO monitors (name, url, method, interval_seconds, timeout_ms, expected_status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${MONITOR_COLS}`,
      [m.name, m.url, m.method, m.intervalSeconds, m.timeoutMs, m.expectedStatus],
    );
    res.status(201).json(monitorDto(rows[0]));
  }));

  app.get("/api/monitors/:id", wrap(async (req, res) => {
    const id = idParam(req);
    if (!id) return void res.status(404).json({ error: "Not found" });
    const { rows } = await pool.query(`SELECT ${MONITOR_COLS} FROM monitors WHERE id = $1`, [id]);
    if (!rows[0]) return void res.status(404).json({ error: "Not found" });
    const windows: Record<string, number | null> = {};
    for (const [key, hours] of [["24h", 24], ["7d", 168], ["30d", 720]] as const) {
      const s = await pool.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE ok)::int AS ok FROM checks WHERE monitor_id = $1 AND checked_at > now() - make_interval(hours => $2)",
        [id, hours],
      );
      windows[key] = uptimePercent(s.rows[0].ok, s.rows[0].total);
    }
    const times = (await pool.query(
      "SELECT response_ms FROM checks WHERE monitor_id = $1 AND ok AND checked_at > now() - interval '24 hours' ORDER BY response_ms", [id],
    )).rows.map((r) => r.response_ms as number);
    res.json({
      ...monitorDto(rows[0]),
      uptime: windows,
      responseMs24h: {
        avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
        p95: percentile(times, 95), min: times[0] ?? null, max: times[times.length - 1] ?? null,
      },
    });
  }));

  app.patch("/api/monitors/:id", wrap(async (req, res) => {
    const id = idParam(req);
    if (!id) return void res.status(404).json({ error: "Not found" });
    const p = monitorPatch.parse(req.body);
    const cols: Record<string, unknown> = {
      name: p.name, url: p.url, method: p.method, interval_seconds: p.intervalSeconds, timeout_ms: p.timeoutMs,
      expected_status: p.expectedStatus, paused: p.paused,
    };
    const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return void res.status(400).json({ error: "Nothing to update" });
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
    if (p.paused === false) sets.push("next_check_at = now()"); // resume checks right away
    const { rows } = await pool.query(`UPDATE monitors SET ${sets.join(", ")} WHERE id = $1 RETURNING ${MONITOR_COLS}`, [id, ...entries.map(([, v]) => v)]);
    if (!rows[0]) return void res.status(404).json({ error: "Not found" });
    res.json(monitorDto(rows[0]));
  }));

  app.delete("/api/monitors/:id", wrap(async (req, res) => {
    const id = idParam(req);
    const r = id ? await pool.query("DELETE FROM monitors WHERE id = $1", [id]) : null;
    if (!r?.rowCount) return void res.status(404).json({ error: "Not found" });
    res.status(204).end();
  }));

  app.post("/api/monitors/:id/check", wrap(async (req, res) => {
    const id = idParam(req);
    const { rows } = id ? await pool.query("SELECT id, url, method, timeout_ms, expected_status FROM monitors WHERE id = $1", [id]) : { rows: [] };
    if (!rows[0]) return void res.status(404).json({ error: "Not found" });
    await checkAndRecord(rows[0]);
    const last = await pool.query("SELECT ok, status_code, response_ms, error, checked_at FROM checks WHERE monitor_id = $1 ORDER BY checked_at DESC LIMIT 1", [id]);
    res.json(last.rows[0] ?? null);
  }));

  app.get("/api/monitors/:id/checks", wrap(async (req, res) => {
    const id = idParam(req);
    if (!id) return void res.status(404).json({ error: "Not found" });
    const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24));
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    const { rows } = await pool.query(
      `SELECT checked_at, ok, status_code, response_ms, error FROM (
         SELECT * FROM checks WHERE monitor_id = $1 AND checked_at > now() - make_interval(hours => $2) ORDER BY checked_at DESC LIMIT $3
       ) t ORDER BY checked_at ASC`, [id, hours, limit]);
    res.json(rows.map((r) => ({ at: r.checked_at, ok: r.ok, statusCode: r.status_code, responseMs: r.response_ms, error: r.error })));
  }));

  app.get("/api/incidents", wrap(async (req, res) => {
    const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
    if (monitorId && !/^[0-9a-f-]{36}$/i.test(monitorId)) return void res.status(400).json({ error: "Invalid monitorId" });
    const { rows } = await pool.query(
      `SELECT i.id, i.monitor_id, m.name AS monitor_name, i.started_at, i.resolved_at, i.last_error
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       WHERE ($1::uuid IS NULL OR i.monitor_id = $1) ORDER BY i.started_at DESC LIMIT 100`, [monitorId]);
    res.json(rows.map((r) => ({
      id: r.id, monitorId: r.monitor_id, monitorName: r.monitor_name, startedAt: r.started_at, resolvedAt: r.resolved_at,
      durationSeconds: Math.round(((r.resolved_at ? new Date(r.resolved_at).getTime() : Date.now()) - new Date(r.started_at).getTime()) / 1000),
      lastError: r.last_error,
    })));
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return void res.status(400).json({ error: "Validation failed", fields: Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message])) });
    }
    if ((err as { type?: string }).type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid JSON" });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}
