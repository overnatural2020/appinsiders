// Cliente de datos de mercado: serie de precios diarios (cierre ajustado).
// Proveedor por defecto: Yahoo Finance (gratis, sin API key). Devuelve siempre
// [{ date: 'YYYY-MM-DD', close: Number, volume: Number }] ascendente por fecha.
import { config } from "../config.js";

const isoFromEpoch = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

let lastReq = 0;
async function throttle(minMs) {
  const wait = minMs - (Date.now() - lastReq);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
}

async function fetchYahoo(ticker, rangeYears = 3) {
  await throttle(300);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${rangeYears}y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo ${res.status} :: ${ticker}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`Yahoo sin datos para ${ticker}: ${j?.chart?.error?.description || "?"}`);
  const adj = r.indicators?.adjclose?.[0]?.adjclose;
  const raw = r.indicators?.quote?.[0]?.close;
  const vol = r.indicators?.quote?.[0]?.volume || [];
  const closes = adj || raw || [];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i];
    if (Number.isFinite(c)) out.push({ date: isoFromEpoch(r.timestamp[i]), close: c, volume: vol[i] ?? null });
  }
  return out;
}

export async function fetchDailyPrices(ticker) {
  // (yahoo por ahora; stooq/alphavantage quedan como extensión futura)
  return fetchYahoo(ticker);
}
