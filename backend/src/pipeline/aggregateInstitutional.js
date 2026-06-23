// Agregación institucional: combina MUCHOS 13F (uno por gestor) para derivar
// señales por ticker. Paso de pipeline aparte del parser (form13.js), porque
// requiere:
//   - un mapa CUSIP → ticker (el 13F identifica por CUSIP, no por ticker),
//   - metadatos que NO vienen en la information table: el CIK del gestor (para no
//     contar dos veces) y el período + la FECHA DE PRESENTACIÓN del filing.
//
// Forma de cada filing (la arma la ingesta: parse13F + metadatos del submission):
//   { managerCik, period: 'YYYY-MM-DD', filed: 'YYYY-MM-DD', holdings: Holding[] }
//
// Sin look-ahead: un 13F del período P se PRESENTA ~45 días después del fin de
// trimestre. Por tanto, "lo que se sabía en la fecha T" son solo los filings con
// filed <= T. Nunca se usa la fecha del trimestre para decidir disponibilidad.
//
// Nota: <value> venía en MILES de USD hasta 2023 y en dólares enteros después;
// normalízalo en la ingesta antes de agregar si mezclas periodos antiguos.

export const REPORT_LAG_DAYS = 45; // rezago típico de presentación del 13F

const tickerFor = (cusip, map) =>
  (map instanceof Map ? map.get(cusip) : map?.[cusip]) || null;
const ts = (d) => new Date(d).getTime();

// Filings ya PRESENTADOS a la fecha `asOf` (sin look-ahead). Sin asOf, todos.
export function availableAt(filings, asOf) {
  if (!asOf) return filings;
  const cut = ts(asOf);
  return filings.filter((f) => f.filed && ts(f.filed) <= cut);
}

// Períodos (trimestres) DISPONIBLES a `asOf`, de más reciente a más antiguo.
// Un trimestre no "existe" hasta que sus 13F se presentan.
export function availableQuarters(filings, asOf) {
  return [...new Set(availableAt(filings, asOf).map((f) => f.period))].sort().reverse();
}

// Para un período: el filing MÁS RECIENTE de CADA gestor (CIK). Cubre enmiendas
// o dobles presentaciones en el mismo trimestre → cada gestor cuenta una vez.
function latestPerManager(filings, period, asOf) {
  const fs = availableAt(filings.filter((f) => f.period === period), asOf);
  const byMgr = new Map();
  for (const f of fs) {
    const prev = byMgr.get(f.managerCik);
    if (!prev || ts(f.filed) > ts(prev.filed)) byMgr.set(f.managerCik, f);
  }
  return [...byMgr.values()];
}

// Posiciones por ticker en UN período. Cada gestor (CIK) cuenta UNA sola vez.
export function aggregateQuarter(filings, period, cusipToTicker, { asOf } = {}) {
  const byTicker = new Map(); // ticker -> { managers:Set, shares, value }
  for (const f of latestPerManager(filings, period, asOf)) {
    for (const h of f.holdings || []) {
      const ticker = tickerFor(h.cusip, cusipToTicker);
      if (!ticker) continue;
      if (!byTicker.has(ticker)) byTicker.set(ticker, { ticker, managers: new Set(), shares: 0, value: 0 });
      const t = byTicker.get(ticker);
      t.managers.add(f.managerCik);
      t.shares += h.shares || 0;
      t.value += h.value || 0;
    }
  }
  return [...byTicker.values()].map((t) => ({
    ticker: t.ticker,
    funds: t.managers.size, // nº de gestores únicos en el ticker
    shares: t.shares,
    value: t.value,
  }));
}

// Cambio neto institucional por ticker entre dos períodos, usando SOLO lo
// presentado a `asOf` (mismo asOf para ambos lados → sin look-ahead).
export function netInstitutionalChange(filings, period, prevPeriod, cusipToTicker, { asOf } = {}) {
  const curr = aggregateQuarter(filings, period, cusipToTicker, { asOf });
  const prev = aggregateQuarter(filings, prevPeriod, cusipToTicker, { asOf });
  const prevMap = new Map(prev.map((t) => [t.ticker, t]));
  const out = [];
  const seen = new Set();
  for (const c of curr) {
    seen.add(c.ticker);
    const p = prevMap.get(c.ticker) || { funds: 0, shares: 0 };
    out.push({ ticker: c.ticker, funds: c.funds, netShares: c.shares - p.shares, netFunds: c.funds - p.funds, shares: c.shares });
  }
  for (const p of prev) {
    if (seen.has(p.ticker)) continue;
    out.push({ ticker: p.ticker, funds: 0, netShares: -p.shares, netFunds: -p.funds, shares: 0 });
  }
  return out.sort((a, b) => b.netShares - a.netShares);
}

// Cambio neto entre los DOS trimestres más recientes DISPONIBLES a `asOf`.
// Si solo hay uno disponible (el siguiente aún no se presenta), no inventa el
// trimestre futuro: devuelve prevPeriod=null y changes=[].
export function latestNetChange(filings, cusipToTicker, asOf) {
  const qs = availableQuarters(filings, asOf);
  if (qs.length < 2) return { period: qs[0] ?? null, prevPeriod: null, changes: [] };
  const [period, prevPeriod] = qs;
  return { period, prevPeriod, changes: netInstitutionalChange(filings, period, prevPeriod, cusipToTicker, { asOf }) };
}

// Cruces del umbral del 5% (señal tipo 13D/13G) entre dos snapshots por gestor,
// dado el total de acciones en circulación por ticker.
export function crossings5pct(currByManager, prevByManager, sharesOutstanding) {
  const pct = (shares, ticker) => {
    const so = sharesOutstanding instanceof Map ? sharesOutstanding.get(ticker) : sharesOutstanding?.[ticker];
    return so ? shares / so : null;
  };
  const key = (cik, ticker) => `${cik}|${ticker}`;
  const prev = new Map(prevByManager.map((x) => [key(x.managerCik, x.ticker), x.shares]));
  const out = [];
  for (const c of currByManager) {
    const p = prev.get(key(c.managerCik, c.ticker)) || 0;
    const pc = pct(c.shares, c.ticker), pp = pct(p, c.ticker);
    if (pc == null) continue;
    if (pp != null && pp < 0.05 && pc >= 0.05) out.push({ ...c, cross: "up", pct: pc });
    else if (pp != null && pp >= 0.05 && pc < 0.05) out.push({ ...c, cross: "down", pct: pc });
  }
  return out;
}
