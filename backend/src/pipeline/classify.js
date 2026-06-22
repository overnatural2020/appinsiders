// Clasificación de cada operación: rol del insider, tipo de código, y plan 10b5-1.
// Estos son los ingredientes que el motor de convicción del frontend espera.

// Pesos de rol (deben coincidir con ROLE_W del frontend).
export const ROLE_W = { CEO: 1.0, CFO: 0.9, OFF: 0.6, DIR: 0.5, OWN: 0.4, OTHER: 0.3 };

// Deriva un código de rol a partir de la relación reportada en el Form 4.
export function classifyRole(rel) {
  const title = (rel.officerTitle || "").toLowerCase();
  const isOfficer = rel.isOfficer === "1" || rel.isOfficer === 1 || rel.isOfficer === true;
  const isDirector = rel.isDirector === "1" || rel.isDirector === 1 || rel.isDirector === true;
  const isTenPct = rel.isTenPercentOwner === "1" || rel.isTenPercentOwner === 1 || rel.isTenPercentOwner === true;

  if (isOfficer && /(chief exec|\bceo\b|president and ceo)/.test(title)) return "CEO";
  if (isOfficer && /(chief financ|\bcfo\b)/.test(title)) return "CFO";
  if (isTenPct) return "OWN";
  if (isOfficer) return "OFF";
  if (isDirector) return "DIR";
  return "OTHER";
}

// ¿El FORMULARIO completo está marcado como 10b5-1? (campo estructurado, esquema
// nuevo). El caso por-transacción (notas al pie referenciadas) se resuelve en el
// parser, porque un 10b5-1 suele aplicar solo a operaciones concretas.
export function docLevel10b51(doc) {
  const aff = doc.aff10b5One ?? doc.aff10b5One1;
  const v = aff && typeof aff === "object" ? aff.value : aff;
  return v === "1" || v === 1 || v === true;
}

// ¿El texto de las notas al pie referenciadas indica un plan 10b5-1?
export function footnotesIndicate10b51(text) {
  return /10b5[-\u2010\u2011\u2013\s]?1|rule 10b5/i.test(text || "");
}

// Clasificación rutinario vs oportunista.
// STUB: requiere el historial completo del insider (si opera siempre en el mismo
// mes del año = rutinario, sin señal; si es irregular = oportunista, con señal).
// Se calcula en una pasada posterior sobre todas las operaciones del owner.
// Por ahora devuelve false; ver enrichOpportunistic() en pipeline/aggregate.js.
export function isOpportunisticStub() {
  return false;
}
