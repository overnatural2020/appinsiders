import { test } from "node:test";
import assert from "node:assert/strict";
import { getWeeklyPrices, computeMomentum } from "../src/market/prices.js";

// Serie con un solo mínimo: baja y luego sube => exactamente un cruce al alza.
const closes = [20,18,16,14,12,10,9,8,9,11,13,15,17,19,21,23];
const series = closes.map((c, i) => ({ date: `2025-W${String(i+1).padStart(2,"0")}`, close: c }));
const fetcher = async () => series;
const OPTS = { shortWin: 3, longWin: 5 };

test("calcula MA corta y larga con sus ventanas; null si falta historia", async () => {
  const r = await getWeeklyPrices("TEST", { fetcher, ...OPTS });
  assert.equal(r[0].ma200, null, "sin historia suficiente, MA larga es null");
  assert.equal(r[1].ma50, null, "MA corta (win 3) null en índice 1");
  assert.equal(r[2].ma50, (20+18+16)/3, "MA corta correcta cuando hay ventana");
  assert.equal(r[4].ma200, (20+18+16+14+12)/5, "MA larga correcta en índice 4");
});

test("trendTurnedUp se enciende EXACTAMENTE una vez, en el cruce al alza", async () => {
  const r = await getWeeklyPrices("TEST", { fetcher, ...OPTS });
  const ups = r.filter((x) => x.trendTurnedUp);
  assert.equal(ups.length, 1, "un solo cruce en esta serie");
  const idx = r.findIndex((x) => x.trendTurnedUp);
  assert.ok(r[idx].ma50 > r[idx].ma200, "en el cruce, corta por encima de larga");
  const prev = r.slice(0, idx).reverse().find((x) => x.ma50 != null && x.ma200 != null);
  assert.ok(prev.ma50 <= prev.ma200, "antes del cruce, corta <= larga");
});

test("aboveMA refleja la posición del precio en el tramo alcista", async () => {
  const r = await getWeeklyPrices("TEST", { fetcher, ...OPTS });
  const last = r[r.length - 1];
  assert.equal(last.aboveMA50, true);
  assert.equal(last.aboveMA200, true);
});

test("no truena con historia insuficiente para la MA larga", () => {
  const short = computeMomentum(series.slice(0, 3), OPTS);
  assert.equal(short.length, 3);
  assert.equal(short[2].ma200, null);
  assert.equal(short[2].trendTurnedUp, false);
});
