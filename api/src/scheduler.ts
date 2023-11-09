import { config } from "./config.js";
import { pool } from "./db.js";
import { runCheck } from "./checker.js";
import { incidentAction } from "./domain.js";

export interface DueMonitor {
  id: string;
  url: string;
  method: string;
  timeout_ms: number;
  expected_status: number;
}

/** Run one monitor now and persist the result, failure counter and incident state. */
export async function checkAndRecord(m: DueMonitor): Promise<void> {
  const outcome = await runCheck({ url: m.url, method: m.method, timeoutMs: m.timeout_ms, expectedStatus: m.expected_status });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      "UPDATE monitors SET consecutive_failures = CASE WHEN $2 THEN 0 ELSE consecutive_failures + 1 END WHERE id = $1 RETURNING consecutive_failures",
      [m.id, outcome.ok],
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK"); // deleted while the check was running
      return;
    }
    await client.query("INSERT INTO checks (monitor_id, ok, status_code, response_ms, error) VALUES ($1,$2,$3,$4,$5)", [
      m.id, outcome.ok, outcome.statusCode, outcome.responseMs, outcome.error,
    ]);
    const open = await client.query("SELECT id FROM incidents WHERE monitor_id = $1 AND resolved_at IS NULL", [m.id]);
    const action = incidentAction(outcome.ok, upd.rows[0].consecutive_failures, config.failuresBeforeIncident, (open.rowCount ?? 0) > 0);
    if (action === "open") {
      await client.query("INSERT INTO incidents (monitor_id, last_error) VALUES ($1,$2) ON CONFLICT DO NOTHING", [m.id, outcome.error]);
    } else if (action === "resolve") {
      await client.query("UPDATE incidents SET resolved_at = now() WHERE monitor_id = $1 AND resolved_at IS NULL", [m.id]);
    } else if (!outcome.ok) {
      await client.query("UPDATE incidents SET last_error = $2 WHERE monitor_id = $1 AND resolved_at IS NULL", [m.id, outcome.error]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("failed to record check", m.id, e);
  } finally {
    client.release();
  }
}

let running = false;

/** Claim due monitors (SKIP LOCKED keeps several instances safe), push their next run forward, then check them. */
export async function tick(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const { rows } = await pool.query<DueMonitor>(
      `UPDATE monitors SET next_check_at = now() + make_interval(secs => interval_seconds)
       WHERE id IN (SELECT id FROM monitors WHERE NOT paused AND next_check_at <= now() ORDER BY next_check_at LIMIT 50 FOR UPDATE SKIP LOCKED)
       RETURNING id, url, method, timeout_ms, expected_status`,
    );
    await Promise.all(rows.map(checkAndRecord));
    return rows.length;
  } catch (e) {
    console.error("scheduler tick failed", e);
    return 0;
  } finally {
    running = false;
  }
}

export function startScheduler(): () => void {
  const timer = setInterval(() => void tick(), config.tickMs);
  const prune = async () => {
    await pool
      .query("DELETE FROM checks WHERE checked_at < now() - make_interval(days => $1)", [config.retentionDays])
      .catch((e) => console.error("prune failed", e));
  };
  void prune();
  const pruneTimer = setInterval(prune, 6 * 3600 * 1000);
  void tick();
  return () => {
    clearInterval(timer);
    clearInterval(pruneTimer);
  };
}
