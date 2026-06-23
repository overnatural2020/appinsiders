import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse13F } from "../src/edgar/form13.js";

// Este test ES la especificación de parse13F. Code debe implementar
// backend/src/edgar/form13.js para que estas aserciones pasen.
const xml = readFileSync(new URL("./sample-13f.xml", import.meta.url), "utf8");

test("parse13F extrae las posiciones de la information table", () => {
  const holdings = parse13F(xml);
  assert.equal(holdings.length, 3, "deben salir 3 posiciones");
});

test("parse13F mapea los campos de cada posición", () => {
  const holdings = parse13F(xml);
  const intc = holdings.find((h) => h.cusip === "458140100");
  assert.ok(intc, "debe encontrar INTC por CUSIP");
  assert.equal(intc.shares, 500000);
  assert.equal(typeof intc.shares, "number", "shares debe ser número");
  assert.equal(intc.sshType, "SH");
  assert.match(intc.nameOfIssuer.toUpperCase(), /INTEL/);
  assert.equal(intc.discretion, "SOLE");
});

test("parse13F preserva el cero inicial del CUSIP (no lo convierte a número)", () => {
  const holdings = parse13F(xml);
  // Apple es 037833100. Si el parser coacciona a número se vuelve 37833100 y
  // rompe el mapa CUSIP->ticker. Usar parseTagValue:false en fast-xml-parser.
  const aapl = holdings.find((h) => /APPLE/i.test(h.nameOfIssuer));
  assert.ok(aapl, "debe encontrar APPLE");
  assert.equal(aapl.cusip, "037833100", "el CUSIP debe conservar el 0 inicial");
});

test("parse13F maneja un info table con una sola posición (no array)", () => {
  // fast-xml-parser devuelve objeto (no array) cuando hay un solo <infoTable>.
  // parse13F debe normalizar a array siempre.
  const single = xml.replace(
    /<infoTable>[\s\S]*?<\/infoTable>\s*<infoTable>[\s\S]*$/,
    `<infoTable>
        <nameOfIssuer>INTEL CORP</nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>458140100</cusip>
        <value>67080000</value>
        <shrsOrPrnAmt><sshPrnamt>500000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
        <investmentDiscretion>SOLE</investmentDiscretion>
      </infoTable>
    </informationTable>`
  );
  const holdings = parse13F(single);
  assert.equal(Array.isArray(holdings), true);
  assert.equal(holdings.length, 1);
});
