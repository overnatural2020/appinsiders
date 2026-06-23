import { test } from "node:test";
import assert from "node:assert/strict";
import { MANAGERS, MANAGER_TYPES } from "../src/config/managers.js";

// Validación OFFLINE de la config de gestores (no toca la red). Confirma que la
// lista está bien formada; la veracidad de cada CIK contra EDGAR se verificó al
// construir la config.

test("hay un universo razonable de gestores", () => {
  assert.ok(MANAGERS.length >= 45, `se esperaban ~50 gestores, hay ${MANAGERS.length}`);
});

test("todos los CIK son strings de 10 dígitos (con ceros a la izquierda)", () => {
  for (const m of MANAGERS) {
    assert.equal(typeof m.cik, "string", `${m.name}: cik debe ser string`);
    assert.match(m.cik, /^\d{10}$/, `${m.name}: cik "${m.cik}" debe tener 10 dígitos`);
  }
});

test("no hay CIK duplicados", () => {
  const ciks = MANAGERS.map((m) => m.cik);
  const dupes = ciks.filter((c, i) => ciks.indexOf(c) !== i);
  assert.deepEqual([...new Set(dupes)], [], `CIK duplicados: ${[...new Set(dupes)].join(", ")}`);
  assert.equal(new Set(ciks).size, MANAGERS.length);
});

test("todo gestor tiene un type válido", () => {
  for (const m of MANAGERS) {
    assert.ok(MANAGER_TYPES.includes(m.type), `${m.name}: type "${m.type}" inválido`);
    assert.ok(m.name && typeof m.name === "string", `${m.cik}: falta name`);
  }
});

test("hay ~40 activos y ~10 institucionales", () => {
  const activos = MANAGERS.filter((m) => m.type === "activo").length;
  const inst = MANAGERS.filter((m) => m.type === "institucional").length;
  assert.ok(activos >= 35, `activos: ${activos}`);
  assert.ok(inst >= 8, `institucionales: ${inst}`);
});
