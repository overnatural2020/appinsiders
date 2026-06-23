// Caché en disco genérica: envuelve un `fetcher` y persiste cada resultado en un
// archivo JSON por clave, con TTL y reloj inyectable (testeable).
//
//   const c = createDiskCache({ dir, fetcher, now });
//   const { value, fromCache } = await c.getOrFetch(key, { maxAgeMs });
//
// - miss        -> llama al fetcher, persiste { value, ts: now() }, fromCache=false
// - hit fresco  -> lee de disco, no re-llama, fromCache=true
// - persiste entre instancias sobre el mismo `dir`
// - expira por TTL: si now()-ts > maxAgeMs, re-obtiene. Sin maxAgeMs => no expira.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Nombre de archivo seguro a partir de la clave (evita problemas de ruta).
const safe = (key) => encodeURIComponent(String(key)).replace(/[^a-zA-Z0-9._-]/g, "_");

export function createDiskCache({ dir, fetcher, now = Date.now } = {}) {
  if (!dir) throw new Error("createDiskCache requiere dir");
  if (typeof fetcher !== "function") throw new Error("createDiskCache requiere fetcher");
  mkdirSync(dir, { recursive: true });

  const fileFor = (key) => join(dir, safe(key) + ".json");

  async function getOrFetch(key, { maxAgeMs = Infinity } = {}) {
    const file = fileFor(key);
    if (existsSync(file)) {
      try {
        const { value, ts } = JSON.parse(readFileSync(file, "utf8"));
        if (now() - ts <= maxAgeMs) return { value, fromCache: true };
      } catch { /* archivo corrupto: se re-obtiene */ }
    }
    const value = await fetcher(key);
    writeFileSync(file, JSON.stringify({ value, ts: now() }));
    return { value, fromCache: false };
  }

  return { getOrFetch };
}
