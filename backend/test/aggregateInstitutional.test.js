import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateQuarter,
  netInstitutionalChange,
  availableQuarters,
  latestNetChange,
} from "../src/pipeline/aggregateInstitutional.js";

// Mapa CUSIP -> ticker (el 13F identifica por CUSIP).
const MAP = { "458140100": "INTC" };
const Q1 = "2025-03-31", Q2 = "2025-06-30";

// 3 gestores (A, B, C) a lo largo de Q1 y Q2. El 13F se presenta ~45 días después
// del fin de trimestre: Q1 → mediados de mayo, Q2 → mediados de agosto.
const FILINGS = [
  // --- Q1 (presentados en mayo) ---
  // (a) Gestor A presenta DOS veces el mismo trimestre (enmienda). Debe contar 1.
  { managerCik: "A", period: Q1, filed: "2025-05-10", holdings: [{ cusip: "458140100", shares: 1_000_000, value: 50_000_000 }] },
  { managerCik: "A", period: Q1, filed: "2025-05-20", holdings: [{ cusip: "458140100", shares: 1_000_000, value: 50_000_000 }] },
  { managerCik: "B", period: Q1, filed: "2025-05-12", holdings: [{ cusip: "458140100", shares: 500_000, value: 25_000_000 }] },
  { managerCik: "C", period: Q1, filed: "2025-05-14", holdings: [{ cusip: "458140100", shares: 300_000, value: 15_000_000 }] },
  // --- Q2 (presentados en agosto) ---
  { managerCik: "A", period: Q2, filed: "2025-08-12", holdings: [{ cusip: "458140100", shares: 1_500_000, value: 75_000_000 }] }, // (b) AUMENTA +500k
  { managerCik: "B", period: Q2, filed: "2025-08-13", holdings: [{ cusip: "458140100", shares: 200_000, value: 10_000_000 }] },   // (b) REDUCE -300k
  { managerCik: "C", period: Q2, filed: "2025-08-14", holdings: [{ cusip: "458140100", shares: 300_000, value: 15_000_000 }] },   // estable
];

// (a) Un gestor con dos filings en el mismo trimestre cuenta UNA sola vez por CIK.
test("aggregateQuarter cuenta cada gestor una vez (no por filing)", () => {
  const q1 = aggregateQuarter(FILINGS, Q1, MAP, { asOf: "2025-06-01" });
  const intc = q1.find((t) => t.ticker === "INTC");
  assert.ok(intc, "debe haber INTC en Q1");
  assert.equal(intc.funds, 3, "3 gestores únicos (A, B, C), no 4 filings");
  // A=1M (una vez) + B=500k + C=300k = 1.8M.
  assert.equal(intc.shares, 1_800_000);
  // Si se contara por filing, A sumaría sus dos presentaciones = 2.8M → falla.
  assert.notEqual(intc.shares, 2_800_000, "no debe sumar los dos filings de A");
});

// (b) Un gestor aumenta y otro reduce entre Q1 y Q2.
test("netInstitutionalChange refleja aumento y reducción entre Q1 y Q2", () => {
  // asOf en septiembre: ambos trimestres ya presentados.
  const changes = netInstitutionalChange(FILINGS, Q2, Q1, MAP, { asOf: "2025-09-01" });
  const intc = changes.find((t) => t.ticker === "INTC");
  assert.ok(intc);
  // Q2 = 1.5M(A) + 0.2M(B) + 0.3M(C) = 2.0M ; Q1 = 1.8M → neto +200k.
  assert.equal(intc.shares, 2_000_000);
  assert.equal(intc.netShares, 200_000, "A +500k y B -300k → neto +200k");
  assert.equal(intc.netFunds, 0, "siguen siendo 3 gestores");
});

// (c) La disponibilidad se decide por FECHA DE PRESENTACIÓN (rezago ~45d), no por
// la fecha del trimestre. Sin look-ahead.
test("no hay look-ahead: Q2 no existe hasta que sus 13F se presentan", () => {
  // 1 de julio: Q1 ya presentado (mayo); Q2 (fin 30-jun) NO se presenta hasta agosto.
  assert.deepEqual(availableQuarters(FILINGS, "2025-07-01"), [Q1], "solo Q1 disponible el 1-jul");

  // Aunque el trimestre Q2 ya 'terminó' (30-jun ≤ 1-jul), aún no hay filings → vacío.
  const q2EarlyView = aggregateQuarter(FILINGS, Q2, MAP, { asOf: "2025-07-01" });
  assert.equal(q2EarlyView.length, 0, "Q2 sin datos el 1-jul (look-ahead si trae algo)");

  // El cambio neto 'al 1-jul' no puede comparar Q2 vs Q1: Q2 no existe todavía.
  const early = latestNetChange(FILINGS, MAP, "2025-07-01");
  assert.equal(early.period, Q1);
  assert.equal(early.prevPeriod, null, "no debe inventar el trimestre futuro");
  assert.equal(early.changes.length, 0);

  // Al 1-sep, ambos trimestres disponibles → ya compara Q2 vs Q1.
  const later = latestNetChange(FILINGS, MAP, "2025-09-01");
  assert.equal(later.period, Q2);
  assert.equal(later.prevPeriod, Q1);
  assert.equal(later.changes.find((t) => t.ticker === "INTC").netShares, 200_000);
});
