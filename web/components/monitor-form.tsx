"use client";

import { useState } from "react";
import { api, ApiError, INTERVALS, type Monitor } from "@/lib/api";
import { ErrorNote } from "./ui";

export function MonitorForm({ monitor, onSaved, onCancel }: { monitor?: Monitor; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: monitor?.name ?? "",
    url: monitor?.url ?? "https://",
    method: monitor?.method ?? "GET",
    intervalSeconds: monitor?.intervalSeconds ?? 60,
    expectedStatus: monitor?.expectedStatus ?? 200,
    timeoutMs: monitor?.timeoutMs ?? 10000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      await api(monitor ? `/monitors/${monitor.id}` : "/monitors", { method: monitor ? "PATCH" : "POST", body: f });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(Object.keys(err.fields).length ? "Please fix the highlighted fields." : err.message);
        setFields(err.fields);
      }
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => fields[k] && <p className="mt-1 text-xs text-red-600">{fields[k]}</p>;
  const intervalOptions = INTERVALS.some((i) => i.value === f.intervalSeconds) ? INTERVALS : [...INTERVALS, { label: `${f.intervalSeconds} seconds`, value: f.intervalSeconds }];

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <label className="text-sm sm:col-span-2">Name
        <input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Production API" autoFocus />{err("name")}
      </label>
      <label className="text-sm sm:col-span-2">URL
        <input className="input mt-1 font-mono" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} inputMode="url" />{err("url")}
      </label>
      <label className="text-sm">Check every
        <select className="input mt-1" value={f.intervalSeconds} onChange={(e) => setF({ ...f, intervalSeconds: Number(e.target.value) })}>
          {intervalOptions.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>{err("intervalSeconds")}
      </label>
      <label className="text-sm">Method
        <select className="input mt-1" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as "GET" | "HEAD" })}>
          <option>GET</option><option>HEAD</option>
        </select>
      </label>
      <label className="text-sm">Expected status
        <input className="input mt-1" type="number" value={f.expectedStatus} onChange={(e) => setF({ ...f, expectedStatus: Number(e.target.value) })} />{err("expectedStatus")}
      </label>
      <label className="text-sm">Timeout (ms)
        <input className="input mt-1" type="number" value={f.timeoutMs} onChange={(e) => setF({ ...f, timeoutMs: Number(e.target.value) })} />{err("timeoutMs")}
      </label>
      {error && <div className="sm:col-span-2"><ErrorNote message={error} /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : monitor ? "Save changes" : "Add monitor"}</button>
      </div>
    </form>
  );
}
