// Corte vertical end-to-end de UN ticker (AAPL): Form 4 reales → agregado semanal
// → precios semanales reales (AAPL + SPY) alineados a un eje de lunes → exceso
// forward a 13 semanas de una compra de insider real de hace > 3 meses.
//
// Imprime resultados intermedios en CADA paso para depurar. NO conecta nada al
// frontend; es un script de verificación.
//   SEC_USER_AGENT="... email" node src/scripts/verticalSlice.js [TICKER]
import { cikForTicker, listForm4Filings, fetchForm4Xml } from "../edgar/client.js";
import { parseForm4 } from "../pipeline/form4Parser.js";
import { aggregateWeekly, enrichOpportunistic } from "../pipeline/aggregate.js";
import { fetchDailyPrices } from "../market/client.js";
import { mondayOf } from "../pipeline/week.js";
import { alignToAxis, forwardExcess } from "../pipeline/alignWeekly.js";

const WK = 7 * 864e5;
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const log = (...a) => console.log(...a);

async function main() {
  const TICKER = (process.argv[2] || "AAPL").toUpperCase();
  log(`\n===== CORTE VERTICAL: ${TICKER} =====\n`);

  // (1) Form 4 reales desde EDGAR -------------------------------------------
  const cik = await cikForTicker(TICKER);
  const since = isoOf(Date.now() - 540 * 864e5); // ~18 meses para tener base
  const filings = await listForm4Filings(cik, since);
  log(`[1] EDGAR: CIK ${cik} · ${filings.length} Form 4 desde ${since}`);

  const txns = [];
  for (const f of filings) {
    try { parseForm4(await fetchForm4Xml(f)).forEach((t) => txns.push({ ...t, filingDate: f.filingDate })); }
    catch (e) { /* salta filings sin XML */ }
  }
  log(`    operaciones parseadas: ${txns.length}`);

  let weeks = aggregateWeekly(txns);
  weeks = enrichOpportunistic(txns, weeks);
  const buyWeeks = weeks.filter((w) => w.buyQ > 0);
  log(`[2] Agregado semanal: ${weeks.length} semanas · ${buyWeeks.length} con COMPRAS (P)`);
  log(`    semanas de compra:`, buyWeeks.map((w) => `${w.ws}:${w.buyQ}`).join("  ") || "(ninguna)");

  // (3) Precios semanales reales AAPL + SPY, alineados a un eje de lunes -----
  const [aaplPx, spyPx] = await Promise.all([fetchDailyPrices(TICKER), fetchDailyPrices("SPY")]);
  log(`\n[3] Precios diarios: ${TICKER} ${aaplPx.length} días · SPY ${spyPx.length} días`);

  // Eje contiguo de lunes desde el primer precio hasta hoy.
  const firstMonday = mondayOf(aaplPx[0].date);
  const lastMonday = mondayOf(isoOf(Date.now()));
  const axis = [];
  for (let t = new Date(firstMonday + "T00:00:00Z").getTime(); t <= new Date(lastMonday + "T00:00:00Z").getTime(); t += WK) {
    axis.push(isoOf(t));
  }
  const aapl = alignToAxis(axis, aaplPx, { mondayOf });
  const spy = alignToAxis(axis, spyPx, { mondayOf });
  log(`    eje de lunes: ${axis.length} semanas (${axis[0]} … ${axis[axis.length - 1]})`);
  log(`    muestra alineada [${TICKER}] últimas 3:`, aapl.slice(-3).map((x) => x?.toFixed(2)));
  log(`    muestra alineada [SPY]  últimas 3:`, spy.slice(-3).map((x) => x?.toFixed(2)));

  // (4) Una compra real de > 3 meses y su exceso forward a 13 semanas -------
  const cutoff = isoOf(Date.now() - 95 * 864e5); // > 3 meses, deja margen para 13 sem
  const candidates = buyWeeks.filter((w) => w.ws <= cutoff).sort((a, b) => (a.ws < b.ws ? 1 : -1));
  log(`\n[4] Compras de insider con > 3 meses de antigüedad: ${candidates.length}`);
  if (!candidates.length) { log("    (no hay compra elegible para medir forward) — fin"); return; }

  const pick = candidates[0]; // la más reciente que ya tiene 13 semanas de forward
  const wi = axis.indexOf(pick.ws);
  log(`    señal elegida: ${TICKER} compra semana ${pick.ws} · ${pick.buyQ} acciones · idx eje ${wi}`);
  if (wi < 0) { log("    (la semana de la señal no cae en el eje) — fin"); return; }

  const p0 = aapl[wi], p1 = aapl[wi + 13], s0 = spy[wi], s1 = spy[wi + 13];
  log(`    precios: ${TICKER} ${p0?.toFixed(2)} → ${p1?.toFixed(2)} · SPY ${s0?.toFixed(2)} → ${s1?.toFixed(2)}`);
  const exc = forwardExcess(aapl, spy, wi, 13);
  if (exc == null) { log("    forwardExcess: null (sin 13 semanas de forward todavía)"); return; }
  const rA = p1 / p0 - 1, rS = s1 / s0 - 1;
  log(`\n    RESULTADO: ${TICKER} ${(rA * 100).toFixed(1)}% · SPY ${(rS * 100).toFixed(1)}% · EXCESO 13 sem = ${(exc * 100).toFixed(1)}%`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
