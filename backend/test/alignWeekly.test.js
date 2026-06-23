import { test } from "node:test";
import assert from "node:assert/strict";
import { alignToAxis, forwardExcess } from "../src/pipeline/alignWeekly.js";
import { mondayOf } from "../src/pipeline/week.js";

// Eje de lunes (4 semanas consecutivas) — como lo produce el agregado de insiders.
const axis = ["2025-03-03", "2025-03-10", "2025-03-17", "2025-03-24"];

test("un precio fechado en viernes cae en la semana del lunes correcto", () => {
  // 2025-03-21 es viernes; su lunes es 2025-03-17 (índice 2 del eje).
  assert.equal(mondayOf("2025-03-21"), "2025-03-17");
  const px = alignToAxis(axis, [{ date: "2025-03-21", close: 150 }], { mondayOf });
  assert.equal(px[2], 150);
  assert.equal(px[0], null, "sin precio antes de la primera barra disponible");
});

test("forward-fill: una semana sin barra hereda el último cierre", () => {
  const px = alignToAxis(axis, [
    { date: "2025-03-07", close: 100 }, // lunes 03-03 (idx 0)
    { date: "2025-03-21", close: 150 }, // lunes 03-17 (idx 2) — falta la 1
  ], { mondayOf });
  assert.deepEqual(px, [100, 100, 150, 150]);
});

test("forwardExcess replica (px fwd) - (bench fwd) y respeta nulos/borde", () => {
  const price = [100, 110, 120, 130];
  const bench = [100, 105, 110, 100];
  // h=2 desde idx 0: AAPL +20%, bench +10% => exceso +10%
  assert.ok(Math.abs(forwardExcess(price, bench, 0, 2) - 0.10) < 1e-9);
  assert.equal(forwardExcess(price, bench, 3, 2), null, "sin datos forward suficientes");
  assert.equal(forwardExcess([null, 110], [100, 105], 0, 1), null, "precio nulo => null");
});

test("dos series reales (AAPL + SPY) en el mismo eje dan un exceso coherente", () => {
  const aapl = alignToAxis(axis, [
    { date: "2025-03-03", close: 200 }, { date: "2025-03-24", close: 230 },
  ], { mondayOf });
  const spy = alignToAxis(axis, [
    { date: "2025-03-03", close: 500 }, { date: "2025-03-24", close: 525 },
  ], { mondayOf });
  // AAPL +15% vs SPY +5% en 3 semanas => exceso +10%
  assert.ok(Math.abs(forwardExcess(aapl, spy, 0, 3) - 0.10) < 1e-9);
});
