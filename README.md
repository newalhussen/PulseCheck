# PulseCheck

Lightweight API uptime monitoring: add endpoints, get scheduled HTTP checks, response-time charts, uptime percentages and an incident history.

## Features
- Create, edit, pause/resume and delete monitors (URL, GET/HEAD, interval 30s–24h, timeout, expected status).
- Scheduled checks recorded with status code, response time and error; "Check now" on demand.
- Uptime for 24h / 7d / 30d, average and p95 response time, response-time chart, recent-check strip.
- Incidents open after N consecutive failures (default 2) and resolve automatically on recovery.
- Validation on every input; unreachable targets, timeouts and bad status codes are recorded, never crash the scheduler.
- Optional bearer token for the API; check history pruned after `RETENTION_DAYS`.

## Architecture
```
web/  Next.js + Tailwind  ──(server-side proxy /api/*)──▶  api/  Express + TypeScript  ──▶  PostgreSQL
```
The scheduler runs inside the API process: every few seconds it claims due monitors with `FOR UPDATE SKIP LOCKED`,
advances `next_check_at`, runs the checks concurrently and writes results, failure counters and incidents in one
transaction. No queue or extra infrastructure; running several API instances is safe.

## Setup
Prerequisites: Node 20+, PostgreSQL 14+.
```bash
createdb pulsecheck
cd api && cp .env.example .env     # set DATABASE_URL
npm install && npm run dev         # migrations run on start, API on :4000
cd ../web && cp .env.example .env.local
npm install && npm run dev         # UI on http://localhost:3000
```
Configuration (`api/.env`): `DATABASE_URL`, `PORT`, `API_TOKEN` (optional; set the same value in `web/.env.local`),
`RETENTION_DAYS`, `FAILURES_BEFORE_INCIDENT`, `SCHEDULER_TICK_MS`.

## Tests
`cd api && npm test` covers URL/input validation, incident rules, uptime/percentile maths and the HTTP checker
(status, timeout, unreachable host) against a local test server.

## Notes
- The dashboard itself has no login; the API token only protects the API. Put the UI behind your own auth or a VPN if exposed.
- Monitors can target any http(s) URL, including private addresses, because that is the point of an uptime monitor. Run it where that is acceptable.
