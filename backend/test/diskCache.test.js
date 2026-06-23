import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiskCache } from "../src/store/diskCache.js";

const freshDir = () => mkdtempSync(join(tmpdir(), "cache-"));

test("miss obtiene y persiste; hit fresco no vuelve a llamar al fetcher", async () => {
  let calls = 0;
  const c = createDiskCache({ dir: freshDir(), fetcher: async (k) => { calls++; return `v:${k}`; } });
  const a = await c.getOrFetch("INTC");
  assert.deepEqual([a.value, a.fromCache], ["v:INTC", false]);
  const b = await c.getOrFetch("INTC");
  assert.deepEqual([b.value, b.fromCache], ["v:INTC", true]);
  assert.equal(calls, 1, "el segundo get viene de caché");
});

test("persiste entre instancias sobre el mismo dir", async () => {
  const dir = freshDir();
  let calls = 0;
  const mk = () => createDiskCache({ dir, fetcher: async (k) => { calls++; return `v:${k}`; } });
  await mk().getOrFetch("AAPL");
  const second = await mk().getOrFetch("AAPL"); // instancia nueva, mismo dir
  assert.equal(second.fromCache, true);
  assert.equal(calls, 1);
});

test("expira por TTL con reloj inyectable y vuelve a obtener", async () => {
  let t = 1000, calls = 0;
  const c = createDiskCache({ dir: freshDir(), now: () => t, fetcher: async (k) => { calls++; return `v:${k}@${t}`; } });
  await c.getOrFetch("SPY", { maxAgeMs: 100 });
  t = 1050; const within = await c.getOrFetch("SPY", { maxAgeMs: 100 });
  assert.equal(within.fromCache, true);
  t = 1200; const after = await c.getOrFetch("SPY", { maxAgeMs: 100 });
  assert.equal(after.fromCache, false, "pasado el TTL, re-obtiene");
  assert.equal(calls, 2);
});

test("claves distintas son independientes", async () => {
  const c = createDiskCache({ dir: freshDir(), fetcher: async (k) => `v:${k}` });
  assert.equal((await c.getOrFetch("A")).value, "v:A");
  assert.equal((await c.getOrFetch("B")).value, "v:B");
  assert.equal((await c.getOrFetch("A")).fromCache, true);
});
