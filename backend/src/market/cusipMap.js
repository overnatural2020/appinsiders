// Mapeo CUSIP → ticker vía OpenFIGI. El 13F identifica posiciones por CUSIP, así
// que para agregar por ticker hace falta esta traducción.
//
// Diseño testeable: el `fetcher` se INYECTA (el mapper nunca toca la red), por lo
// que se puede probar offline. El fetcher recibe un lote de CUSIPs y devuelve un
// arreglo ALINEADO al orden del lote, con forma OpenFIGI v3: cada elemento es
// { data: [...] } (uno por instrumento/bolsa) o { warning: "..." }.

// createCusipMapper({ fetcher, cache, batchSize })
//  - dedup de la entrada y lotes de `batchSize` (default 10: límite de OpenFIGI sin key)
//  - selección US: prefiere exchCode "US" (el compuesto); si no, el primer Equity
//  - cachea positivos Y negativos: no re-consulta lo ya resuelto
export function createCusipMapper({ fetcher, cache = new Map(), batchSize = 10 } = {}) {
  if (typeof fetcher !== "function") throw new Error("createCusipMapper requiere un fetcher");

  // De los instrumentos de un CUSIP, elige el listado US; si no hay, el primer Equity.
  const pickUS = (data) => {
    if (!Array.isArray(data) || !data.length) return null;
    const chosen = data.find((d) => d.exchCode === "US") || data.find((d) => d.marketSector === "Equity");
    return chosen ? { ticker: chosen.ticker, name: chosen.name } : null;
  };

  async function mapCusips(cusips) {
    const map = new Map();      // CUSIP -> { ticker, name }
    const unmatched = [];       // CUSIPs sin match
    const uniq = [...new Set(cusips)];

    // 1) Resolver desde caché (positivos y negativos); juntar los que faltan.
    const need = [];
    for (const c of uniq) {
      if (cache.has(c)) {
        const v = cache.get(c);
        if (v) map.set(c, v); else unmatched.push(c);
      } else {
        need.push(c);
      }
    }

    // 2) Consultar el fetcher solo lo no cacheado, en lotes de batchSize.
    for (let i = 0; i < need.length; i += batchSize) {
      const batch = need.slice(i, i + batchSize);
      const res = await fetcher(batch);
      batch.forEach((c, idx) => {
        const r = res?.[idx];
        const val = r && !r.warning ? pickUS(r.data) : null;
        cache.set(c, val);          // cachea también el negativo (val === null)
        if (val) map.set(c, val); else unmatched.push(c);
      });
    }

    return { map, unmatched };
  }

  return { mapCusips };
}

// Fetcher REAL de OpenFIGI (no se testea con red; se inyecta en producción).
// POST https://api.openfigi.com/v3/mapping con body [{idType:"ID_CUSIP", idValue}]
// Rate limit: sin key ~25 req/min y lotes de 10 CUSIPs; con key gratis sube
// bastante (~250 req/min, lotes de 100). Respeta esos límites en la ingesta.
export function createOpenFigiFetcher({ apiKey } = {}) {
  return async function openFigiFetcher(batch) {
    const res = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-OPENFIGI-APIKEY": apiKey } : {}),
      },
      body: JSON.stringify(batch.map((cusip) => ({ idType: "ID_CUSIP", idValue: cusip }))),
    });
    if (!res.ok) throw new Error(`OpenFIGI ${res.status} ${res.statusText}`);
    return res.json(); // arreglo alineado al orden del lote
  };
}
