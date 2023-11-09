"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MonitorForm } from "@/components/monitor-form";
import { Card, ErrorNote, Stat, StatusBadge } from "@/components/ui";
import { ago, api, duration, type Incident, type MonitorRow } from "@/lib/api";

export default function Dashboard() {
  const [monitors, setMonitors] = useState<MonitorRow[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([api<MonitorRow[]>("/monitors"), api<Incident[]>("/incidents")]);
      setMonitors(m);
      setIncidents(i);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const active = (monitors ?? []).filter((m) => !m.paused);
  const upCount = active.filter((m) => m.status === "up").length;
  const downCount = active.filter((m) => m.status === "down" || m.status === "degraded").length;
  const withUptime = (monitors ?? []).filter((m) => m.uptime24h != null);
  const avgUptime = withUptime.length ? (withUptime.reduce((s, m) => s + (m.uptime24h as number), 0) / withUptime.length).toFixed(2) + "%" : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Monitors</h1>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add monitor</button>
      </div>
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Monitors" value={String(monitors?.length ?? "—")} hint={`${(monitors?.length ?? 0) - active.length} paused`} />
        <Stat label="Operational" value={String(upCount)} />
        <Stat label="Down or failing" value={String(downCount)} />
        <Stat label="Avg uptime (24h)" value={avgUptime} />
      </div>

      {adding && (
        <Card title="New monitor">
          <MonitorForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />
        </Card>
      )}

      {monitors === null && !error && <p className="text-sm text-muted">Loading monitors…</p>}
      {monitors?.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">No monitors yet</p>
          <p className="mt-1 text-sm text-muted">Add an endpoint and PulseCheck starts checking it right away.</p>
          <button className="btn btn-primary mt-4" onClick={() => setAdding(true)}>+ Add your first monitor</button>
        </div>
      )}

      {monitors && monitors.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {monitors.map((m) => (
              <li key={m.id}>
                <Link href={`/monitors/${m.id}`} className="grid grid-cols-1 items-center gap-2 px-4 py-3 hover:bg-bg sm:grid-cols-[1fr_auto_auto_auto] sm:gap-6">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate font-mono text-xs text-muted">{m.method} {m.url}</div>
                  </div>
                  <StatusBadge status={m.status} />
                  <div className="text-sm tabular-nums sm:text-right">
                    <div>{m.uptime24h != null ? `${m.uptime24h}%` : "—"}</div>
                    <div className="text-xs text-muted">uptime 24h</div>
                  </div>
                  <div className="text-sm tabular-nums sm:w-24 sm:text-right">
                    <div>{m.avgResponseMs24h != null ? `${m.avgResponseMs24h} ms` : "—"}</div>
                    <div className="text-xs text-muted">{m.lastCheck ? ago(m.lastCheck.at) : "no checks"}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card title="Recent incidents">
        {incidents.length === 0 ? (
          <p className="text-sm text-muted">No incidents recorded. </p>
        ) : (
          <ul className="divide-y divide-line">
            {incidents.slice(0, 8).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${i.resolvedAt ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{i.resolvedAt ? "Resolved" : "Ongoing"}</span>
                <Link href={`/monitors/${i.monitorId}`} className="font-medium hover:underline">{i.monitorName}</Link>
                <span className="text-muted">{new Date(i.startedAt).toLocaleString()} · {duration(i.durationSeconds)}</span>
                {i.lastError && <span className="truncate font-mono text-xs text-muted">{i.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
