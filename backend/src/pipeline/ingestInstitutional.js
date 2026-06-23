// Ingesta institucional: recorre un universo de GESTORES (parámetro, no fijo),
// descarga sus 13F-HR vía el cliente EDGAR (respeta User-Agent y rate limit),
// parsea cada information table con parse13F, mapea CUSIP→ticker con el mapper, y
// entrega los filings normalizados que consume aggregateInstitutional.js.
//
// Cada filing normalizado lleva el TIPO del gestor (activo|institucional) para que
// la agregación pueda pesar distinto a un hedge fund activo y a un indexado.
//
// NOTA: la lista de gestores se inyecta (default: MANAGERS de la config) para
// poder crecer el universo sin tocar este código.
import { list13FFilings, fetch13FInfoTable } from "../edgar/client.js";
import { parse13F } from "../edgar/form13.js";
import { createCusipMapper } from "../market/cusipMap.js";
import { MANAGERS } from "../config/managers.js";

// Reúne los 13F-HR de cada gestor desde `sinceISO`, parsea sus posiciones y
// devuelve filings crudos por gestor (aún por CUSIP, sin mapear a ticker):
//   { managerCik, managerName, managerType, period, filed, holdings: Holding[] }
// `limitPerManager` acota cuántos filings por gestor (p.ej. solo el más reciente).
export async function fetchManagerFilings(managers = MANAGERS, { sinceISO, limitPerManager } = {}) {
  const filings = [];
  for (const m of managers) {
    try {
      let list = await list13FFilings(m.cik, sinceISO);
      if (limitPerManager) list = list.slice(-limitPerManager); // los más recientes
      for (const f of list) {
        try {
          const xml = await fetch13FInfoTable(f);
          const holdings = parse13F(xml);
          filings.push({
            managerCik: m.cik,
            managerName: m.name,
            managerType: m.type,         // ← el tipo viaja por el pipeline
            period: f.report,            // fin de trimestre (del metadato del filing)
            filed: f.filed,              // fecha de presentación (para el rezago)
            holdings,
          });
        } catch (e) {
          console.warn(`  ! ${m.name} ${f.accession}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`  ! ${m.name} (CIK ${m.cik}): ${e.message}`);
    }
  }
  return filings;
}

// Mapea los CUSIP de todos los filings a ticker (en bloque, con caché) y devuelve
// los filings con holdings ya en términos de ticker, listos para agregar. También
// reporta la COBERTURA: cuántos CUSIPs únicos quedaron sin mapear (unmatched).
export async function mapFilingsToTickers(filings, { fetcher, cache } = {}) {
  const mapper = createCusipMapper({ fetcher, cache });
  const allCusips = filings.flatMap((f) => f.holdings.map((h) => h.cusip));
  const { map, unmatched } = await mapper.mapCusips(allCusips);

  const mapped = filings.map((f) => ({
    ...f,
    holdings: f.holdings
      .map((h) => {
        const t = map.get(h.cusip);
        return t ? { ...h, ticker: t.ticker, issuer: t.name } : null;
      })
      .filter(Boolean),
  }));

  const totalCusips = new Set(allCusips).size;
  const coverage = {
    totalCusips,
    matched: totalCusips - unmatched.length,
    unmatched: unmatched.length,
    unmatchedPct: totalCusips ? +(100 * unmatched.length / totalCusips).toFixed(1) : 0,
    unmatchedList: unmatched,
  };
  console.log(`[institucional] cobertura CUSIP→ticker: ${coverage.matched}/${totalCusips} (${coverage.unmatched} sin mapear, ${coverage.unmatchedPct}%)`);
  return { filings: mapped, coverage };
}

// Pipeline completo: gestores → 13F → parse → mapeo CUSIP→ticker. Devuelve los
// filings listos para aggregateInstitutional.js + la cobertura. NO agrega aquí:
// la agregación (por trimestre, neto, cruces 5%) vive en aggregateInstitutional.js.
export async function ingestInstitutional({ managers = MANAGERS, sinceISO, limitPerManager, fetcher, cache } = {}) {
  const raw = await fetchManagerFilings(managers, { sinceISO, limitPerManager });
  return mapFilingsToTickers(raw, { fetcher, cache });
}
