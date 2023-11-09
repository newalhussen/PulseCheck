import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrate } from "./migrate.js";
import { startScheduler } from "./scheduler.js";

await migrate();
const server = createApp().listen(config.port, () => console.log(`PulseCheck API on :${config.port}`));
const stop = startScheduler();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stop();
    server.close(() => void pool.end().then(() => process.exit(0)));
  });
}
