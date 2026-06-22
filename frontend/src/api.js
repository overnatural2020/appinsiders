// Capa de datos: conecta con el backend (../backend) y SUPERPONE datos reales
// sobre el dataset sintético que arma App.jsx (generateDataset).
//
// El motor de App.jsx trabaja sobre una cuadrícula fija de N semanas lunes-inicio
// desde START. El backend sirve:
//   - /api/insiders            -> tickers ingeridos
//   - /api/insiders/:t/weekly  -> semanas reales de insiders [{ ws (ISO), buyQ, sellQ, buyers, sellers, raw, excl }]
//   - /api/market/:t           -> precios diarios [{ date, close, volume }]
// Aquí alineamos eso a la cuadrícula del motor (mismo `i`, `ws` como Date) y al
// price[] semanal. Para los tickers que NO estén en el backend se conserva el
// sintético, así la UI nunca se queda vacía.

// En producción (build) el backend sirve el frontend → API same-origin (ruta
// relativa, API = ""). En desarrollo (vite dev) apunta al backend local.
const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8080" : "");

/* ----------------------------- sesión / token ----------------------------- */
const TOKEN_KEY = "ia_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const logout = () => setToken("");

// fetch JSON con el token de sesión por defecto; lanza con el mensaje del backend.
async function req(path, { method = "GET", body, token = getToken() } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}
const getJSON = (path, token) => req(path, { token });

/* --------------------------------- auth ---------------------------------- */
export async function login(email, password) {
  const { token, user } = await req("/api/auth/login", { method: "POST", body: { email, password } });
  setToken(token);
  return user;
}
export async function fetchMe() {
  return (await req("/api/auth/me")).user;
}

/* --------------------------- admin: usuarios ----------------------------- */
export const adminListUsers = () => req("/api/admin/users").then((d) => d.users);
export const adminCreateUser = (body) => req("/api/admin/users", { method: "POST", body }).then((d) => d.user);
export const adminUpdateUser = (id, body) => req(`/api/admin/users/${id}`, { method: "PATCH", body }).then((d) => d.user);
export const adminDeleteUser = (id) => req(`/api/admin/users/${id}`, { method: "DELETE" });

/* --------------------------- admin: scheduler ---------------------------- */
export const adminGetSchedule = () => req("/api/admin/schedule");
export const adminSaveSchedule = (body) => req("/api/admin/schedule", { method: "PUT", body }).then((d) => d.schedule);
export const adminRunInspection = (reingest = false) => req("/api/admin/schedule/run", { method: "POST", body: { reingest } }).then((d) => d.result);

export async function fetchTickers(token) {
  return (await getJSON(`/api/insiders`, token)).tickers;
}

// Cierre de la primera fecha de cotización en o DESPUÉS de `iso` (búsqueda lineal
// sobre serie ascendente; suficiente para ~750 puntos).
function closeOnOrAfter(prices, iso) {
  for (let i = 0; i < prices.length; i++) if (prices[i].date >= iso) return prices[i].close;
  return prices.length ? prices[prices.length - 1].close : null; // extrapola con el último
}

// Construye un price[] semanal alineado a la cuadrícula del motor (un punto por
// cada lunes `ws`). Normaliza al primer valor para que arranque ~ al precio meta.
function weeklyPriceFromDaily(prices, grid, basePrice) {
  if (!prices?.length) return null;
  const out = grid.map((ws) => closeOnOrAfter(prices, ws));
  // Si hay huecos al inicio (antes del primer dato), rellena con el primero válido.
  const firstValid = out.find((x) => x != null);
  return out.map((x) => (x == null ? firstValid : x));
}

// Mapea las semanas reales (keyed por ws ISO) sobre la cuadrícula del motor.
function weeklyInsidersOnGrid(realWeeks, gridWeeks) {
  const byWs = new Map(realWeeks.map((w) => [w.ws, w]));
  return gridWeeks.map((g) => {
    const r = byWs.get(g.isoWs);
    if (!r) return { ...g, buyQ: 0, sellQ: 0, buyers: [], sellers: [], raw: 0, excl: 0 };
    return {
      ...g,
      buyQ: r.buyQ || 0, sellQ: r.sellQ || 0,
      buyers: r.buyers || [], sellers: r.sellers || [],
      raw: r.raw || 0, excl: r.excl || 0,
    };
  });
}

/**
 * overlayRealData(synthDs, gridMeta, token)
 *   synthDs   : el dataset sintético de generateDataset() { tickers, bench, sentiment }
 *   gridMeta  : { grid: ['YYYY-MM-DD'...N], gridWeeks: [{ i, ws(Date), isoWs, ym }...] }
 * Devuelve { ds, realSyms } con los tickers reales superpuestos y, si hay SPY,
 * bench/sentiment reales.
 */
export async function overlayRealData(synthDs, gridMeta, token = getToken()) {
  const { grid, gridWeeks } = gridMeta;
  let ingested = [];
  try { ingested = await fetchTickers(token); }
  catch { return { ds: synthDs, realSyms: [], offline: true }; }

  const ds = { ...synthDs, tickers: { ...synthDs.tickers } };
  const realSyms = [];

  // Benchmark real (SPY) si está disponible.
  try {
    const spy = await getJSON(`/api/market/SPY`, token);
    const bench = weeklyPriceFromDaily(spy.prices, grid);
    if (bench) { ds.bench = bench; ds.sentiment = bench; } // régimen sobre índice real
  } catch { /* sin SPY: se conserva el bench sintético */ }

  // Para cada ticker del catálogo que esté ingerido, superpone semanas + precio reales.
  await Promise.all(
    Object.keys(synthDs.tickers).map(async (sym) => {
      if (!ingested.includes(sym)) return;
      try {
        const [wk, mk] = await Promise.all([
          getJSON(`/api/insiders/${sym}/weekly?weeks=${grid.length}`, token),
          getJSON(`/api/market/${sym}`, token).catch(() => null),
        ]);
        const base = synthDs.tickers[sym];
        const weeks = weeklyInsidersOnGrid(wk.weeks, gridWeeks);
        const price = mk ? weeklyPriceFromDaily(mk.prices, grid, base.meta.price) : base.price;
        ds.tickers[sym] = { ...base, weeks, price, real: true };
        realSyms.push(sym);
      } catch { /* deja el sintético para este símbolo */ }
    })
  );

  return { ds, realSyms, offline: false };
}
