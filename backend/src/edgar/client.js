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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function edgarFetch(url, { json = false, retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          "Accept-Encoding": "gzip, deflate",
          Accept: json ? "application/json" : "*/*",
        },
      });
    } catch (e) {
      // error de red: reintenta con backoff
      if (attempt >= retries) throw e;
      await sleep(800 * 2 ** attempt);
      continue;
    }
    // 429/403 (rate limit) y 5xx: reintenta con backoff exponencial
    if ((res.status === 429 || res.status === 403 || res.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`EDGAR ${res.status} ${res.statusText} :: ${url}`);
    return json ? res.json() : res.text();
  }
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

// ---- listar 13F-HR de un GESTOR (submissions API) ----
// Devuelve los 13F-HR (y enmiendas 13F-HR/A) con su accession, fecha de
// PRESENTACIÓN (filed) y el período del reporte (report). Usa el mismo throttle.
export async function list13FFilings(cik, sinceISO) {
  const url = `${config.edgar.dataBase}/submissions/CIK${cik10(cik)}.json`;
  const data = await edgarFetch(url, { json: true });
  const out = [];
  const pick = (b) => {
    if (!b?.accessionNumber) return;
    for (let i = 0; i < b.accessionNumber.length; i++) {
      if (!/^13F-HR/.test(b.form[i])) continue;
      if (sinceISO && b.filingDate[i] < sinceISO) continue;
      out.push({
        cik: Number(cik),
        accession: b.accessionNumber[i],
        form: b.form[i],
        filed: b.filingDate[i],                 // fecha de PRESENTACIÓN
        report: b.reportDate?.[i] || null,      // período del reporte (fin de trimestre)
        primaryDocument: b.primaryDocument[i],
      });
    }
  };
  pick(data.filings?.recent);
  for (const f of data.filings?.files || []) {
    if (sinceISO && f.filingTo && f.filingTo < sinceISO) continue;
    try { pick(await edgarFetch(`${config.edgar.dataBase}/submissions/${f.name}`, { json: true })); }
    catch (e) { console.warn(`  ! página ${f.name}: ${e.message}`); }
  }
  out.sort((a, b) => (a.filed < b.filed ? -1 : 1));
  return out;
}

// ---- descargar la INFORMATION TABLE (XML) de un 13F-HR ----
// El folder trae primary_doc.xml (carátula) y la tabla de posiciones aparte.
export async function fetch13FInfoTable(filing) {
  const accNoDash = filing.accession.replace(/-/g, "");
  const folder = `${config.edgar.archivesBase}/edgar/data/${Number(filing.cik)}/${accNoDash}`;
  const idx = await edgarFetch(`${folder}/index.json`, { json: true });
  const xmls = (idx?.directory?.item || [])
    .map((it) => it.name)
    .filter((n) => n.endsWith(".xml") && !n.startsWith("xsl") && n !== "primary_doc.xml");
  if (!xmls.length) throw new Error(`Sin information table en ${folder}`);
  // Preferir el nombre que parezca la info table; si no, el primero.
  const name = xmls.find((n) => /info|table|13f|form13f/i.test(n)) || xmls[0];
  return edgarFetch(`${folder}/${name}`);
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
