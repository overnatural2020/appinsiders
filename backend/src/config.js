// Configuración central. La SEC EXIGE un User-Agent identificable con email de
// contacto; sin él, EDGAR bloquea las peticiones. Y limita a ~10 req/s.
import "node:process";

export const config = {
  // OBLIGATORIO: pon tu nombre/empresa y email reales (regla de fair-access de la SEC).
  // p.ej. "Overnatural LLC carlos@cozydropco.com"
  userAgent: process.env.SEC_USER_AGENT || "CHANGE_ME Contacto your-email@example.com",

  edgar: {
    // Datos estructurados (JSON)
    dataBase: "https://data.sec.gov",
    // Archivos de filings
    archivesBase: "https://www.sec.gov/Archives",
    // Mapa ticker -> CIK
    tickerMapUrl: "https://www.sec.gov/files/company_tickers.json",
  },

  // Limitador: intervalo mínimo entre peticiones (ms). 130ms ≈ 7.7 req/s (< 10).
  minRequestIntervalMs: Number(process.env.SEC_MIN_INTERVAL_MS || 130),

  // Códigos de transacción de Form 4 que cuentan como señal "limpia".
  // Solo P (compra a mercado abierto) y S (venta a mercado abierto). Se excluyen
  // A (grant), M (ejercicio de opción), F (retención fiscal), G (regalo), etc.
  qualifyingBuyCodes: ["P"],
  qualifyingSellCodes: ["S"],

  port: Number(process.env.PORT || 8080),
  dataDir: process.env.DATA_DIR || "./data",

  // Datos de mercado (precios para los retornos forward y el régimen).
  market: {
    // Con TIINGO_API_KEY usa Tiingo (fiable desde datacenter); si no, Yahoo.
    provider: process.env.MARKET_PROVIDER || (process.env.TIINGO_API_KEY ? "tiingo" : "yahoo"),
    tiingoKey: process.env.TIINGO_API_KEY || "",
    benchmark: process.env.MARKET_BENCHMARK || "SPY",
  },

  // ---- Auth ----
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-cambia-esto",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30d",
  // Admin inicial: se crea al arrancar si no existe ningún usuario.
  seedAdmin: {
    email: process.env.ADMIN_EMAIL || "admin@overnatural.com",
    password: process.env.ADMIN_PASSWORD || "changeme123",
  },

  // ---- Correo (Resend) ----
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "", // vacío → modo simulado (log en consola)
    from: process.env.EMAIL_FROM || "Insider Alerts <onboarding@resend.dev>",
    appUrl: process.env.APP_URL || "https://overnatural.com",
  },

  // ---- Inspección semanal / scheduler ----
  schedule: {
    // Lunes 07:00 UTC: principio de semana (la semana recién cerrada ya venció).
    cron: process.env.INSPECT_CRON || "0 7 * * 1",
    // Re-ingerir los tickers conocidos antes de inspeccionar (capta filings nuevos).
    reingestLookbackDays: Number(process.env.INSPECT_LOOKBACK_DAYS || 21),
  },
};

if (config.userAgent.startsWith("CHANGE_ME")) {
  console.warn(
    "[config] ⚠  Define SEC_USER_AGENT con tu nombre y email reales, o EDGAR rechazará las peticiones."
  );
}
