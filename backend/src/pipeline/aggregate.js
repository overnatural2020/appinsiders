// Agregación: convierte operaciones normalizadas en buckets semanales con el
// MISMO shape que consume el motor del frontend:
//   week = { ws, ym, buyQ, sellQ, buyers:[{role,opp,holdPct,shares}], sellers:[...], raw, excl }
// Aplica la limpieza: solo P (compra) y S (venta) a mercado abierto, sin 10b5-1.
import { config } from "../config.js";
import { mondayOf, ymOf } from "./week.js";

const isBuy = (t) => config.qualifyingBuyCodes.includes(t.code) && t.acquired && !t.is10b51;
const isSell = (t) => config.qualifyingSellCodes.includes(t.code) && !t.is10b51;

export function aggregateWeekly(transactions) {
  const weeks = new Map(); // ws -> week
  const ensure = (ws) => {
    if (!weeks.has(ws))
      weeks.set(ws, { ws, ym: ymOf(ws), buyQ: 0, sellQ: 0, buyers: [], sellers: [], raw: 0, excl: 0 });
    return weeks.get(ws);
  };

  for (const t of transactions) {
    const w = ensure(mondayOf(t.txDate));
    w.raw++;
    if (isBuy(t)) {
      w.buyQ += t.shares;
      w.buyers.push({ role: t.role, opp: false, holdPct: t.holdPct ?? 0, shares: t.shares, ownerCik: t.ownerCik });
    } else if (isSell(t)) {
      w.sellQ += t.shares;
      w.sellers.push({ role: t.role, opp: false, holdPct: t.holdPct ?? 0, shares: t.shares, ownerCik: t.ownerCik });
    } else {
      w.excl++; // A, M, F, G, o 10b5-1
    }
  }

  return [...weeks.values()].sort((a, b) => (a.ws < b.ws ? -1 : 1));
}

// Clasificación rutinario vs oportunista, en una pasada sobre TODO el historial
// del owner. Heurística (Cohen-Malloy-Pomorski simplificada): si un insider opera
// de forma recurrente en el mismo mes calendario, sus trades son rutinarios (opp=false);
// si este trade rompe su patrón, es oportunista (opp=true).
export function enrichOpportunistic(transactions, weeks) {
  // historial de meses-del-año en que cada owner ha operado
  const monthsByOwner = new Map();
  for (const t of transactions) {
    const m = Number(t.txDate.slice(5, 7));
    if (!monthsByOwner.has(t.ownerCik)) monthsByOwner.set(t.ownerCik, []);
    monthsByOwner.get(t.ownerCik).push(m);
  }
  const isRoutine = (ownerCik, iso) => {
    const hist = monthsByOwner.get(ownerCik) || [];
    if (hist.length < 4) return false; // poco historial -> no asumimos rutina
    const m = Number(iso.slice(5, 7));
    const sameMonth = hist.filter((x) => x === m).length;
    return sameMonth / hist.length > 0.6; // opera casi siempre en este mes -> rutinario
  };
  for (const w of weeks) {
    for (const b of [...w.buyers, ...w.sellers]) {
      b.opp = !isRoutine(b.ownerCik, w.ws);
    }
  }
  return weeks;
}
