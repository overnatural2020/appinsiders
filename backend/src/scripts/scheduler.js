// Scheduler: corre la inspección semanal al principio de cada semana (cron de la
// config del schedule). Dos formas de uso:
//   - embebido en el server (server.js llama startScheduler())  ← un solo servicio
//   - como proceso aparte:  npm run scheduler
import cron from "node-cron";
import { pathToFileURL } from "node:url";
import { getSchedule } from "../store/usersStore.js";
import { runWeeklyInspection } from "../jobs/weeklyInspection.js";

let task = null;

export async function startScheduler({ runNow = false } = {}) {
  if (task) return task; // evita doble registro
  const schedule = await getSchedule();
  if (!cron.validate(schedule.cron)) {
    console.error(`[scheduler] cron inválido: ${schedule.cron}; no se programa`);
    return null;
  }
  console.log(`[scheduler] activo · cron "${schedule.cron}" (UTC) · enabled=${schedule.enabled}`);
  task = cron.schedule(schedule.cron, async () => {
    const s = await getSchedule(); // releer por si cambió en el panel
    if (!s.enabled) return console.log("[scheduler] deshabilitado; se omite la corrida");
    console.log(`[scheduler] ${new Date().toISOString()} · iniciando inspección semanal`);
    try { await runWeeklyInspection({ reingest: true }); }
    catch (e) { console.error(`[scheduler] error: ${e.message}`); }
  }, { timezone: "UTC" });

  if (runNow) runWeeklyInspection({ reingest: true });
  return task;
}

// CLI: node src/scripts/scheduler.js [--now]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startScheduler({ runNow: process.argv.includes("--now") });
}
