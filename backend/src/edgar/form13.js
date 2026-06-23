// Parser de la "information table" de un 13F-HR.
//
// IMPORTANTE: parse13F SOLO extrae las posiciones de UN gestor (un filing). NO
// conoce el CIK del gestor ni el período del reporte — esos vienen de los
// metadatos del filing (submissions API) y se inyectan en la capa de ingesta.
// La AGREGACIÓN (nº de fondos por ticker, cambio neto institucional trimestre a
// trimestre, cruces del 5% de 13D/13G) combina MUCHOS 13F y necesita un mapa
// CUSIP→ticker; vive en un módulo aparte: src/pipeline/aggregateInstitutional.js.
import { XMLParser } from "fast-xml-parser";

// removeNSPrefix: el XML declara un namespace por defecto (informationtable).
// parseTagValue:false: NO convertir valores a número automáticamente, porque el
// parser se comería el cero inicial de los CUSIP (037833100 → 37833100) y
// rompería el mapeo CUSIP→ticker. Los números los convertimos nosotros, explícito.
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreAttributes: true,
});

const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * parse13F(xml) -> Holding[]
 * Holding = { nameOfIssuer, cusip, value, shares, sshType, discretion }
 * Devuelve SIEMPRE un arreglo (normaliza el caso de un solo <infoTable>, que el
 * parser entrega como objeto en vez de array).
 */
export function parse13F(xml) {
  const root = parser.parse(xml);
  const rows = toArray(root?.informationTable?.infoTable);
  return rows.map((r) => ({
    nameOfIssuer: r.nameOfIssuer ?? "",
    cusip: String(r.cusip ?? ""),               // string: conserva el 0 inicial
    value: num(r.value),                         // valor de la posición (USD)
    shares: num(r.shrsOrPrnAmt?.sshPrnamt),      // acciones (número, explícito)
    sshType: r.shrsOrPrnAmt?.sshPrnamtType ?? "", // SH (acciones) o PRN (principal)
    discretion: r.investmentDiscretion ?? "",     // SOLE | SHARED-DEFINED | ...
  }));
}
