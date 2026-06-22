import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";
import { overlayRealData, getToken, fetchMe, logout } from "./api";
import Login from "./Login";
import Admin from "./Admin";

/* ============================================================================
   SCANNER DE ANOMALÍAS DE INSIDERS · v3
   + Universo construido por sector: top N por sector (def. 50) + adiciones
     manuales vía buscador. El motor (detección, convicción, forward, veredicto)
     es real; los datos son sintéticos. En producción: catálogo de EDGAR.
   ========================================================================== */

const C = {
  bg: "#080B0F", panel: "#0F141A", panelHi: "#131A22", line: "#1C2530",
  text: "#E6EDF3", mut: "#6B7785", buy: "#2EE6A6", sell: "#FF5C45",
  ice: "#5AB0E6", amber: "#F4B740", grid: "#202A35",
};
const MONO = "ui-monospace,'SF Mono',Menlo,Monaco,monospace";
const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const norm = (rng, mu, sd) =>
  mu + sd * Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());

/* ---------- catálogo por sector (mcap en $B, sólo para rankear) ---------- */
const SECTORS = ["Tecnología", "Salud", "Industriales", "Utilities", "Financieras",
  "Consumo discr.", "Comunicaciones", "Consumo básico", "Energía", "Inmobiliario", "Materiales"];

// [sym, nombre, sector, mcap($B), liquidez($M/día), precio($), ingresos?]
export const CATALOG = [
  // Tecnología
  ["NVDA", "NVIDIA", "Tecnología", 2900, 9000, 178, true], ["AVGO", "Broadcom", "Tecnología", 800, 3000, 210, true],
  ["AMD", "AMD", "Tecnología", 250, 2500, 150, true], ["MU", "Micron", "Tecnología", 130, 1800, 120, true],
  ["INTC", "Intel", "Tecnología", 130, 1500, 134, true], ["TER", "Teradyne", "Tecnología", 14, 300, 118, true],
  ["AMBA", "Ambarella", "Tecnología", 3.5, 40, 92, true], ["CRDO", "Credo Technology", "Tecnología", 6, 90, 60, true],
  ["ALAB", "Astera Labs", "Tecnología", 11, 200, 80, true],
  // Salud
  ["LLY", "Eli Lilly", "Salud", 780, 2200, 880, true], ["UNH", "UnitedHealth", "Salud", 480, 1500, 520, true],
  ["ABBV", "AbbVie", "Salud", 320, 1200, 180, true], ["ISRG", "Intuitive Surgical", "Salud", 180, 900, 500, true],
  ["EXEL", "Exelixis", "Salud", 9, 80, 38, true], ["CRSP", "CRISPR Therapeutics", "Salud", 5, 70, 55, false],
  // Industriales
  ["CAT", "Caterpillar", "Industriales", 180, 1100, 360, true], ["ETN", "Eaton", "Industriales", 130, 900, 330, true],
  ["GEV", "GE Vernova", "Industriales", 110, 1000, 410, true], ["LMT", "Lockheed", "Industriales", 110, 700, 470, true],
  ["BA", "Boeing", "Industriales", 110, 1300, 180, true], ["POWL", "Powell Industries", "Industriales", 4, 60, 330, true],
  ["FLNC", "Fluence Energy", "Industriales", 2.5, 45, 14, true],
  // Utilities
  ["NEE", "NextEra", "Utilities", 160, 900, 80, true], ["CEG", "Constellation", "Utilities", 95, 800, 305, true],
  ["SO", "Southern Co", "Utilities", 95, 600, 90, true], ["VST", "Vistra", "Utilities", 60, 700, 170, true],
  ["TLN", "Talen Energy", "Utilities", 11, 120, 230, true], ["OKLO", "Oklo", "Utilities", 1.8, 90, 40, false],
  ["SMR", "NuScale", "Utilities", 2.5, 80, 34, false],
  // Financieras
  ["BRK.B", "Berkshire", "Financieras", 950, 800, 470, true], ["JPM", "JPMorgan", "Financieras", 680, 1500, 250, true],
  ["BAC", "Bank of America", "Financieras", 320, 1400, 42, true], ["GS", "Goldman Sachs", "Financieras", 160, 900, 520, true],
  // Consumo discrecional
  ["AMZN", "Amazon", "Consumo discr.", 2100, 8000, 210, true], ["TSLA", "Tesla", "Consumo discr.", 800, 12000, 250, true],
  ["HD", "Home Depot", "Consumo discr.", 360, 1000, 360, true],
  // Comunicaciones
  ["GOOGL", "Alphabet", "Comunicaciones", 2200, 5000, 180, true], ["META", "Meta", "Comunicaciones", 1500, 6000, 600, true],
  ["NFLX", "Netflix", "Comunicaciones", 380, 2000, 900, true],
  // Consumo básico
  ["COST", "Costco", "Consumo básico", 400, 1200, 900, true], ["PG", "P&G", "Consumo básico", 380, 900, 170, true],
  ["KO", "Coca-Cola", "Consumo básico", 280, 800, 65, true],
  // Energía
  ["XOM", "Exxon", "Energía", 520, 1800, 110, true], ["CVX", "Chevron", "Energía", 290, 1300, 160, true],
  ["COP", "ConocoPhillips", "Energía", 130, 900, 110, true],
  // Inmobiliario
  ["PLD", "Prologis", "Inmobiliario", 110, 700, 115, true], ["AMT", "American Tower", "Inmobiliario", 95, 600, 200, true],
  ["EQIX", "Equinix", "Inmobiliario", 85, 500, 850, true],
  // Materiales
  ["LIN", "Linde", "Materiales", 220, 800, 450, true], ["SHW", "Sherwin-Williams", "Materiales", 90, 500, 350, true],
  ["FCX", "Freeport", "Materiales", 60, 1000, 45, true],
].map(([sym, name, sector, mcap, addv, price, rev]) => ({ sym, name, sector, mcap, addv, price, rev }));

const ROLE_W = { CEO: 1.0, CFO: 0.9, DIR: 0.5, OWN: 0.4 };

const ANOMALIES = [
  { sym: "INTC", ym: "2026-03", type: "buy", shares: 150000, q: 0.9 },
  { sym: "INTC", ym: "2026-05", type: "buy", shares: 150000, q: 0.85 },
  { sym: "OKLO", ym: "2026-02", type: "buy", shares: 80000, q: 0.7 },
  { sym: "CEG", ym: "2026-04", type: "buy", shares: 70000, q: 0.62 },
  { sym: "NVDA", ym: "2026-04", type: "buy", shares: 60000, q: 0.5 },
  { sym: "LLY", ym: "2026-05", type: "buy", shares: 55000, q: 0.55 },
  { sym: "AMBA", ym: "2025-10", type: "buy", shares: 42000, q: 0.4 },
  { sym: "GEV", ym: "2026-03", type: "buy", shares: 50000, q: 0.35 },
  { sym: "LMT", ym: "2025-11", type: "buy", shares: 34000, q: 0.3 },
  { sym: "SMR", ym: "2026-01", type: "buy", shares: 30000, q: 0.25 },
  { sym: "CRDO", ym: "2026-03", type: "buy", shares: 38000, q: 0.65 },
  { sym: "ALAB", ym: "2026-04", type: "buy", shares: 30000, q: 0.45 },
  { sym: "EXEL", ym: "2026-02", type: "buy", shares: 40000, q: 0.55 },
  { sym: "POWL", ym: "2026-04", type: "buy", shares: 26000, q: 0.5 },
  { sym: "CRSP", ym: "2026-03", type: "buy", shares: 35000, q: 0.6 },
  { sym: "AMBA", ym: "2026-06", type: "buy", shares: 45000, q: 0.6 },
  { sym: "CRDO", ym: "2026-06", type: "buy", shares: 40000, q: 0.5 },
  { sym: "NVDA", ym: "2026-01", type: "sell", shares: 92000, q: 0.6 },
  { sym: "TER", ym: "2026-02", type: "sell", shares: 46000, q: 0.4 },
  { sym: "SMR", ym: "2025-12", type: "sell", shares: 60000, q: 0.5 },
];

const WK = 7 * 864e5;
const START = new Date(Date.UTC(2024, 11, 30));
const N = 92;
const H = { m1: 4, m3: 13, m6: 26 };
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
// Cuadrícula del motor: N semanas lunes-inicio desde START. Se la pasamos al
// backend para alinear las semanas/precios reales con los mismos índices `i`.
const isoOf = (d) => d.toISOString().slice(0, 10);
const GRID_WEEKS = Array.from({ length: N }, (_, i) => {
  const ws = new Date(START.getTime() + i * WK);
  return { i, ws, isoWs: isoOf(ws), ym: ym(ws) };
});
const GRID_META = { grid: GRID_WEEKS.map((w) => w.isoWs), gridWeeks: GRID_WEEKS };
const NOW = new Date(Date.UTC(2026, 5, 21));        // "hoy" del prototipo
const LAG = 4 * 864e5;                               // rezago de presentación Form 4
const CUR_YM = ym(NOW);
const isClosed = (ws) => ws.getTime() + 7 * 864e5 + LAG <= NOW.getTime();

function clusterContribs(q, total, rng) {
  const n = Math.max(1, 1 + Math.round(q * 4));
  const roles = [];
  if (q > 0.6) roles.push("CEO");
  if (q > 0.45) roles.push("CFO");
  while (roles.length < n) roles.push(rng() < 0.5 ? "DIR" : "OWN");
  return roles.slice(0, n).map((role, k) => ({
    role, opp: q > 0.5 ? k === 0 || rng() < 0.6 : rng() < 0.25,
    holdPct: Math.max(0.01, 0.05 + q * 0.4 + (rng() - 0.5) * 0.12),
    shares: Math.round(total / n),
  }));
}

/* ---------- dataset (todo el catálogo) ---------- */
function generateDataset() {
  // Benchmark "real": tendencia tranquila. Alimenta SOLO los retornos forward y el
  // backtest. No se toca: es la formulación que ya estaba validada.
  const benchRng = mulberry32(99991);
  const bench = [100];
  for (let i = 1; i < N; i++) bench.push(bench[i - 1] * (1 + norm(benchRng, 0.0012, 0.02)));
  // Serie de sentimiento: SOLO informativa. Alimenta el medidor de pánico/euforia y
  // nada más. No entra en fwd() ni en backtest().
  const sentRng = mulberry32(94);
  const sentiment = [100];
  for (let i = 1; i < N; i++) {
    let mu = 0.0018, sd = 0.011;
    if (i >= 53 && i < 62) { mu = -0.030; sd = 0.038; }       // pánico ene → mar-26
    else if (i >= 62 && i < 74) { mu = 0.006; sd = 0.016; }   // recuperación
    sentiment.push(sentiment[i - 1] * (1 + norm(sentRng, mu, sd)));
  }
  const tickers = {};
  for (const t of CATALOG) {
    const seed = [...t.sym].reduce((a, c) => a + c.charCodeAt(0), 11) * 2654435761;
    const rng = mulberry32(seed);
    const mine = ANOMALIES.filter((a) => a.sym === t.sym);
    const weeks = [];
    for (let i = 0; i < N; i++) {
      const ws = new Date(START.getTime() + i * WK);
      weeks.push({ i, ws, ym: ym(ws), buyQ: 0, sellQ: 0, buyers: [], sellers: [], raw: 0, excl: 0 });
    }
    for (const w of weeks) {
      if (rng() < 0.22) {
        const s = Math.round(2000 + rng() * 10000); w.buyQ += s; w.raw++;
        w.buyers.push({ role: rng() < 0.3 ? "DIR" : "OWN", opp: rng() < 0.3, holdPct: 0.01 + rng() * 0.04, shares: s });
      }
      if (rng() < 0.18) {
        const s = Math.round(2000 + rng() * 12000); w.raw++;
        if (rng() < 0.5) { w.sellQ += s; w.sellers.push({ role: "DIR", opp: false, holdPct: 0.02, shares: s }); }
        else w.excl++;
      }
    }
    const boosts = [];
    for (const a of mine) {
      const mw = weeks.filter((x) => x.ym === a.ym && x.ws.getTime() <= NOW.getTime());
      if (!mw.length) continue;
      const w = a.ym === CUR_YM ? mw[mw.length - 1] : mw[0];
      const contribs = clusterContribs(a.q, a.shares, rng);
      if (a.type === "buy") {
        w.buyQ += a.shares; w.buyers.push(...contribs); w.raw += contribs.length + 1; w.excl += 1;
        boosts.push({ start: w.i + 1, q: a.q });
      } else {
        const keep = Math.round(a.shares * 0.5);
        w.sellQ += keep; w.sellers.push(...contribs.slice(0, Math.ceil(contribs.length / 2)));
        w.raw += contribs.length + 1; w.excl += Math.floor(contribs.length / 2) + 1;
      }
    }
    const price = [t.price * 0.82];
    for (let i = 1; i < N; i++) {
      let drift = 0.0009;
      for (const b of boosts) if (i > b.start && i <= b.start + 13) drift += 0.0012 + b.q * 0.0045;
      price.push(price[i - 1] * (1 + norm(rng, drift, 0.042)));
    }
    tickers[t.sym] = { weeks, price, meta: t };
  }
  return { tickers, bench, sentiment };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a, m) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)));
const clamp = (x) => Math.max(0, Math.min(1, x));

function conviction(z, contribs, type, dollar) {
  // Amplitud = insiders ÚNICOS (no líneas de transacción). Un directivo que parte
  // su compra en varios lotes cuenta como 1, no como N.
  const n = new Set(contribs.map((c) => c.ownerCik || c)).size;
  const role = contribs.reduce((m, c) => Math.max(m, ROLE_W[c.role] || 0), 0);
  const hold = contribs.reduce((m, c) => Math.max(m, c.holdPct || 0), 0);
  const opp = contribs.some((c) => c.opp) ? 1 : 0.3;
  // Tamaño económico de la operación (escala log: ~$100k ≈ 0, ~$100M ≈ 1).
  const size = dollar ? clamp((Math.log10(dollar) - 5) / 3) : 0;
  const parts = { mag: clamp(z / 6), breadth: clamp(n / 5), role, hold: clamp(hold / 0.5), opp, size };
  // Pesos: el TAMAÑO domina; se baja el peso del z (propenso a artefactos sin baseline).
  let s = 15 * parts.mag + 20 * parts.breadth + 15 * parts.role + 10 * parts.hold + 10 * parts.opp + 30 * parts.size;
  if (type === "sell") s *= 0.4;
  return { score: Math.round(s), parts, role, n, hold, dollar, opp: opp === 1 };
}

function detectWeek(week, base, threshold, side, px) {
  const out = [];
  const t = (key, ck, type) => {
    const v = week[key]; if (v <= 0) return;
    const arr = base.map((w) => w[key]);
    const m = mean(arr), s = std(arr, m);
    const z = s > 0 ? (v - m) / s : v > 0 ? 99 : 0;
    if (z < threshold) return;
    const dollar = px ? v * px : null; // v = acciones de la semana (P/S limpias) × precio
    out.push({ type, z, mult: m > 0 ? v / m : 99, shares: v, week: week.ws, wi: week.i, conv: conviction(z, week[ck], type, dollar) });
  };
  if (side !== "sell") t("buyQ", "buyers", "buy");
  if (side !== "buy") t("sellQ", "sellers", "sell");
  return out;
}

/* ---------- universo: banda de calidad + adiciones manuales ---------- */
function passesQuality(t, f) {
  return t.mcap >= f.mcapMin && t.mcap <= f.mcapMax &&
    t.addv >= f.addvMin && t.price >= f.priceMin && (!f.revOnly || t.rev);
}
function buildUniverse(filters, sectors, adds, realSet) {
  const set = new Set();
  // Solo entran tickers con datos REALES del backend (nada sintético).
  const ok = (sym) => !realSet || realSet.has(sym);
  for (const s of adds) if (ok(s)) set.add(s); // fijados entran aunque no pasen filtros
  for (const t of CATALOG) {
    if (!ok(t.sym)) continue;
    if (!sectors.includes(t.sector)) continue;
    if (passesQuality(t, filters)) set.add(t.sym);
  }
  return set;
}
const PRESET_QUALITY = { mcapMin: 0.5, mcapMax: 15, addvMin: 3, priceMin: 5, revOnly: true };
const PRESET_ALL = { mcapMin: 0, mcapMax: 1e6, addvMin: 0, priceMin: 0, revOnly: false };

// Escaneo de UNA semana concreta (índice `wi` en la cuadrícula). Para cada ticker
// mide la anomalía de esa semana contra su base de las 52 semanas previas.
function scanWeek(ds, universe, wi, threshold, side) {
  const res = [];
  for (const t of CATALOG) {
    if (!universe.has(t.sym)) continue;
    const T = ds.tickers[t.sym];
    if (!T?.real) continue; // solo datos reales
    const w = T.weeks[wi];
    if (!w) continue;
    const base = T.weeks.slice(Math.max(0, wi - 52), wi);
    if (base.length < 14) continue;
    let best = null;
    for (const d of detectWeek(w, base, threshold, side, T.price?.[wi]))
      if (!best || d.conv.score > best.conv.score) best = d;
    if (best) { best.provisional = !isClosed(w.ws); res.push({ ...t, ...best }); }
  }
  return res.sort((a, b) => b.conv.score - a.conv.score);
}

function fwd(T, bench, wi, h) {
  if (!T.price || !bench) return null;               // sin precios reales → sin retorno
  if (wi + h >= T.price.length) return null;
  return T.price[wi + h] / T.price[wi] - 1 - (bench[wi + h] / bench[wi] - 1);
}

function backtest(ds, universe, threshold) {
  const buys = [], sells = [];
  for (const t of CATALOG) {
    if (!universe.has(t.sym)) continue;
    const T = ds.tickers[t.sym];
    if (!T?.real) continue; // solo datos reales
    for (let i = 52; i < T.weeks.length; i++) {
      if (!isClosed(T.weeks[i].ws)) continue;
      const base = T.weeks.slice(i - 52, i);
      for (const d of detectWeek(T.weeks[i], base, threshold, "both", T.price?.[i])) {
        const exc = fwd(T, ds.bench, i, H.m3); if (exc == null) continue;
        (d.type === "buy" ? buys : sells).push({ conv: d.conv.score, exc });
      }
    }
  }
  const stats = (arr, dir) => arr.length ? {
    n: arr.length,
    hit: arr.filter((x) => (dir === "sell" ? x.exc < 0 : x.exc > 0)).length / arr.length,
    avg: mean(arr.map((x) => x.exc)),
  } : { n: 0, hit: 0, avg: 0 };
  const sorted = [...buys].sort((a, b) => a.conv - b.conv);
  const third = Math.max(1, Math.floor(sorted.length / 3));
  // Cada tercil: exceso medio (v), tasa de acierto (hit), nº (n) y rango de convicción (lo/hi).
  const seg = (s, e, label) => {
    const sl = sorted.slice(s, e);
    return {
      label,
      v: mean(sl.map((x) => x.exc)),
      hit: sl.length ? sl.filter((x) => x.exc > 0).length / sl.length : 0,
      n: sl.length,
      lo: sl.length ? sl[0].conv : 0,
      hi: sl.length ? sl[sl.length - 1].conv : 0,
    };
  };
  const terciles = sorted.length >= 3
    ? [seg(0, third, "Baja"), seg(third, 2 * third, "Media"), seg(2 * third, sorted.length, "Alta")]
    : [];
  return { buy: stats(buys, "buy"), sell: stats(sells, "sell"), terciles };
}

function monthly(weeks, cutoffTime, flagWeek) {
  const cutoff = Math.min(cutoffTime, NOW.getTime());
  const map = new Map();
  for (const w of weeks) {
    if (w.ws.getTime() > cutoff) continue;
    const c = map.get(w.ym) || { buy: 0, sell: 0 };
    c.buy += w.buyQ; c.sell += w.sellQ; map.set(w.ym, c);
  }
  const flagYM = flagWeek ? ym(flagWeek) : null;
  return [...map.keys()].sort().slice(-12).map((k) => {
    const [y, m] = k.split("-").map(Number);
    return { label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString("es", { month: "short" }), buy: map.get(k).buy, sell: -map.get(k).sell, flag: k === flagYM };
  });
}

const fmtK = (n) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : a >= 1e3 ? Math.round(n / 1e3) + "K" : "" + n; };
const pct = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
// Semanas seleccionables para el análisis: cuadrícula lunes-inicio, desde que hay
// base estadística (i ≥ 14) hasta la última semana VENCIDA (cerrada, con margen
// por el rezago de presentación de los Form 4). La opción más reciente es, por
// tanto, la semana vencida; la semana en curso no se ofrece.
const WEEK_OPTS = GRID_WEEKS.filter((w) => w.i >= 14 && isClosed(w.ws));
const prettyWeek = (ws) => "Semana del " + ws.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ---------- régimen de mercado (pánico ↔ euforia) en la semana `ci` ---------- */
function regimeAt(bench, ci) {
  const lo = Math.max(0, ci - 52);
  let hi = bench[lo];
  for (let i = lo; i <= ci; i++) hi = Math.max(hi, bench[i]);
  const dd = bench[ci] / hi - 1;
  const j = Math.max(1, ci - 13);
  const rets = [];
  for (let i = j; i <= ci; i++) rets.push(bench[i] / bench[i - 1] - 1);
  const mr = mean(rets);
  const vol = std(rets, mr);
  const mom = bench[ci] / bench[Math.max(0, ci - 13)] - 1;
  const ddS = clamp((dd + 0.25) / 0.25);
  const volS = clamp((0.05 - vol) / 0.04);
  const momS = clamp((mom + 0.15) / 0.25);
  const score = Math.round(100 * (0.4 * ddS + 0.3 * volS + 0.3 * momS));
  const label = score < 20 ? "Pánico extremo" : score < 40 ? "Miedo" : score < 60 ? "Neutral" : score < 80 ? "Codicia" : "Euforia";
  return { score, label, dd, vol, mom };
}

function buildVerdict(active, bt, recent, regime) {
  if (!active) return null;
  const R = [];
  if (active.provisional) R.push({ t: "yellow", x: "Semana aún no cerrada (provisional): puede cambiar con filings tardíos." });
  const ctx = () => {
    if (!regime) return;
    if (regime.score < 35) R.push({ t: "green", x: `Mercado en ${regime.label.toLowerCase()} (índice ${regime.score}/100): comprar mientras otros venden amplifica la oportunidad.` });
    else if (regime.score > 70) R.push({ t: "yellow", x: `Mercado en ${regime.label.toLowerCase()} (índice ${regime.score}/100): modera el tamaño; en euforia las gangas escasean.` });
    else R.push({ t: "yellow", x: `Mercado neutral (índice ${regime.score}/100): sin viento de cola ni en contra.` });
  };

  if (active.type === "sell") {
    R.push({ t: "red", x: `Insiders VENDIERON ${active.sym}: no es una señal de compra.` });
    R.push({ t: "yellow", x: "Las ventas son señal de baja fiabilidad (suelen ser por liquidez/impuestos)." });
    return { level: "red", headline: "Señal de venta de insiders", buyCase: 0, dimension: null, reasons: R };
  }

  const conv = active.conv.score;
  // Juzga la señal contra las de SU MISMO nivel de convicción (su tercil), no
  // contra el promedio global (que se diluye con el ruido de baja convicción).
  const T3 = bt.terciles;
  const tier = T3.length === 3 ? (conv <= T3[0].hi ? T3[0] : conv <= T3[1].hi ? T3[1] : T3[2]) : null;
  const tierEdgeOk = !!tier && tier.n >= 4 && tier.v > 0.02 && tier.hit >= 0.55;
  const tierNoEdge = !!tier && tier.n >= 4 && (tier.v <= 0 || tier.hit < 0.45);
  const slopeOk = T3.length === 3 && T3[2].v > T3[0].v + 0.03;
  let mult = 0.85;
  if (tierEdgeOk) mult = slopeOk ? 1.0 : 0.95;
  if (tierNoEdge) mult = 0.55;
  if (!tier || tier.n < 4) mult = Math.min(mult, 0.8); // muestra del nivel insuficiente
  const buyCase = Math.round(conv * mult);
  if (conv >= 70) R.push({ t: "green", x: `Convicción alta (${conv}/100): ${active.conv.role === 1 ? "compra de CEO" : active.conv.role >= 0.9 ? "compra de CFO" : "varios insiders"}${active.conv.opp ? ", oportunista" : ""}, ${active.conv.n} insiders.` });
  else if (conv >= 45) R.push({ t: "yellow", x: `Convicción media (${conv}/100): presente pero no contundente.` });
  else R.push({ t: "red", x: `Convicción baja (${conv}/100): señal débil.` });
  if (tierEdgeOk) R.push({ t: "green", x: `Señales de convicción similar (${tier.label.toLowerCase()}) aciertan ${(tier.hit * 100).toFixed(0)}% (${pct(tier.v)} medio a 3m).` });
  else if (tierNoEdge) R.push({ t: "red", x: `Señales de este nivel sin ventaja (acierto ${(tier.hit * 100).toFixed(0)}%, ${pct(tier.v)} a 3m): no validada.` });
  else if (tier) R.push({ t: "yellow", x: `Ventaja del nivel ambigua (acierto ${(tier.hit * 100).toFixed(0)}%, n=${tier.n}).` });
  else R.push({ t: "yellow", x: "Muestra insuficiente para validar por nivel." });
  if (slopeOk) R.push({ t: "green", x: "Más convicción ⇒ más retorno: el score discrimina." });
  else R.push({ t: "yellow", x: "El score discrimina poco entre niveles." });
  if (tier && tier.n < 8) R.push({ t: "yellow", x: `Muestra del nivel pequeña (n=${tier.n}): veredicto tentativo.` });
  if (recent) R.push({ t: "yellow", x: "Señal reciente: sin retorno realizado aún; se apoya en histórico." });
  ctx();
  let level = "red", headline = "Señal débil";
  if (buyCase >= 68) { level = "green"; headline = "Señal de insiders fuerte"; }
  else if (buyCase >= 42) { level = "yellow"; headline = "Señal moderada"; }
  let dimension = "Moderada";
  if (level === "red") dimension = null;
  else if (regime && regime.score < 35) dimension = "Alta";
  else if (regime && regime.score > 70) dimension = "Contenida";
  return { level, headline, buyCase, dimension, reasons: R };
}

/* ====================== SHELL: auth + navegación ====================== */
export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState("tool"); // 'tool' | 'admin'

  // Valida la sesión guardada al montar.
  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    fetchMe().then(setMe).catch(() => logout()).finally(() => setChecking(false));
  }, []);

  const onLogout = () => { logout(); setMe(null); setView("tool"); };

  if (checking) return <div style={{ fontFamily: SANS, background: C.bg, color: C.mut, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando…</div>;
  if (!me) return <Login onLogin={setMe} />;
  if (view === "admin" && me.role === "admin") return <Admin me={me} onClose={() => setView("tool")} catalogSyms={CATALOG.map((t) => t.sym)} />;
  return <Scanner me={me} onLogout={onLogout} onAdmin={() => setView("admin")} />;
}

/* ============================== SCANNER ============================== */
function Scanner({ me, onLogout, onAdmin }) {
  // Arranca con el dataset sintético (UI inmediata) y, al montar, superpone los
  // datos reales del backend para los tickers ingeridos.
  const [ds, setDs] = useState(() => generateDataset());
  const [real, setReal] = useState({ realSyms: [], loading: true, offline: false });
  useEffect(() => {
    let alive = true;
    overlayRealData(ds, GRID_META)
      .then((r) => { if (alive) { setDs(r.ds); setReal({ realSyms: r.realSyms, offline: r.offline, loading: false }); } })
      .catch(() => alive && setReal((x) => ({ ...x, loading: false })));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [idx, setIdx] = useState(WEEK_OPTS.length - 1);
  const [threshold, setThreshold] = useState(2.5);
  const [side, setSide] = useState("buy");
  const [sel, setSel] = useState(null);
  const [filters, setFilters] = useState(PRESET_QUALITY);
  const [preset, setPreset] = useState("quality");
  const [sectors, setSectors] = useState(SECTORS);
  const [adds, setAdds] = useState([]);
  const applyPreset = (id) => { setPreset(id); setFilters(id === "quality" ? PRESET_QUALITY : PRESET_ALL); };
  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPreset("custom"); };

  const realSet = useMemo(() => new Set(real.realSyms), [real.realSyms]);
  const universe = useMemo(() => buildUniverse(filters, sectors, adds, realSet), [filters, sectors, adds, realSet]);
  const asOfWeek = WEEK_OPTS[idx];
  const results = useMemo(() => scanWeek(ds, universe, asOfWeek.i, threshold, side), [ds, universe, asOfWeek, threshold, side]);
  const bt = useMemo(() => backtest(ds, universe, threshold), [ds, universe, threshold]);

  const active = results.find((r) => r.sym === sel) || results[0] || null;
  const T = active ? ds.tickers[active.sym] : null;
  const chart = active ? monthly(T.weeks, asOfWeek.ws.getTime() + WK - 1, active.week) : [];
  const maxAbs = Math.max(1, ...chart.map((d) => Math.max(d.buy, -d.sell)));
  const fwds = active ? { m1: fwd(T, ds.bench, active.wi, H.m1), m3: fwd(T, ds.bench, active.wi, H.m3), m6: fwd(T, ds.bench, active.wi, H.m6) } : null;
  const tMax = Math.max(0.001, ...bt.terciles.map((t) => Math.abs(t.v)));
  const regime = useMemo(() => (ds.sentiment ? regimeAt(ds.sentiment, asOfWeek.i) : null), [ds, asOfWeek]);
  const verdict = useMemo(() => buildVerdict(active, bt, active ? fwds.m3 == null : false, regime), [active, bt, fwds, regime]);

  const toggleSector = (s) => setSectors((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: "100vh", padding: "18px 16px 44px", maxWidth: 760, margin: "0 auto" }}>
      <style>{`
        @media (prefers-reduced-motion:no-preference){
          .flare{animation:pulse 1.8s ease-in-out infinite}
          .fade{animation:fade .35s ease both}
          button{transition:background .15s ease,border-color .15s ease,transform .12s ease,box-shadow .2s ease,color .15s ease}
          .result-card:hover{transform:translateY(-1px)}
        }
        @keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
        button{font-family:inherit;cursor:pointer}
        button:focus-visible{outline:2px solid ${C.ice};outline-offset:2px}
        input{font-family:inherit}
        input[type=range]{accent-color:${C.ice};cursor:pointer}
        .result-card:hover{border-color:${C.ice}55!important;box-shadow:0 6px 20px rgba(0,0,0,.35)}
        .chip:hover{border-color:${C.ice}88!important;color:${C.text}!important}
        .act:hover{background:${C.panelHi}!important;border-color:${C.ice}66!important;color:${C.text}!important}
        .skel{background:linear-gradient(90deg,${C.panel} 25%,${C.panelHi} 50%,${C.panel} 75%);background-size:400px 100%;animation:shimmer 1.2s infinite linear;border-radius:8px}
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 12 }}>
        <span style={{ color: C.mut, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.email}{me.role === "admin" ? " · admin" : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {me.role === "admin" && (
            <button onClick={onAdmin} style={{ background: C.amber + "1A", color: C.amber, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}>⚙ Admin</button>
          )}
          <button onClick={onLogout} style={{ background: "transparent", color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>Salir</button>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ width: 8, height: 8, background: C.ice, borderRadius: 2 }} />
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em" }}>Anomalías de insiders</h1>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {real.loading ? (
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.mut }}>conectando…</span>
          ) : real.realSyms.length ? (
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.buy }}>● {real.realSyms.length} reales (EDGAR)</span>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.amber }}>● {real.offline ? "sin backend" : "sin datos aún"}</span>
          )}
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.mut }}>v6</span>
        </span>
      </div>
      <p style={{ margin: "6px 0 18px", color: C.mut, fontSize: 13, lineHeight: 1.5 }}>
        Define el universo, detecta compras desproporcionadas, valida si anticipan y
        revisa el veredicto. Solo código P, sin 10b5-1.
      </p>

      {/* ---------- UNIVERSO ---------- */}
      <Panel>
        <div style={{ marginBottom: 12 }}>
          <Seg value={preset} onChange={applyPreset} options={[["quality", "Small/Mid de calidad"], ["all", "Todo el mercado"]]} />
        </div>
        <Row label="Capitalización ($B)">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Num v={filters.mcapMin} on={(x) => setF("mcapMin", x)} />
            <span style={{ color: C.mut }}>–</span>
            <Num v={filters.mcapMax} on={(x) => setF("mcapMax", x)} />
          </div>
        </Row>
        <Row label="Liquidez mín. ($M/día)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={0} max={50} step={1} value={Math.min(filters.addvMin, 50)} onChange={(e) => setF("addvMin", +e.target.value)} style={{ width: 116 }} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ice, minWidth: 32 }}>{filters.addvMin}</span>
          </div>
        </Row>
        <Row label="Precio mín. ($)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={0} max={20} step={1} value={Math.min(filters.priceMin, 20)} onChange={(e) => setF("priceMin", +e.target.value)} style={{ width: 116 }} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ice, minWidth: 32 }}>{filters.priceMin}</span>
          </div>
        </Row>
        <Row label="Solo con ingresos (excluye pre-revenue)">
          <Toggle on={filters.revOnly} onClick={() => setF("revOnly", !filters.revOnly)} />
        </Row>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0 12px" }}>
          {SECTORS.map((s) => {
            const on = sectors.includes(s);
            return (
              <button key={s} className="chip" onClick={() => toggleSector(s)} style={{
                fontSize: 11.5, padding: "5px 10px", borderRadius: 20,
                border: `1px solid ${on ? C.ice + "88" : C.line}`,
                background: on ? C.ice + "1A" : "transparent", color: on ? C.text : C.mut,
              }}>{s}</button>
            );
          })}
        </div>
        <SearchAdd adds={adds} onAdd={(s) => setAdds((a) => a.includes(s) ? a : [...a, s])} onRemove={(s) => setAdds((a) => a.filter((x) => x !== s))} />
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>Analizando {universe.size} empresas</span>
          <span style={{ fontSize: 11, color: C.mut }}>{sectors.length}/{SECTORS.length} sectores · {adds.length} fijadas</span>
        </div>
        <Note>El preset Small/Mid excluye large caps (señal diluida) y pre-revenue/especulativas. Lo que fijes en el buscador se analiza igual aunque no pase los filtros — ahí van tus apuestas como OKLO o SMR. En producción, esto recorta las ~6,000 de EDGAR a un universo de calidad operable.</Note>
      </Panel>

      {/* ---------- ANÁLISIS ---------- */}
      <Panel>
        <Row label="Semana de análisis">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Step d="‹" off={idx === 0} on={() => setIdx((i) => Math.max(0, i - 1))} />
            <span style={{ fontFamily: MONO, fontSize: 13.5, minWidth: 168, textAlign: "center" }}>{prettyWeek(asOfWeek.ws)}</span>
            <Step d="›" off={idx === WEEK_OPTS.length - 1} on={() => setIdx((i) => Math.min(WEEK_OPTS.length - 1, i + 1))} />
          </div>
        </Row>
        <input type="range" min={0} max={WEEK_OPTS.length - 1} value={idx} onChange={(e) => setIdx(+e.target.value)} style={{ width: "100%", margin: "2px 0 14px" }} />
        {idx === WEEK_OPTS.length - 1 && <Note>Última semana vencida: la semana en curso no se analiza hasta cerrarse (margen por el rezago de presentación de los Form 4). El backtest solo usa semanas cerradas.</Note>}
        <Row label="Señal"><Seg value={side} onChange={setSide} options={[["buy", "Compras"], ["sell", "Ventas"], ["both", "Ambas"]]} /></Row>
        <Row label="Sensibilidad">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={1.5} max={4} step={0.5} value={threshold} onChange={(e) => setThreshold(+e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ice, minWidth: 60 }}>z ≥ {threshold.toFixed(1)}</span>
          </div>
        </Row>
      </Panel>

      <Head left="Detectadas" right={results.length} />
      {results.length === 0 ? (
        <Panel><p style={{ margin: 0, color: C.mut, fontSize: 13, lineHeight: 1.5 }}>Sin señales para la {prettyWeek(asOfWeek.ws).toLowerCase()} con z ≥ {threshold.toFixed(1)}. Prueba a bajar la sensibilidad o moverte de semana.</p></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r) => {
            const on = active && r.sym === active.sym;
            const col = r.type === "buy" ? C.buy : C.sell;
            return (
              <button key={r.sym} className="result-card" onClick={() => setSel(r.sym)} style={{ position: "relative", textAlign: "left", border: `1px solid ${on ? col + "66" : C.line}`, background: on ? C.panelHi : C.panel, borderRadius: 12, padding: "13px 14px 13px 18px", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: col, opacity: 0.3 + 0.7 * (r.conv.score / 100) }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: C.text }}>{r.sym}</span>
                      <Tag col={col}>{r.type === "buy" ? "COMPRA" : "VENTA"}</Tag>
                      {r.conv.role >= 0.9 && <Tag col={C.amber}>{r.conv.role === 1 ? "CEO" : "CFO"}</Tag>}
                      {r.conv.opp && <Tag col={C.ice}>OPORTUNISTA</Tag>}
                      {r.provisional && <Tag col={C.amber}>EN CURSO</Tag>}
                    </div>
                    <div style={{ color: C.mut, fontSize: 12, marginTop: 3 }}>{r.name} · {r.sector} · {r.conv.n} insider{r.conv.n > 1 ? "s" : ""} · z {r.z >= 20 ? "20+" : r.z.toFixed(1)}</div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: MONO }}>
                    <div style={{ color: col, fontSize: 20, fontWeight: 700 }}>{r.conv.score}</div>
                    <div style={{ color: C.mut, fontSize: 10, letterSpacing: "0.04em" }}>CONVICCIÓN</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- VEREDICTO (debajo de las detectadas) ---------- */}
      {verdict ? (
        <div className="fade" style={{ marginTop: 22 }}><Head left="Veredicto" right={active.sym} /><VerdictCard v={verdict} sym={active.sym} /></div>
      ) : (
        <><Head left="Veredicto" right={real.loading ? "cargando" : "—"} />
        <Panel>
          {real.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="skel" style={{ height: 16, width: "55%" }} />
              <div className="skel" style={{ height: 12, width: "85%" }} />
              <div className="skel" style={{ height: 12, width: "70%" }} />
            </div>
          ) : (
            <>
              <p style={{ margin: 0, color: C.mut, fontSize: 13, lineHeight: 1.5 }}>
                Ninguna señal cruza el umbral en la {prettyWeek(asOfWeek.ws).toLowerCase()}. Baja la sensibilidad o cambia de semana para ver candidatas.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <ActionBtn onClick={() => setThreshold((t) => Math.max(1.5, +(t - 0.5).toFixed(1)))} disabled={threshold <= 1.5}>↓ Bajar sensibilidad</ActionBtn>
                <ActionBtn onClick={() => setSide("both")} disabled={side === "both"}>Ver compras y ventas</ActionBtn>
              </div>
            </>
          )}
        </Panel></>
      )}

      {regime && (<><Head left="Contexto de mercado" right={prettyWeek(asOfWeek.ws)} /><RegimeGauge r={regime} /></>)}

      {active && (
        <div style={{ marginTop: 22 }}>
          <Panel pad={0}>
            <div style={{ padding: "16px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div><span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 650 }}>{active.sym}</span><span style={{ color: C.mut, fontSize: 13, marginLeft: 8 }}>{active.name}</span></div>
              <div style={{ display: "flex", gap: 14, fontSize: 12 }}><Leg col={C.buy} l="Compra" /><Leg col={C.sell} l="Venta" /></div>
            </div>
            <div style={{ height: 230, padding: "6px 6px 0" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 10, right: 8, left: 0, bottom: 2 }} barGap={2}>
                  <ReferenceLine y={0} stroke={C.grid} />
                  <XAxis dataKey="label" tick={{ fill: C.mut, fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tickFormatter={fmtK} tick={{ fill: C.mut, fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} width={42} domain={[-maxAbs * 1.1, maxAbs * 1.15]} />
                  <Bar dataKey="buy" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {chart.map((d, i) => <Cell key={i} fill={C.buy} fillOpacity={d.flag && active.type === "buy" ? 1 : 0.5} style={d.flag && active.type === "buy" ? { filter: `drop-shadow(0 0 6px ${C.buy})` } : undefined} />)}
                  </Bar>
                  <Bar dataKey="sell" radius={[0, 0, 3, 3]} isAnimationActive={false}>
                    {chart.map((d, i) => <Cell key={i} fill={C.sell} fillOpacity={d.flag && active.type === "sell" ? 1 : 0.5} style={d.flag && active.type === "sell" ? { filter: `drop-shadow(0 0 6px ${C.sell})` } : undefined} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, padding: "13px 16px" }}>
              <div style={{ fontSize: 11, color: C.mut, letterSpacing: "0.04em", marginBottom: 9 }}>DESGLOSE DE CONVICCIÓN</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Meter l="Tamaño ($)" v={active.conv.parts.size} c={C.buy} />
                <Meter l="Amplitud (insiders únicos)" v={active.conv.parts.breadth} c={C.buy} />
                <Meter l="Peso del rol" v={active.conv.parts.role} c={C.amber} />
                <Meter l="% de su posición" v={active.conv.parts.hold} c={C.amber} />
                <Meter l="Magnitud (z)" v={active.conv.parts.mag} c={C.ice} />
                <Meter l="Oportunista" v={active.conv.parts.opp} c={C.ice} />
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, padding: "13px 16px" }}>
              <div style={{ fontSize: 11, color: C.mut, letterSpacing: "0.04em", marginBottom: 9 }}>RETORNO POSTERIOR vs BENCHMARK</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[["1 mes", fwds.m1], ["3 meses", fwds.m3], ["6 meses", fwds.m6]].map(([l, v]) => (
                  <div key={l} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 650, color: v == null ? C.mut : v >= 0 ? C.buy : C.sell }}>{v == null ? "—" : pct(v)}</div>
                    <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {fwds.m3 == null && <Note>Señal reciente: aún sin datos forward suficientes para validarla.</Note>}
            </div>
          </Panel>
        </div>
      )}

      <Head left="¿Anticipa el precio?" right="histórico" />
      <Panel>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.mut, lineHeight: 1.5 }}>Backtest de TODAS las señales de este universo y configuración, midiendo el exceso a 3 meses vs. benchmark.</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <StatCard title="Compras" s={bt.buy} dir="buy" />
          <StatCard title="Ventas" s={bt.sell} dir="sell" />
        </div>
        {bt.terciles.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: C.mut, letterSpacing: "0.04em", marginBottom: 10 }}>EXCESO A 3M POR NIVEL DE CONVICCIÓN (COMPRAS)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 110, padding: "0 4px" }}>
              {bt.terciles.map((t) => (
                <div key={t.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: t.v >= 0 ? C.buy : C.sell, marginBottom: 4 }}>{pct(t.v)}</span>
                  <div style={{ width: "70%", height: Math.max(3, (Math.abs(t.v) / tMax) * 86), background: t.v >= 0 ? C.buy : C.sell, borderRadius: 4, opacity: 0.85 }} />
                  <span style={{ fontSize: 11, color: C.mut, marginTop: 6 }}>{t.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <p style={{ color: C.mut, fontSize: 11, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        {real.realSyms.length
          ? `${real.realSyms.length} tickers analizados con Form 4 reales de SEC EDGAR. Solo se muestran señales con datos reales. Esto no es asesoría de inversión.`
          : real.loading
            ? "Cargando datos reales de SEC EDGAR…"
            : "Sin datos reales todavía. Ingiere tickers desde el panel de administración. Esto no es asesoría de inversión."}
      </p>
    </div>
  );
}

/* ---------- buscador para añadir tickers ---------- */
function SearchAdd({ adds, onAdd, onRemove }) {
  const [q, setQ] = useState("");
  const matches = q.trim()
    ? CATALOG.filter((t) => (t.sym + " " + t.name).toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.mut, fontWeight: 500, marginBottom: 7 }}>Añadir empresas (se analizan aunque no pasen los filtros)</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por símbolo o nombre…"
        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", color: C.text, fontSize: 13, outline: "none" }} />
      {q.trim() && (
        <div style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden" }}>
          {matches.length === 0 ? (
            <div style={{ padding: "10px 11px", fontSize: 12, color: C.mut }}>Sin resultados en el catálogo del prototipo (en producción busca en todo EDGAR).</div>
          ) : matches.map((t) => {
            const has = adds.includes(t.sym);
            return (
              <button key={t.sym} onClick={() => { onAdd(t.sym); setQ(""); }} disabled={has}
                style={{ width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.line}`, background: C.panel, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: has ? 0.5 : 1 }}>
                <span style={{ fontSize: 13 }}><span style={{ fontFamily: MONO, fontWeight: 600 }}>{t.sym}</span> <span style={{ color: C.mut }}>· {t.name} · {t.sector}</span></span>
                <span style={{ color: C.ice, fontSize: 12 }}>{has ? "✓" : "+ Añadir"}</span>
              </button>
            );
          })}
        </div>
      )}
      {adds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {adds.map((s) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, background: C.ice + "1A", border: `1px solid ${C.ice}55`, borderRadius: 7, padding: "4px 6px 4px 9px" }}>
              {s}<button onClick={() => onRemove(s)} style={{ border: "none", background: "transparent", color: C.ice, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- componentes ---------- */
const Panel = ({ children, pad = 16 }) => <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: pad, marginBottom: 14 }}>{children}</div>;
const Row = ({ label, children }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 12 }}><span style={{ fontSize: 12.5, color: C.mut, fontWeight: 500 }}>{label}</span>{children}</div>;
const Note = ({ children }) => <p style={{ margin: "10px 0 0", fontSize: 11, color: C.mut, lineHeight: 1.5 }}>{children}</p>;
const ActionBtn = ({ children, onClick, disabled }) => <button className="act" onClick={onClick} disabled={disabled} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.bg, color: C.mut, opacity: disabled ? 0.4 : 1 }}>{children}</button>;
const Head = ({ left, right }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "24px 2px 10px" }}><h2 style={{ margin: 0, fontSize: 13, color: C.mut, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{left}</h2><span style={{ fontFamily: MONO, fontSize: 12, color: C.mut }}>{right}</span></div>;
const Step = ({ d, on, off }) => <button onClick={on} disabled={off} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.line}`, background: C.panelHi, color: off ? C.mut : C.ice, fontSize: 20, lineHeight: 1, opacity: off ? 0.4 : 1 }}>{d}</button>;
const Seg = ({ value, onChange, options }) => <div style={{ display: "flex", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: 2 }}>{options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} style={{ border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, background: value === v ? C.panelHi : "transparent", color: value === v ? C.text : C.mut, fontWeight: value === v ? 600 : 500 }}>{l}</button>)}</div>;
const Tag = ({ children, col }) => <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: col, border: `1px solid ${col}55`, borderRadius: 5, padding: "2px 5px" }}>{children}</span>;
const Leg = ({ col, l }) => <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.mut }}><span style={{ width: 10, height: 10, borderRadius: 3, background: col }} />{l}</span>;
const Num = ({ v, on }) => <input type="number" value={v} onChange={(e) => on(e.target.value === "" ? 0 : +e.target.value)} style={{ width: 58, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 6px", color: C.text, fontFamily: MONO, fontSize: 13, textAlign: "center", outline: "none" }} />;
const Toggle = ({ on, onClick }) => <button onClick={onClick} aria-pressed={on} style={{ width: 46, height: 26, borderRadius: 13, border: "none", background: on ? C.buy : C.line, position: "relative", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 20, background: "#fff", transition: "left .15s" }} /></button>;
const Mini = ({ k, v, alert }) => <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 8px", textAlign: "center" }}><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 650, color: alert ? C.ice : C.text }}>{v}</div><div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>{k}</div></div>;
function RegimeGauge({ r }) {
  const tone = r.score < 35 ? C.ice : r.score > 70 ? C.amber : C.mut;
  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>Miedo / Codicia</span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 650, color: tone }}>{r.label} · {r.score}/100</span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: `linear-gradient(90deg, ${C.ice}, ${C.line} 50%, ${C.amber})` }}>
        <span style={{ position: "absolute", top: -4, left: `calc(${r.score}% - 9px)`, width: 18, height: 18, borderRadius: 18, background: "#fff", border: `3px solid ${C.bg}`, boxShadow: "0 0 6px rgba(0,0,0,.7)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.mut, marginTop: 7 }}>
        <span>Pánico · sangre en la calle</span><span>Euforia · codicia</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Mini k="Caída desde máx." v={pct(r.dd)} alert={r.dd < -0.1} />
        <Mini k="Volatilidad sem." v={(r.vol * 100).toFixed(1) + "%"} alert={r.vol > 0.035} />
        <Mini k="Momentum 3m" v={pct(r.mom)} alert={r.mom < 0} />
      </div>
      <Note>Una compra de insiders en pánico es una oportunidad de mayor dimensión que la misma en euforia. Contextualiza el tamaño; no sustituye la convicción.</Note>
    </Panel>
  );
}
function Meter({ l, v, c }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: C.mut, width: 150, flexShrink: 0 }}>{l}</span>
      <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${clamp(v) * 100}%`, height: "100%", background: c, opacity: 0.85 }} /></div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.mut, width: 30, textAlign: "right" }}>{Math.round(clamp(v) * 100)}</span>
    </div>
  );
}
function StatCard({ title, s, dir }) {
  const good = C.buy;
  const hitGood = s.hit > 0.5;
  const avgGood = dir === "sell" ? s.avg < 0 : s.avg >= 0;
  const hitLabel = dir === "sell" ? "Acierto (baja)" : "Acierto";
  return (
    <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 11, padding: "12px 12px" }}>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {s.n === 0 ? <div style={{ color: C.mut, fontSize: 12 }}>Sin señales</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontFamily: MONO }}>
          <Kv k="Señales" v={s.n} />
          <Kv k={hitLabel} v={(s.hit * 100).toFixed(0) + "%"} c={hitGood ? good : C.sell} />
          <Kv k="Exceso medio" v={pct(s.avg)} c={avgGood ? good : C.sell} />
        </div>
      )}
    </div>
  );
}
const Kv = ({ k, v, c }) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.mut }}>{k}</span><span style={{ color: c || C.text, fontWeight: 600 }}>{v}</span></div>;
function VerdictCard({ v, sym }) {
  const map = { green: { c: C.buy, label: "FUERTE" }, yellow: { c: C.amber, label: "MODERADA" }, red: { c: C.sell, label: "DÉBIL" } };
  const m = map[v.level];
  const dot = { green: C.buy, yellow: C.amber, red: C.sell };
  return (
    <div style={{ background: C.panel, border: `1px solid ${m.c}55`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: m.c + "14", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ width: 14, height: 14, borderRadius: 14, background: m.c, boxShadow: `0 0 10px ${m.c}`, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: m.c }}>{v.headline}</div>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 1 }}>{sym} · fuerza de la señal{v.dimension ? ` · dimensión ${v.dimension.toLowerCase()}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: m.c }}>{v.buyCase}</div>
          <div style={{ fontSize: 9.5, color: C.mut, letterSpacing: "0.06em" }}>{m.label}</div>
        </div>
      </div>
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {v.reasons.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ marginTop: 5, width: 8, height: 8, borderRadius: 8, background: dot[r.t], flexShrink: 0 }} />
            <span style={{ fontSize: 13, lineHeight: 1.45 }}>{r.x}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 16px 14px", fontSize: 11, color: C.mut, lineHeight: 1.5 }}>Lectura de la fuerza de la señal, no una recomendación. Esto no es asesoría de inversión.</div>
    </div>
  );
}
