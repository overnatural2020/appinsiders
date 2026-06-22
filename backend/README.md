# Insider Anomaly — Backend (EDGAR Form 4)

Primera rebanada del backend que reemplaza los datos sintéticos del prototipo por
operaciones reales de insiders descargadas de **SEC EDGAR (Form 4)**, parseadas,
limpiadas y agregadas por semana en el mismo formato que ya consume el motor del
frontend.

## Qué hace hoy

```
ticker → CIK → lista de Form 4 → XML → parse → limpieza/clasificación → agregado semanal → API
```

- **Ingesta por universo**: descargas los Form 4 de los tickers que tú definas.
- **Parseo del XML de propiedad**: extrae código de transacción, rol del insider
  (CEO/CFO/director/10%/otro), acciones, precio, posición tras la operación y el
  % de incremento sobre su tenencia previa.
- **Limpieza** (lo que ya decidimos en la herramienta): solo cuenta **P** (compra
  a mercado abierto) y **S** (venta), excluye A/M/F/G, y **detecta planes 10b5-1
  por transacción** (vía notas al pie referenciadas o el flag de documento) y los
  excluye.
- **Clasificación rutinario vs oportunista** en una pasada sobre el historial del
  insider (heurística Cohen-Malloy-Pomorski simplificada).
- **API** que sirve los agregados semanales con el shape exacto del motor.

## Requisitos

- Node.js ≥ 18 (usa `fetch` nativo).
- **User-Agent de la SEC**: EDGAR EXIGE un `User-Agent` con tu nombre/empresa y
  email. Sin él, te bloquea. Configúralo en `.env` (ver `.env.example`).
- Respeta el límite de ~10 req/s (ya está el limitador a ~7.7/s).

## Uso

```bash
npm install
cp .env.example .env        # edita SEC_USER_AGENT con tu email real
npm test                    # verifica el parser/agregación (offline, sin red)

# Ingesta (necesita red hacia sec.gov / data.sec.gov):
node src/scripts/ingest.js --tickers INTC,NVDA,AMBA,CRDO --since 2025-01-01

# Servir la API:
npm start                   # http://localhost:8080
```

Endpoints:
- `GET /api/health`
- `GET /api/insiders` → tickers ingeridos
- `GET /api/insiders/:ticker/weekly?weeks=52` → `{ ticker, weeks: [...] }`

## Contrato de datos (lo que espera el frontend)

Cada semana:
```js
{ ws: "2026-03-09", ym: "2026-03",
  buyQ: 20000, sellQ: 0,
  buyers: [{ role: "CEO", opp: true, holdPct: 0.2, shares: 20000, ownerCik: "..." }],
  sellers: [],
  raw: 3, excl: 2 }
```

## Integración con el frontend

En el artifact, reemplaza `generateDataset()` por llamadas a la API:

```js
async function loadTicker(sym) {
  const r = await fetch(`${API}/api/insiders/${sym}/weekly?weeks=92`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { weeks } = await r.json();
  return weeks; // mismo shape que ya usa scan()/backtest()
}
```

El motor (`scan`, `backtest`, `conviction`, `regimeAt`, veredicto) **no cambia**.

## Lo que falta (siguientes rebanadas)

1. **Histórico largo**: `listForm4Filings` solo lee `filings.recent`. Para > ~1 año
   hay que recorrer también `filings.files[]` (páginas) de la submissions API.
2. **Metadatos del universo** (mcap, liquidez, precio, ingresos, sector) — no vienen
   en el Form 4:
   - Ingresos y acciones en circulación → **XBRL company facts** de la SEC
     (`data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`).
   - Precio y volumen → API de mercado (Alpha Vantage / similar).
   - Sector → mapear el SIC del submissions o un proveedor de GICS.
3. **`price[]` / benchmark** para los retornos forward → serie de precios del ticker
   y del benchmark sectorial (API de mercado).
4. **Auth JWT**: conectar `requireAuth` a tu middleware del portal.
5. **Almacenamiento**: el `jsonStore` es para arrancar. Producción → Postgres
   (DigitalOcean Managed DB) con la misma interfaz.
6. **Scheduler**: re-ingesta diaria (cron) para captar filings nuevos y rellenar la
   semana en curso conforme llegan los rezagados.

## Estructura

```
src/
  config.js            # User-Agent, rate limit, códigos que cuentan
  edgar/client.js      # HTTP a EDGAR (throttle, ticker→CIK, submissions, XML)
  pipeline/
    classify.js        # rol, 10b5-1 (doc/footnote)
    form4Parser.js     # XML → transacciones normalizadas
    aggregate.js       # transacciones → semanas + oportunista
    week.js            # semana lunes-inicio (igual que el frontend)
  store/jsonStore.js   # persistencia (swap → Postgres)
  api/server.js        # Express
  scripts/ingest.js    # CLI de ingesta
test/                  # parser + agregación (offline)
```

*Esto no es asesoría de inversión.*
