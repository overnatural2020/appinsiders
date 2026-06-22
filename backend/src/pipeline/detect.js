// Motor de detección de anomalías (portado del frontend) para correr en el job
// semanal. Para cada ticker construye una cuadrícula semanal contigua, calcula el
// z-score de la compra/venta de la semana objetivo contra su base de 52 semanas y
// puntúa la convicción. Mismos pesos/umbrales que el motor del frontend.
import { mondayOf } from "./week.js";
import { getWeekly, getPrices } from "../store/jsonStore.js";

const WK = 7 * 864e5;
const LAG_MS = 4 * 864e5; // rezago de presentación del Form 4
const ROLE_W = { CEO: 1.0, CFO: 0.9, DIR: 0.5, OWN: 0.4, OFF: 0.6, OTHER: 0.3 };

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a, m) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)));
const clamp = (x) => Math.max(0, Math.min(1, x));

function conviction(z, contribs, type, dollar) {
  const n = new Set(contribs.map((c) => c.ownerCik || c)).size; // insiders ÚNICOS
  const role = contribs.reduce((m, c) => Math.max(m, ROLE_W[c.role] || 0), 0);
  const hold = contribs.reduce((m, c) => Math.max(m, c.holdPct || 0), 0);
  const opp = contribs.some((c) => c.opp) ? 1 : 0.3;
  const size = dollar ? clamp((Math.log10(dollar) - 5) / 3) : 0; // tamaño económico
  const parts = { mag: clamp(z / 6), breadth: clamp(n / 5), role, hold: clamp(hold / 0.5), opp, size };
  let s = 15 * parts.mag + 20 * parts.breadth + 15 * parts.role + 10 * parts.hold + 10 * parts.opp + 30 * parts.size;
  if (type === "sell") s *= 0.4;
  return { score: Math.round(s), n, role, opp: opp === 1 };
}

function detectWeek(week, base, threshold, side, px) {
  const out = [];
  const test = (key, ck, type) => {
    const v = week[key];
    if (v <= 0) return;
    const arr = base.map((w) => w[key]);
    const m = mean(arr), s = std(arr, m);
    const z = s > 0 ? (v - m) / s : v > 0 ? 99 : 0;
    if (z < threshold) return;
    const dollar = px ? v * px : null;
    out.push({ type, z, mult: m > 0 ? v / m : 99, shares: v, conv: conviction(z, week[ck], type, dollar) });
  };
  if (side !== "sell") test("buyQ", "buyers", "buy");
  if (side !== "buy") test("sellQ", "sellers", "sell");
  return out;
}

// Cierre en o después de `iso` (serie ascendente).
function closeOnOrAfter(prices, iso) {
  if (!prices?.length) return null;
  for (const p of prices) if (p.date >= iso) return p.close;
  return prices[prices.length - 1].close;
}

const isoOf = (t) => new Date(t).toISOString().slice(0, 10);

// Cuadrícula contigua de `nWeeks` semanas lunes-inicio que termina en el lunes de
// la semana actual. Rellena con ceros las semanas sin actividad.
function buildGrid(storeWeeks, nWeeks = 80) {
  const byWs = new Map(storeWeeks.map((w) => [w.ws, w]));
  const lastMonday = mondayOf(isoOf(Date.now()));
  const lastT = new Date(lastMonday + "T00:00:00Z").getTime();
  const grid = [];
  for (let k = nWeeks - 1; k >= 0; k--) {
    const t = lastT - k * WK;
    const ws = isoOf(t);
    const r = byWs.get(ws);
    grid.push(r
      ? { ws, t, buyQ: r.buyQ || 0, sellQ: r.sellQ || 0, buyers: r.buyers || [], sellers: r.sellers || [] }
      : { ws, t, buyQ: 0, sellQ: 0, buyers: [], sellers: [] });
  }
  return grid;
}

// Índice de la última semana VENCIDA (cerrada con margen de rezago) en la cuadrícula.
function lastClosedIndex(grid) {
  const now = Date.now();
  for (let i = grid.length - 1; i >= 0; i--) {
    if (grid[i].t + WK + LAG_MS <= now) return i;
  }
  return -1;
}

// Inspecciona TODOS los tickers ingeridos y devuelve las anomalías de la última
// semana cerrada. { week: 'YYYY-MM-DD', anomalies: [{ ticker, type, z, conv, shares }] }
export async function inspectLatestWeek(tickers, { threshold = 2.5, side = "buy" } = {}) {
  let week = null;
  const anomalies = [];
  for (const ticker of tickers) {
    const data = await getWeekly(ticker);
    if (!data?.weeks?.length) continue;
    const grid = buildGrid(data.weeks);
    const wi = lastClosedIndex(grid);
    if (wi < 14) continue;
    week = grid[wi].ws;
    const base = grid.slice(Math.max(0, wi - 52), wi);
    if (base.length < 14) continue;
    const pricesData = await getPrices(ticker);
    const px = closeOnOrAfter(pricesData?.prices, grid[wi].ws); // precio para el tamaño $
    let best = null;
    for (const d of detectWeek(grid[wi], base, threshold, side, px)) {
      if (!best || d.conv.score > best.conv.score) best = d;
    }
    if (best) {
      anomalies.push({
        ticker, type: best.type, z: Number(best.z.toFixed(1)),
        shares: best.shares, conviction: best.conv.score,
        insiders: best.conv.n, role: best.conv.role, opportunistic: best.conv.opp,
      });
    }
  }
  anomalies.sort((a, b) => b.conviction - a.conviction);
  return { week, anomalies };
}
