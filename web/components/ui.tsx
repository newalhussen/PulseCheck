"use client";

import type { Check, Status } from "@/lib/api";

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  up: { label: "Operational", dot: "bg-emerald-500", text: "text-emerald-600" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-600" },
  degraded: { label: "Failing", dot: "bg-amber-500", text: "text-amber-600" },
  paused: { label: "Paused", dot: "bg-slate-400", text: "text-muted" },
  pending: { label: "Waiting for first check", dot: "bg-slate-400", text: "text-muted" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.text}`}>
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function Card({ title, children, aside }: { title?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{message}</div>;
}

/** Response-time line chart with failed checks marked on the baseline. */
export function ResponseChart({ checks }: { checks: Check[] }) {
  const W = 800, H = 200, P = { l: 44, r: 8, t: 10, b: 22 };
  const pts = checks.filter((c) => c.ok && c.responseMs != null);
  if (checks.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough data yet. Checks appear here as they run.</p>;
  const t0 = new Date(checks[0].at).getTime();
  const t1 = new Date(checks[checks.length - 1].at).getTime() || t0 + 1;
  const max = Math.max(50, ...pts.map((c) => c.responseMs as number)) * 1.1;
  const x = (iso: string) => P.l + ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (ms: number) => P.t + (1 - ms / max) * (H - P.t - P.b);
  const line = pts.map((c, i) => `${i ? "L" : "M"}${x(c.at).toFixed(1)} ${y(c.responseMs as number).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Response time over time">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v} ms</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {checks.filter((c) => !c.ok).map((c) => (
        <rect key={c.at} x={x(c.at) - 1.5} y={P.t} width="3" height={H - P.t - P.b} fill="#ef4444" opacity=".35"><title>{`${new Date(c.at).toLocaleString()}: ${c.error ?? "failed"}`}</title></rect>
      ))}
      <text x={P.l} y={H - 5} fontSize="11" fill="var(--muted)">{fmt(t0)}</text>
      <text x={W - P.r} y={H - 5} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(t1)}</text>
    </svg>
  );
}

/** Strip of recent checks: green = ok, red = failed. */
export function UptimeStrip({ checks }: { checks: Check[] }) {
  const recent = checks.slice(-60);
  if (recent.length === 0) return null;
  return (
    <div className="flex h-8 items-stretch gap-[2px]" role="img" aria-label="Recent check results">
      {recent.map((c) => (
        <div key={c.at} title={`${new Date(c.at).toLocaleString()} · ${c.ok ? `${c.responseMs} ms` : c.error}`} className={`min-w-[3px] flex-1 rounded-sm ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} />
      ))}
    </div>
  );
}
