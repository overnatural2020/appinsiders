import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseForm4 } from "../src/pipeline/form4Parser.js";
import { aggregateWeekly } from "../src/pipeline/aggregate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, "sample-form4.xml"), "utf8");

test("parseForm4 extrae las 3 operaciones con rol e info correctos", () => {
  const txns = parseForm4(xml);
  assert.equal(txns.length, 3);
  assert.equal(txns[0].ticker, "INTC");
  assert.equal(txns[0].role, "CEO");

  const buy = txns.find((t) => t.code === "P");
  assert.equal(buy.shares, 20000);
  assert.equal(buy.acquired, true);
  // holdPct = 20000 / (120000 - 20000) = 0.2
  assert.equal(Math.round(buy.holdPct * 100), 20);
  assert.equal(buy.is10b51, false, "la compra no referencia la nota 10b5-1");

  const sale = txns.find((t) => t.code === "S");
  assert.equal(sale.is10b51, true, "la venta referencia la nota al pie 10b5-1");
});

test("aggregateWeekly limpia: P cuenta, S queda excluida por 10b5-1, M excluida", () => {
  const txns = parseForm4(xml);
  const weeks = aggregateWeekly(txns);
  // las 3 operaciones caen en semanas de marzo 2026
  const totalBuy = weeks.reduce((s, w) => s + w.buyQ, 0);
  const totalSell = weeks.reduce((s, w) => s + w.sellQ, 0);
  const totalExcl = weeks.reduce((s, w) => s + w.excl, 0);

  assert.equal(totalBuy, 20000, "la compra P cuenta");
  assert.equal(totalSell, 0, "la venta S está bajo plan 10b5-1 -> excluida");
  assert.equal(totalExcl, 2, "S(10b5-1) y M(ejercicio) excluidas");

  const buyer = weeks.flatMap((w) => w.buyers)[0];
  assert.equal(buyer.role, "CEO");
});

test("mondayOf agrupa por semana lunes-inicio", () => {
  const txns = parseForm4(xml);
  const weeks = aggregateWeekly(txns);
  for (const w of weeks) {
    assert.match(w.ws, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(w.ws + "T00:00:00Z").getUTCDay(), 1, "ws debe ser lunes");
  }
});
