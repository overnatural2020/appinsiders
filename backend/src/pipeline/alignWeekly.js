// Alineación de series de precios a un eje SEMANAL de lunes (el mismo eje que
// produce el agregado de insiders) y cálculo de retorno en exceso forward.

// alignToAxis(axisMondays, series, { mondayOf })
//   axisMondays: arreglo de lunes ISO 'YYYY-MM-DD' (ascendente, contiguo).
//   series: precios crudos [{ date, close }] (diarios o semanales).
//   Mapea cada precio a su lunes (mondayOf) y hace FORWARD-FILL sobre el eje: cada
//   barra del eje hereda el último cierre conocido en o antes de esa semana. Antes
//   de la primera barra disponible el valor es null (no se inventa hacia atrás).
export function alignToAxis(axisMondays, series, { mondayOf }) {
  const pts = series
    .map((p) => ({ m: mondayOf(p.date), close: p.close }))
    .sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0));
  const px = new Array(axisMondays.length).fill(null);
  let j = 0, last = null;
  for (let i = 0; i < axisMondays.length; i++) {
    const A = axisMondays[i];
    while (j < pts.length && pts[j].m <= A) { last = pts[j].close; j++; } // consume <= A
    px[i] = last;
  }
  return px;
}

// forwardExcess(price, bench, wi, h)
// Retorno del activo a `h` semanas MENOS el del benchmark (exceso). DEBE coincidir
// exactamente con fwd() del frontend:
//   price[wi+h]/price[wi] - 1 - (bench[wi+h]/bench[wi] - 1)
// Devuelve null si no hay suficiente historia forward o si algún extremo es nulo.
export function forwardExcess(price, bench, wi, h) {
  if (!price || !bench) return null;
  if (wi + h >= price.length) return null;
  const p0 = price[wi], p1 = price[wi + h], b0 = bench[wi], b1 = bench[wi + h];
  if (p0 == null || p1 == null || b0 == null || b1 == null) return null;
  return p1 / p0 - 1 - (b1 / b0 - 1);
}
