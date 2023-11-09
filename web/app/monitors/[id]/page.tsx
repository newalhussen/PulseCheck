"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MonitorForm } from "@/components/monitor-form";
import { Card, ErrorNote, ResponseChart, Stat, UptimeStrip } from "@/components/ui";
import { ApiError, api, duration, type Check, type Incident, type MonitorDetail } from "@/lib/api";

const RANGES = [{ label: "24h", hours: 24 }, { label: "7d", hours: 168 }, { label: "30d", hours: 720 }];

export default function MonitorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [m, setM] = useState<MonitorDetail | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, c, i] = await Promise.all([
        api<MonitorDetail>(`/monitors/${id}`),
        api<Check[]>(`/monitors/${id}/checks?hours=${hours}&limit=1000`),
        api<Incident[]>(`/incidents?monitorId=${id}`),
      ]);
      setM(d); setChecks(c); setIncidents(i); setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, hours]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); } finally { setBusy(false); }
  }

  if (!m) return error ? <div className="space-y-3"><ErrorNote message={error} /><Link href="/" className="text-sm underline">Back to monitors</Link></div> : <p className="text-sm text-muted">Loading…</p>;
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const ms = (v: number | null) => (v == null ? "—" : `${v} ms`);
  const history = [...checks].reverse().slice(0, 50);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:underline">← All monitors</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{m.name} {m.paused && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-xs text-slate-700">Paused</span>}</h1>
          <p className="truncate font-mono text-sm text-muted">{m.method} {m.url} · every {duration(m.intervalSeconds)} · expects {m.expectedStatus}</p>
        </div>
        <button className="btn" disabled={busy} onClick={() => act(() => api(`/monitors/${id}/check`, { method: "POST" }))}>Check now</button>
        <button className="btn" disabled={busy} onClick={() => act(() => api(`/monitors/${id}`, { method: "PATCH", body: { paused: !m.paused } }))}>{m.paused ? "Resume" : "Pause"}</button>
        <button className="btn" onClick={() => setEditing((v) => !v)}>Edit</button>
        <button className="btn btn-danger" disabled={busy} onClick={async () => { if (confirm(`Delete "${m.name}" and all its history?`)) { await api(`/monitors/${id}`, { method: "DELETE" }); router.push("/"); } }}>Delete</button>
      </div>
      {error && <ErrorNote message={error} />}
      {editing && <Card title="Edit monitor"><MonitorForm monitor={m} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} /></Card>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Uptime 24h" value={pct(m.uptime["24h"])} />
        <Stat label="Uptime 7d" value={pct(m.uptime["7d"])} />
        <Stat label="Uptime 30d" value={pct(m.uptime["30d"])} />
        <Stat label="Avg response 24h" value={ms(m.responseMs24h.avg)} hint={`p95 ${ms(m.responseMs24h.p95)}`} />
      </div>

      <Card title="Response time" aside={
        <div className="flex gap-1">{RANGES.map((r) => <button key={r.hours} onClick={() => setHours(r.hours)} className={`btn !px-2 !py-0.5 text-xs ${hours === r.hours ? "btn-primary" : ""}`}>{r.label}</button>)}</div>
      }>
        <ResponseChart checks={checks} />
        <div className="mt-3"><UptimeStrip checks={checks} /></div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Incidents">
          {incidents.length === 0 ? <p className="text-sm text-muted">No incidents. An incident opens after repeated failed checks.</p> : (
            <ul className="divide-y divide-line text-sm">
              {incidents.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${i.resolvedAt ? "bg-emerald-500" : "bg-red-500"}`} />{i.resolvedAt ? "Resolved" : "Ongoing"} · {duration(i.durationSeconds)}</div>
                  <div className="text-xs text-muted">{new Date(i.startedAt).toLocaleString()} {i.lastError && `· ${i.lastError}`}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent checks">
          {history.length === 0 ? <p className="text-sm text-muted">No checks yet.</p> : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="pb-1">Time</th><th>Result</th><th className="text-right">Time</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {history.map((c) => (
                    <tr key={c.at}>
                      <td className="py-1 text-muted">{new Date(c.at).toLocaleTimeString()}</td>
                      <td className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? `OK ${c.statusCode}` : c.error ?? "Failed"}</td>
                      <td className="text-right tabular-nums">{c.responseMs != null ? `${c.responseMs} ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
