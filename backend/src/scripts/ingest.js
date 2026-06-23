// CLI de ingesta por universo de tickers.
//   node src/scripts/ingest.js --tickers INTC,NVDA,AMBA --since 2025-06-01
// Flujo: ticker -> CIK -> lista de Form 4 -> XML -> parse -> agrega semanal -> guarda.
// Además descarga y cachea la serie de precios diaria (ticker + benchmark) para
// que el frontend pueda construir price[] y bench[] reales.
import { cikForTicker, listForm4Filings, fetchForm4Xml } from "../edgar/client.js";
import { parseForm4 } from "../pipeline/form4Parser.js";
import { aggregateWeekly, enrichOpportunistic } from "../pipeline/aggregate.js";
import { fetchDailyPrices } from "../market/client.js";
import { saveTransactions, saveWeekly, savePrices, getWeekly, getPrices } from "../store/jsonStore.js";
import { createDiskCache } from "../store/diskCache.js";
import { config } from "../config.js";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const DAY = 864e5;

// Cachés en disco (perezosas) para no re-pegarle a EDGAR/precios en cada corrida.
// Precios: TTL largo (los cierres semanales históricos no cambian).
// Form 4 por ticker: TTL de 1 día (pueden llegar filings nuevos a diario).
let _priceCache, _form4Cache;
const priceCache = () => (_priceCache ??= createDiskCache({
  dir: join(config.dataDir, "cache", "prices"),
  fetcher: (ticker) => fetchDailyPrices(ticker),
}));
const form4Cache = () => (_form4Cache ??= createDiskCache({
  dir: join(config.dataDir, "cache", "form4"),
  fetcher: async (key) => {
    const [ticker, sinceISO] = key.split("|");
    const cik = await cikForTicker(ticker);
    const filings = await listForm4Filings(cik, sinceISO);
    const txns = [];
    for (const f of filings) {
      try { parseForm4(await fetchForm4Xml(f)).forEach((t) => txns.push({ ...t, filingDate: f.filingDate })); }
      catch (e) { console.warn(`  ! ${f.accession}: ${e.message}`); }
    }
    return { cik, nFilings: filings.length, txns };
  },
}));

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
    // diskCache con TTL largo (6 días): los cierres semanales históricos no
    // cambian, así no re-bajamos toda la serie en cada corrida.
    const { value: prices, fromCache } = await priceCache().getOrFetch(T, { maxAgeMs: 6 * DAY });
    if (prices?.length) {
      await savePrices(T, prices);
      console.log(`  · precios ${ticker}: ${prices.length} días${fromCache ? " (caché)" : ""}`);
    }
  } catch (e) {
    console.warn(`  ! precios ${ticker}: ${e.message}`);
    globalThis.__lastPriceError = `${T}: ${e.message}`;
  }
}

export { cachePrices };
export async function ingestTicker(ticker, sinceISO) {
  // Form 4 por ticker vía diskCache (TTL 1 día): evita re-descargar y re-parsear
  // todos los XML en corridas repetidas el mismo día.
  const { value: f4, fromCache } = await form4Cache().getOrFetch(`${ticker}|${sinceISO}`, { maxAgeMs: DAY });
  const txns = f4.txns;
  console.log(`[${ticker}] CIK ${f4.cik} · ${f4.nFilings} Form 4 desde ${sinceISO}${fromCache ? " (caché)" : ""} · ${txns.length} operaciones`);

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
