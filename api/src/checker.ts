export interface CheckTarget {
  url: string;
  method: string;
  timeoutMs: number;
  expectedStatus: number;
}
export interface CheckOutcome {
  ok: boolean;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
}

/** Performs one HTTP check. Never throws: network failures become a failed outcome. */
export async function runCheck(t: CheckTarget): Promise<CheckOutcome> {
  const started = performance.now();
  try {
    const res = await fetch(t.url, {
      method: t.method,
      redirect: "follow",
      signal: AbortSignal.timeout(t.timeoutMs),
      headers: { "User-Agent": "PulseCheck/1.0 (uptime monitor)" },
    });
    const responseMs = Math.round(performance.now() - started);
    await res.body?.cancel().catch(() => {});
    const ok = res.status === t.expectedStatus;
    return { ok, statusCode: res.status, responseMs, error: ok ? null : `Expected ${t.expectedStatus}, got ${res.status}` };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    return {
      ok: false,
      statusCode: null,
      responseMs: timedOut ? t.timeoutMs : null,
      error: timedOut ? `Timed out after ${t.timeoutMs} ms` : (err.cause?.code ?? err.message ?? "Request failed").slice(0, 200),
    };
  }
}
