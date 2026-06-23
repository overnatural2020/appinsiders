// Momentum semanal: medias móviles, posición del precio y cruce de tendencia.
//
// Diseño testeable: el `fetcher` se INYECTA (no toca la red dentro de la función,
// igual que cusipMap). El fetcher real (OpenFIGI/AlphaVantage/etc.) se inyecta en
// producción y NO se testea con red.

// computeMomentum(series, { shortWin, longWin })
//   series: serie SEMANAL ascendente [{ date, close }].
//   shortWin=10, longWin=40 → equivalentes SEMANALES de las MA de 50 y 200 DÍAS
//   (10 semanas ≈ 50 días hábiles, 40 semanas ≈ 200 días). Por eso los campos se
//   llaman ma50/ma200 aunque las ventanas estén en SEMANAS — no confundir con días.
// Por semana añade: ma50, ma200, aboveMA50, aboveMA200, trendTurnedUp.
// Si falta historia para una media, esa media es null y los flags que dependen de
// ella son null (trendTurnedUp es siempre booleano: false si no se puede calcular).
export function computeMomentum(series, { shortWin = 10, longWin = 40 } = {}) {
  const closes = series.map((p) => p.close);
  const ma = (i, win) => {
    if (i < win - 1) return null; // sin ventana completa todavía
    let s = 0;
    for (let k = i - win + 1; k <= i; k++) s += closes[k];
    return s / win;
  };
  return series.map((p, i) => {
    const ma50 = ma(i, shortWin);   // media corta (≈50 días)
    const ma200 = ma(i, longWin);   // media larga (≈200 días)
    const aboveMA50 = ma50 == null ? null : p.close > ma50;
    const aboveMA200 = ma200 == null ? null : p.close > ma200;
    // Cruce al alza ESTA semana: corta pasó de <= a > la larga respecto a la
    // semana anterior (cuando ambas medias existían).
    let trendTurnedUp = false;
    if (ma50 != null && ma200 != null && i > 0) {
      const pShort = ma(i - 1, shortWin);
      const pLong = ma(i - 1, longWin);
      if (pShort != null && pLong != null) {
        trendTurnedUp = ma50 > ma200 && pShort <= pLong;
      }
    }
    return { ...p, ma50, ma200, aboveMA50, aboveMA200, trendTurnedUp };
  });
}

// getWeeklyPrices(ticker, { fetcher, shortWin, longWin })
// Obtiene la serie cruda vía el fetcher inyectado y le aplica computeMomentum.
export async function getWeeklyPrices(ticker, { fetcher, shortWin, longWin } = {}) {
  if (typeof fetcher !== "function") throw new Error("getWeeklyPrices requiere un fetcher");
  const series = await fetcher(ticker);
  return computeMomentum(series || [], { shortWin, longWin });
}

// Fetcher REAL source-agnostic: Alpha Vantage TIME_SERIES_WEEKLY_ADJUSTED.
// Normaliza a [{ date, close }] ASCENDENTE. La API key se INYECTA (en producción
// process.env.ALPHAVANTAGE_API_KEY); nunca literal. No se testea con red.
export function createAlphaVantageFetcher({ apiKey } = {}) {
  return async function alphaVantageFetcher(ticker) {
    if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY no configurada");
    const url =
      `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED` +
      `&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`AlphaVantage ${res.status} ${res.statusText}`);
    const j = await res.json();
    const ts = j["Weekly Adjusted Time Series"];
    if (!ts) throw new Error(`AlphaVantage sin datos para ${ticker}: ${j.Note || j["Error Message"] || "?"}`);
    return Object.entries(ts)
      .map(([date, row]) => ({ date, close: Number(row["5. adjusted close"] ?? row["4. close"]) }))
      .filter((p) => Number.isFinite(p.close))
      .sort((a, b) => (a.date < b.date ? -1 : 1)); // ascendente
  };
}
