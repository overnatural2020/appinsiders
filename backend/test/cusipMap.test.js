import { test } from "node:test";
import assert from "node:assert/strict";
import { createCusipMapper } from "../src/market/cusipMap.js";

// Respuestas falsas con forma OpenFIGI v3 (data[] por instrumento, o warning).
const FIGI = {
  "037833100": { data: [
    { ticker: "APC", name: "APPLE INC", exchCode: "GF", marketSector: "Equity" },
    { ticker: "AAPL", name: "APPLE INC", exchCode: "US", marketSector: "Equity" },
  ]},
  "458140100": { data: [{ ticker: "INTC", name: "INTEL CORP", exchCode: "US", marketSector: "Equity" }]},
  "67066G104": { data: [{ ticker: "NVDA", name: "NVIDIA CORP", exchCode: "US", marketSector: "Equity" }]},
};
function makeFetcher() {
  const calls = [];
  const fetcher = async (batch) => {
    calls.push([...batch]);
    return batch.map((c) => FIGI[c] || { warning: "No identifier found." });
  };
  return { fetcher, calls };
}

test("mapea CUSIP conocido a su ticker y prefiere el listado US", async () => {
  const { fetcher } = makeFetcher();
  const m = createCusipMapper({ fetcher });
  const { map, unmatched } = await m.mapCusips(["037833100"]);
  assert.equal(map.get("037833100").ticker, "AAPL"); // no APC (GF)
  assert.equal(unmatched.length, 0);
});

test("un CUSIP sin match va a 'unmatched', no al map", async () => {
  const { fetcher } = makeFetcher();
  const m = createCusipMapper({ fetcher });
  const { map, unmatched } = await m.mapCusips(["999999999"]);
  assert.equal(map.has("999999999"), false);
  assert.deepEqual(unmatched, ["999999999"]);
});

test("cachea positivos y negativos: no vuelve a consultar el fetcher", async () => {
  const { fetcher, calls } = makeFetcher();
  const m = createCusipMapper({ fetcher });
  await m.mapCusips(["458140100", "999999999"]);
  const before = calls.length;
  await m.mapCusips(["458140100", "999999999"]); // todo desde caché
  assert.equal(calls.length, before, "no debe llamar de nuevo al fetcher");
});

test("deduplica y agrupa en lotes según batchSize", async () => {
  const { fetcher, calls } = makeFetcher();
  const m = createCusipMapper({ fetcher, batchSize: 2 });
  // 3 únicos (+1 duplicado) con batchSize 2 => 2 lotes (2 y 1)
  await m.mapCusips(["037833100", "458140100", "67066G104", "037833100"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((b) => b.length), [2, 1]);
});
