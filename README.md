# Insider Anomaly Scanner

Detector de anomalías de compra/venta de insiders (SEC EDGAR Form 4) con backend
de datos reales, panel administrativo y alertas semanales por correo.

> **Ubicación:** este proyecto vive en `/Users/charli2401/Downloads/appInsiders`
> (disco local). **No** ejecutarlo desde OneDrive: Node se cuelga al leer los
> módulos porque OneDrive deja archivos "solo en la nube".

## Estructura

```
backend/    Node + Express. EDGAR/Form 4, precios (Yahoo), detección, auth (JWT),
            usuarios, scheduler de alertas, correo (Resend).
frontend/   React + Vite. Scanner, login y panel de administración.
```

## Requisitos

- Node.js ≥ 18
- `SEC_USER_AGENT` con tu nombre/empresa y email (lo exige la SEC para EDGAR).

## Arranque (desarrollo)

```bash
# 1) Backend (API en http://localhost:8080)
cd /Users/charli2401/Downloads/appInsiders/backend
npm install
SEC_USER_AGENT="appInsiders tu-email@dominio.com" npm start

# 2) Frontend (http://localhost:5173)
cd /Users/charli2401/Downloads/appInsiders/frontend
npm install
npm run dev

# 3) Scheduler de alertas (proceso aparte, mantener vivo)
cd /Users/charli2401/Downloads/appInsiders/backend
npm run scheduler            # corre la inspección al inicio de cada semana
# npm run scheduler -- --now # fuerza una corrida inmediata
```

## Ingesta de datos (Form 4 + precios)

```bash
cd /Users/charli2401/Downloads/appInsiders/backend
SEC_USER_AGENT="appInsiders tu-email@dominio.com" \
  node src/scripts/ingest.js --tickers AMBA,CRDO,ALAB,TER,INTC --since 2024-12-01
```

Cachea Form 4 (semanal), transacciones y precios diarios por ticker + el
benchmark (SPY). El frontend superpone estos datos reales sobre el catálogo.

## Variables de entorno (backend)

| Variable | Para qué | Por defecto |
|---|---|---|
| `SEC_USER_AGENT` | Requerido por EDGAR | (avisa si falta) |
| `JWT_SECRET` | Firma de tokens de sesión | dev inseguro — **cámbialo en producción** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin inicial (solo si no hay usuarios) | `admin@overnatural.com` / `changeme123` |
| `RESEND_API_KEY` | Envío real de correo | vacío → **modo simulado** (log en consola) |
| `EMAIL_FROM` | Remitente | `Insider Alerts <onboarding@resend.dev>` |
| `APP_URL` | Destino del botón del correo | `https://overnatural.com` |
| `INSPECT_CRON` | Cron del scheduler | `0 7 * * 1` (lunes 07:00 UTC) |
| `PORT` / `DATA_DIR` | Puerto / carpeta de datos | `8080` / `./data` |

### Correo real con Resend

1. Crea cuenta en https://resend.com, verifica tu dominio (overnatural.com) y
   genera una API key (`re_...`).
2. Arranca el backend (y el scheduler) con:
   ```bash
   RESEND_API_KEY=re_xxxxx \
   EMAIL_FROM="Insider Alerts <alertas@overnatural.com>" \
   SEC_USER_AGENT="appInsiders tu-email@dominio.com" npm start
   ```
   Sin `RESEND_API_KEY` todo funciona, pero el correo solo se imprime en consola.

## Acceso y panel admin

- Entra con el admin inicial (`admin@overnatural.com` / `changeme123`) y **cámbialo**.
- Botón **⚙ Admin** → crear usuarios (admin/viewer, opt-in de alertas) y configurar
  la alerta semanal (cron, señal, sensibilidad, ejecutar ahora).
- La alerta se envía a **todos los usuarios con alertas activas**: si no hay
  anomalías, avisa la semana revisada; si las hay, lista las detectadas con un
  botón a `APP_URL`.

## API (resumen)

- `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/insiders` · `GET /api/insiders/:t/weekly` · `GET /api/market/:t`  (requieren login)
- `GET/POST/PATCH/DELETE /api/admin/users` · `GET/PUT /api/admin/schedule` · `POST /api/admin/schedule/run`  (requieren admin)

## El motor (frontend)

Solo cuenta compras **P** y ventas **S** a mercado abierto, sin 10b5-1. Detecta
por **semana cerrada** (z-score vs. base de 52 semanas), puntúa convicción
(magnitud, amplitud, rol, % de posición, oportunista), valida con backtest de
retornos forward vs. benchmark y resume en un veredicto semáforo. Los tickers
ingeridos se muestran con datos reales (EDGAR + precios); el resto del catálogo
es sintético.

## Notas

- El preview (Claude) está anclado a la antigua raíz de OneDrive; por eso hay
  symlinks `frontend`/`backend` allí apuntando a esta carpeta. En tu uso normal
  trabaja directo en `/Users/charli2401/Downloads/appInsiders`.
- Esto no es asesoría de inversión.
