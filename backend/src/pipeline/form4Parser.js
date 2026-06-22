// Parser de Form 4: convierte el XML de propiedad de la SEC en una lista de
// operaciones normalizadas. No decide nada de negocio; solo extrae y clasifica
// campo a campo. La agregación/limpieza vive en pipeline/aggregate.js.
import { XMLParser } from "fast-xml-parser";
import { classifyRole, docLevel10b51, footnotesIndicate10b51 } from "./classify.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // mantenemos strings; convertimos números nosotros
});

const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const val = (node) => (node && typeof node === "object" ? node.value : node);
const num = (node) => {
  const v = val(node);
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Mapa id -> texto de cada nota al pie.
function footnotesMap(doc) {
  const m = {};
  for (const f of toArray(doc.footnotes?.footnote)) {
    if (f && typeof f === "object") m[f["@_id"]] = f["#text"] ?? "";
  }
  return m;
}

// Recoge todos los footnoteId referenciados dentro de un nodo (recursivo).
function collectFootnoteIds(node, acc = new Set()) {
  if (!node || typeof node !== "object") return acc;
  for (const [k, v] of Object.entries(node)) {
    if (k === "footnoteId") {
      for (const f of toArray(v)) {
        const id = f && typeof f === "object" ? f["@_id"] : null;
        if (id) acc.add(id);
      }
    } else if (typeof v === "object") {
      collectFootnoteIds(v, acc);
    }
  }
  return acc;
}

/**
 * parseForm4(xml) -> Transaction[]
 * Transaction = {
 *   issuerCik, ticker, ownerCik, ownerName, role,
 *   code, acquired, shares, price, sharesAfter, holdPct,
 *   is10b51, txDate (ISO 'YYYY-MM-DD')
 * }
 */
export function parseForm4(xml) {
  const root = parser.parse(xml);
  const doc = root.ownershipDocument;
  if (!doc) throw new Error("XML no es un ownershipDocument (Form 3/4/5)");

  const issuerCik = val(doc.issuer?.issuerCik);
  const ticker = (val(doc.issuer?.issuerTradingSymbol) || "").toUpperCase();
  const fnMap = footnotesMap(doc);
  const docPlan = docLevel10b51(doc);

  // Puede haber varios reporting owners (filing conjunto). Tomamos el primero
  // para rol; cada transacción se atribuye a ese owner.
  const owners = toArray(doc.reportingOwner);
  const primary = owners[0] || {};
  const ownerName = val(primary.reportingOwnerId?.rptOwnerName) || "";
  const ownerCik = val(primary.reportingOwnerId?.rptOwnerCik) || "";
  const role = classifyRole(primary.reportingOwnerRelationship || {});

  const txns = toArray(doc.nonDerivativeTable?.nonDerivativeTransaction);
  const out = [];
  for (const t of txns) {
    const code = val(t.transactionCoding?.transactionCode) || "";
    const acquired = (val(t.transactionAmounts?.transactionAcquiredDisposedCode) || "") === "A";
    const shares = num(t.transactionAmounts?.transactionShares);
    const price = num(t.transactionAmounts?.transactionPricePerShare);
    const sharesAfter = num(t.postTransactionAmounts?.sharesOwnedFollowingTransaction);
    const txDate = val(t.transactionDate);

    // 10b5-1: bandera a nivel documento, o nota al pie referenciada por ESTA transacción.
    let is10b51 = docPlan;
    if (!is10b51) {
      const refText = [...collectFootnoteIds(t)].map((id) => fnMap[id] || "").join(" ");
      is10b51 = footnotesIndicate10b51(refText);
    }

    // % de incremento sobre la posición previa del insider (señal de tamaño relativo).
    let holdPct = null;
    if (acquired && shares != null && sharesAfter != null) {
      const before = sharesAfter - shares;
      holdPct = before > 0 ? shares / before : 1; // primera compra grande -> tope
    }

    if (!code || shares == null || !txDate) continue;
    out.push({
      issuerCik, ticker, ownerCik, ownerName, role,
      code, acquired, shares, price, sharesAfter, holdPct,
      is10b51, txDate,
    });
  }
  return out;
}
