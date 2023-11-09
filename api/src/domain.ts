import { z } from "zod";

/** Only plain http(s) URLs with a host are monitorable. */
export function isMonitorableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0 && !u.username && !u.password;
  } catch {
    return false;
  }
}

export const monitorInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  url: z.string().trim().max(2000).refine(isMonitorableUrl, "Enter a valid http(s) URL without credentials"),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  intervalSeconds: z.number().int().min(30, "Minimum interval is 30 seconds").max(86400),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  expectedStatus: z.number().int().min(100).max(599).default(200),
});
export type MonitorInput = z.infer<typeof monitorInput>;
export const monitorPatch = z
  .object({
    name: monitorInput.shape.name.optional(),
    url: monitorInput.shape.url.optional(),
    method: z.enum(["GET", "HEAD"]).optional(),
    intervalSeconds: monitorInput.shape.intervalSeconds.optional(),
    timeoutMs: monitorInput.shape.timeoutMs.optional(),
    expectedStatus: monitorInput.shape.expectedStatus.optional(),
    paused: z.boolean().optional(),
  })
  .strict();

export type IncidentAction = "open" | "resolve" | "none";

/** Decide what to do with incidents after a check result. */
export function incidentAction(ok: boolean, consecutiveFailures: number, threshold: number, hasOpenIncident: boolean): IncidentAction {
  if (ok) return hasOpenIncident ? "resolve" : "none";
  return !hasOpenIncident && consecutiveFailures >= threshold ? "open" : "none";
}

export function uptimePercent(ok: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((ok / total) * 10000) / 100;
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
