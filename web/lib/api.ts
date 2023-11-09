export type Status = "up" | "down" | "degraded" | "paused" | "pending";

export interface Monitor {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatus: number;
  paused: boolean;
  createdAt: string;
}
export interface MonitorRow extends Monitor {
  status: Status;
  lastCheck: { at: string; ok: boolean; statusCode: number | null; responseMs: number | null; error: string | null } | null;
  uptime24h: number | null;
  avgResponseMs24h: number | null;
}
export interface MonitorDetail extends Monitor {
  uptime: { "24h": number | null; "7d": number | null; "30d": number | null };
  responseMs24h: { avg: number | null; p95: number | null; min: number | null; max: number | null };
}
export interface Check { at: string; ok: boolean; statusCode: number | null; responseMs: number | null; error: string | null }
export interface Incident { id: string; monitorId: string; monitorName: string; startedAt: string; resolvedAt: string | null; durationSeconds: number; lastError: string | null }

export class ApiError extends Error {
  constructor(message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  }).catch(() => { throw new ApiError("Cannot reach the server. Check your connection."); });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.fields ?? {});
  return data as T;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 5 ? "just now" : `${duration(s)} ago`;
}

export const INTERVALS = [
  { label: "30 seconds", value: 30 }, { label: "1 minute", value: 60 }, { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 }, { label: "1 hour", value: 3600 },
];
