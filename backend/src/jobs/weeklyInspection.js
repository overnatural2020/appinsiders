// Inspección semanal: (opcional) refresca los Form 4 de los tickers conocidos,
// detecta anomalías de la última semana cerrada y envía el correo de alerta a
// todos los usuarios con alertas activas (haya o no anomalías).
import { pathToFileURL } from "node:url";
import { listTickers } from "../store/jsonStore.js";
import { getSchedule, saveSchedule, alertRecipients } from "../store/usersStore.js";
import { inspectLatestWeek } from "../pipeline/detect.js";
import { sendEmail, anomaliesEmail, noAnomaliesEmail } from "../email/mailer.js";
import { ingestTicker, cachePrices } from "../scripts/ingest.js";
import { config } from "../config.js";

function sinceLookback(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function runWeeklyInspection({ reingest = false } = {}) {
  const schedule = await getSchedule();
  const tickers = await listTickers();
  if (!tickers.length) {
    console.warn("[inspección] no hay tickers ingeridos; nada que inspeccionar");
    return { ok: false, reason: "sin tickers" };
  }

  // Refrescar datos (capta filings nuevos de la semana). Solo en la corrida programada.
  if (reingest) {
    console.log(`[inspección] refrescando ${tickers.length} tickers…`);
    await cachePrices(config.market.benchmark);
    const since = sinceLookback(config.schedule.reingestLookbackDays);
    for (const tk of tickers) {
      try { await ingestTicker(tk, since); }
      catch (e) { console.warn(`[inspección] ${tk}: ${e.message}`); }
    }
  }

  const { week, anomalies } = await inspectLatestWeek(tickers, {
    threshold: schedule.threshold, side: schedule.side,
  });
  const recipients = await alertRecipients();

  const { subject, html } = anomalies.length
    ? anomaliesEmail(week, anomalies)
    : noAnomaliesEmail(week);

  let send = { ok: false };
  try {
    send = await sendEmail({ to: recipients, subject, html });
  } catch (e) {
    console.error(`[inspección] error enviando correo: ${e.message}`);
    send = { ok: false, error: e.message };
  }

  const lastRun = {
    at: new Date().toISOString(),
    week,
    anomalies: anomalies.length,
    tickers: tickers.length,
    recipients: recipients.length,
    ok: !!send.ok,
    simulated: !!send.simulated,
  };
  await saveSchedule({ lastRun });
  console.log(`[inspección] semana ${week}: ${anomalies.length} anomalías → ${recipients.length} destinatarios (${send.ok ? (send.simulated ? "simulado" : "enviado") : "fallo"})`);
  return { ...lastRun, anomalies };
}

// CLI: node src/jobs/weeklyInspection.js [--reingest]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWeeklyInspection({ reingest: process.argv.includes("--reingest") })
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
