import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://pulsecheck:pulsecheck@localhost:5432/pulsecheck",
  apiToken: process.env.API_TOKEN ?? "",
  retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
  failuresBeforeIncident: Number(process.env.FAILURES_BEFORE_INCIDENT ?? 2),
  tickMs: Number(process.env.SCHEDULER_TICK_MS ?? 5000),
};
