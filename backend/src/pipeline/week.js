// Semana con inicio en LUNES (UTC), igual que el frontend (START = lunes).
// Devuelve la fecha 'YYYY-MM-DD' del lunes de la semana de `iso`.
export function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=domingo..6=sábado
  const back = (dow + 6) % 7; // días hasta el lunes
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export const ymOf = (iso) => iso.slice(0, 7); // 'YYYY-MM'
