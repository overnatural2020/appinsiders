// Persistencia mínima en archivos JSON. Suficiente para arrancar y para un solo
// droplet. Para producción/escala: cambiar por Postgres (DigitalOcean Managed DB)
// manteniendo esta misma interfaz (getWeekly/saveWeekly/...).
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

const dir = config.dataDir;
const file = (name) => join(dir, name);

async function ensureDir() {
  await mkdir(dir, { recursive: true });
}

export async function saveTransactions(ticker, txns) {
  await ensureDir();
  await writeFile(file(`tx_${ticker}.json`), JSON.stringify(txns));
}
export async function getTransactions(ticker) {
  try { return JSON.parse(await readFile(file(`tx_${ticker}.json`), "utf8")); }
  catch { return []; }
}
export async function saveWeekly(ticker, weeks) {
  await ensureDir();
  await writeFile(file(`weekly_${ticker}.json`), JSON.stringify({ ticker, weeks, updatedAt: new Date().toISOString() }));
}
export async function getWeekly(ticker) {
  try { return JSON.parse(await readFile(file(`weekly_${ticker}.json`), "utf8")); }
  catch { return null; }
}
export async function listTickers() {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.startsWith("weekly_")).map((f) => f.slice(7, -5));
  } catch { return []; }
}

// ---- serie de precios diaria (cache local) ----
export async function savePrices(ticker, prices) {
  await ensureDir();
  await writeFile(file(`prices_${ticker}.json`), JSON.stringify({ ticker, prices, updatedAt: new Date().toISOString() }));
}
export async function getPrices(ticker) {
  try { return JSON.parse(await readFile(file(`prices_${ticker}.json`), "utf8")); }
  catch { return null; }
}
