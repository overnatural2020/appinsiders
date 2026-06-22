// CLI de ingesta por universo de tickers.
//   node src/scripts/ingest.js --tickers INTC,NVDA,AMBA --since 2025-06-01
// Flujo: ticker -> CIK -> lista de Form 4 -> XML -> parse -> agrega semanal -> guarda.
// Además descarga y cachea la serie de precios diaria (ticker + benchmark) para
// que el frontend pueda construir price[] y bench[] reales.
import { cikForTicker, listForm4Filings, fetchForm4Xml } from "../edgar/client.js";
import { parseForm4 } from "../pipeline/form4Parser.js";
import { aggregateWeekly, enrichOpportunistic } from "../pipeline/aggregate.js";
import { fetchDailyPrices } from "../market/client.js";
import { saveTransactions, saveWeekly, savePrices, getWeekly } from "../store/jsonStore.js";
import { config } from "../config.js";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

// Refresca precios solo si están "viejos" (por defecto > ~20h) para no gastar
// peticiones del proveedor en cada corrida. force=true ignora la frescura.
async function cachePrices(ticker, { force = false, maxAgeHours = 20 } = {}) {
  const T = ticker.toUpperCase();
  try {
    if (!force) {
      const existing = await getPrices(T);
      if (existing?.prices?.length && existing.updatedAt) {
        const ageH = (Date.now() - Date.parse(existing.updatedAt)) / 36e5;
        if (ageH < maxAgeHours) { console.log(`  · precios ${ticker}: frescos (${ageH.toFixed(0)}h), se omite`); return; }
      }
    }
    const prices = await fetchDailyPrices(ticker);
    if (prices?.length) {
      await savePrices(T, prices);
      console.log(`  · precios ${ticker}: ${prices.length} días`);
    }
  } catch (e) {
    console.warn(`  ! precios ${ticker}: ${e.message}`);
  }
}

export { cachePrices };
export async function ingestTicker(ticker, sinceISO) {
  const cik = await cikForTicker(ticker);
  const filings = await listForm4Filings(cik, sinceISO);
  console.log(`[${ticker}] CIK ${cik} · ${filings.length} Form 4 desde ${sinceISO}`);

  const txns = [];
  for (const f of filings) {
    try {
      const xml = await fetchForm4Xml(f);
      const parsed = parseForm4(xml).map((t) => ({ ...t, filingDate: f.filingDate }));
      txns.push(...parsed);
    } catch (e) {
      console.warn(`  ! ${f.accession}: ${e.message}`);
    }
  }

  let weeks = aggregateWeekly(txns);
  weeks = enrichOpportunistic(txns, weeks);

  // Salvaguarda: no sobrescribir datos buenos con un resultado vacío (p.ej. si
  // todas las descargas de XML fallaron por throttling). Si no parseamos nada
  // pero ya había datos guardados, conservamos los anteriores.
  if (txns.length === 0) {
    const prev = await getWeekly(ticker);
    if (prev?.weeks?.length) {
      console.warn(`  ! ${ticker}: 0 operaciones parseadas; conservo datos previos (${prev.weeks.length} semanas)`);
      await cachePrices(ticker);
      return;
    }
  }

  await saveTransactions(ticker, txns);
  await saveWeekly(ticker, weeks);
  await cachePrices(ticker);
  console.log(`  → ${txns.length} operaciones, ${weeks.length} semanas guardadas`);
}

async function main() {
  const args = parseArgs(process.argv);
  const tickers = (args.tickers || "").split(",").map((s) => s.trim()).filter(Boolean);
  const since = args.since || "2025-01-01";
  if (!tickers.length) {
    console.error("Uso: node src/scripts/ingest.js --tickers INTC,NVDA --since 2025-06-01");
    process.exit(1);
  }
  // Benchmark: precios una sola vez (sin Form 4).
  await cachePrices(config.market.benchmark);
  for (const tk of tickers) {
    try { await ingestTicker(tk, since); }
    catch (e) { console.error(`[${tk}] ERROR: ${e.message}`); }
  }
}

// Solo corre como CLI si se invoca directamente (no al importar desde el job).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
