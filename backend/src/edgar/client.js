// Cliente HTTP de EDGAR: respeta User-Agent y rate limit, y expone los endpoints
// que necesitamos (mapa ticker→CIK, submissions por CIK, y descarga del XML de Form 4).
import { config } from "../config.js";

// ---- limitador secuencial simple (un cubo global) ----
let lastReq = 0;
async function throttle() {
  const wait = config.minRequestIntervalMs - (Date.now() - lastReq);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
}

async function edgarFetch(url, { json = false } = {}) {
  await throttle();
  const res = await fetch(url, {
    headers: {
      "User-Agent": config.userAgent,
      "Accept-Encoding": "gzip, deflate",
      Accept: json ? "application/json" : "*/*",
    },
  });
  if (!res.ok) throw new Error(`EDGAR ${res.status} ${res.statusText} :: ${url}`);
  return json ? res.json() : res.text();
}

const cik10 = (cik) => String(cik).replace(/\D/g, "").padStart(10, "0");

// ---- mapa ticker -> CIK (cacheado en memoria) ----
let _tickerMap = null;
export async function loadTickerCikMap() {
  if (_tickerMap) return _tickerMap;
  const raw = await edgarFetch(config.edgar.tickerMapUrl, { json: true });
  const map = new Map();
  for (const k of Object.keys(raw)) {
    const { ticker, cik_str } = raw[k];
    if (ticker) map.set(ticker.toUpperCase(), Number(cik_str));
  }
  _tickerMap = map;
  return map;
}

export async function cikForTicker(ticker) {
  const map = await loadTickerCikMap();
  const cik = map.get(ticker.toUpperCase());
  if (!cik) throw new Error(`Ticker no encontrado en EDGAR: ${ticker}`);
  return cik;
}

// Convierte un bloque de filings (recent o un archivo paginado) a filas tipo 4.
function pickForm4(block, cik, sinceISO, out) {
  if (!block?.accessionNumber) return;
  for (let i = 0; i < block.accessionNumber.length; i++) {
    if (block.form[i] !== "4") continue;
    if (sinceISO && block.filingDate[i] < sinceISO) continue;
    out.push({
      cik: Number(cik),
      accession: block.accessionNumber[i],
      filingDate: block.filingDate[i],
      primaryDocument: block.primaryDocument[i],
    });
  }
}

// ---- listar Form 4 de una empresa (submissions API) ----
// Recorre `filings.recent` y, para histórico largo (> ~1 año), también los
// archivos paginados en `filings.files[]`.
export async function listForm4Filings(cik, sinceISO) {
  const url = `${config.edgar.dataBase}/submissions/CIK${cik10(cik)}.json`;
  const data = await edgarFetch(url, { json: true });
  const out = [];
  pickForm4(data.filings?.recent, cik, sinceISO, out);

  for (const f of data.filings?.files || []) {
    if (sinceISO && f.filingTo && f.filingTo < sinceISO) continue; // página fuera de rango
    try {
      const page = await edgarFetch(`${config.edgar.dataBase}/submissions/${f.name}`, { json: true });
      pickForm4(page, cik, sinceISO, out);
    } catch (e) {
      console.warn(`  ! página ${f.name}: ${e.message}`);
    }
  }
  out.sort((a, b) => (a.filingDate < b.filingDate ? -1 : 1));
  return out;
}

// ---- resolver y descargar el XML de propiedad (ownership document) ----
export async function fetchForm4Xml(filing) {
  const accNoDash = filing.accession.replace(/-/g, "");
  const folder = `${config.edgar.archivesBase}/edgar/data/${Number(filing.cik)}/${accNoDash}`;

  let docName = filing.primaryDocument;
  const looksXml = docName && docName.endsWith(".xml") && !docName.includes("xsl");
  if (!looksXml) {
    // Buscar el .xml de propiedad en el índice de la carpeta del filing.
    const idx = await edgarFetch(`${folder}/index.json`, { json: true });
    const items = idx?.directory?.item || [];
    const xml = items.find(
      (it) => it.name.endsWith(".xml") && !it.name.startsWith("xsl")
    );
    if (!xml) throw new Error(`Sin XML de propiedad en ${folder}`);
    docName = xml.name;
  }
  return edgarFetch(`${folder}/${docName}`);
}
