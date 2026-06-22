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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchYahoo(ticker, rangeYears = 3, retries = 4) {
  // Yahoo throttlea ráfagas (429); reintentamos con backoff y rotamos de host.
  let j;
  for (let attempt = 0; ; attempt++) {
    await throttle(400);
    const host = attempt % 2 ? "query2" : "query1";
    const url =
      `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?range=${rangeYears}y&interval=1d`;
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(800 * 2 ** attempt); continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt); continue;
    }
    if (!res.ok) throw new Error(`Yahoo ${res.status} :: ${ticker}`);
    j = await res.json();
    break;
  }
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

// ---- Tiingo (API con key, fiable desde datacenter) ----
async function fetchTiingo(ticker, retries = 4) {
  const key = config.market.tiingoKey;
  if (!key) throw new Error("TIINGO_API_KEY no configurada");
  const start = "2023-01-01";
  // Tiingo no entiende sufijos tipo BRK.B → BRK-B
  const sym = ticker.toUpperCase().replace(".", "-");
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(sym)}/prices?startDate=${start}&token=${key}`;
  let data;
  for (let attempt = 0; ; attempt++) {
    await throttle(900); // Tiingo free: 50 req/h — vamos holgados
    let res;
    try { res = await fetch(url, { headers: { Accept: "application/json" } }); }
    catch (e) { if (attempt >= retries) throw e; await sleep(1000 * 2 ** attempt); continue; }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(2000 * 2 ** attempt); continue; }
    if (!res.ok) throw new Error(`Tiingo ${res.status} :: ${ticker}`);
    data = await res.json();
    break;
  }
  if (!Array.isArray(data) || !data.length) throw new Error(`Tiingo sin datos para ${ticker}`);
  return data
    .map((d) => ({ date: String(d.date).slice(0, 10), close: d.adjClose ?? d.close, volume: d.adjVolume ?? d.volume ?? null }))
    .filter((d) => Number.isFinite(d.close))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function fetchDailyPrices(ticker) {
  if (config.market.provider === "tiingo") return fetchTiingo(ticker);
  return fetchYahoo(ticker);
}
