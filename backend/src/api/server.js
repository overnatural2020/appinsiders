// API HTTP. Sirve los agregados semanales (motor del frontend) + auth, gestión de
// usuarios y configuración del scheduler de alertas.
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getWeekly, getPrices, listTickers } from "../store/jsonStore.js";
import {
  requireAuth, requireAdmin, ensureAdmin, issueToken,
  hashPassword, verifyPassword,
} from "../auth/auth.js";
import {
  listUsers, createUser, updateUser, deleteUser, findUserByEmail,
  publicUser, getSchedule, saveSchedule, alertRecipients,
} from "../store/usersStore.js";
import { runWeeklyInspection } from "../jobs/weeklyInspection.js";
import { startScheduler } from "../scripts/scheduler.js";
import { ingestTicker, cachePrices } from "../scripts/ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Carpeta del frontend compilado (build de Vite). En el contenedor se fija con
// FRONTEND_DIST; en local cae a ../../../frontend/dist.
const DIST = process.env.FRONTEND_DIST || path.resolve(__dirname, "../../../frontend/dist");

const app = express();
app.use(express.json());

// CORS (innecesario en mismo origen; útil si sirves el frontend aparte en dev).
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ----------------------------- AUTH ----------------------------- */
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email || "");
  if (!user || !(await verifyPassword(password || "", user.passwordHash))) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/* --------------------------- DATOS (login) ---------------------- */
app.get("/api/insiders", requireAuth, async (_req, res) => {
  res.json({ tickers: await listTickers() });
});

app.get("/api/market/:ticker", requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const data = await getPrices(ticker);
  if (!data) return res.status(404).json({ error: "sin precios para", ticker });
  res.json({ ticker, updatedAt: data.updatedAt, prices: data.prices });
});

app.get("/api/insiders/:ticker/weekly", requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const data = await getWeekly(ticker);
  if (!data) return res.status(404).json({ error: "ticker no ingerido", ticker });
  const limit = Number(req.query.weeks || 0);
  const weeks = limit > 0 ? data.weeks.slice(-limit) : data.weeks;
  res.json({ ticker, updatedAt: data.updatedAt, weeks });
});

/* --------------------------- ADMIN (admin) ---------------------- */
app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  res.json({ users: (await listUsers()).map(publicUser) });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { email, password, role = "viewer", alerts = true } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email y password requeridos" });
  if (String(password).length < 8) return res.status(400).json({ error: "la contraseña debe tener ≥ 8 caracteres" });
  try {
    const user = await createUser({ email, passwordHash: await hashPassword(password), role, alerts });
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { role, alerts, password } = req.body || {};
  const patch = {};
  if (role) patch.role = role;
  if (typeof alerts === "boolean") patch.alerts = alerts;
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: "la contraseña debe tener ≥ 8 caracteres" });
    patch.passwordHash = await hashPassword(password);
  }
  try {
    const user = await updateUser(req.params.id, patch);
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "no puedes eliminarte a ti mismo" });
  const ok = await deleteUser(req.params.id);
  res.json({ ok });
});

// Configuración del scheduler + destinatarios actuales.
app.get("/api/admin/schedule", requireAuth, requireAdmin, async (_req, res) => {
  res.json({ schedule: await getSchedule(), recipients: await alertRecipients() });
});

app.put("/api/admin/schedule", requireAuth, requireAdmin, async (req, res) => {
  const { enabled, cron, threshold, side } = req.body || {};
  const patch = {};
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (cron) patch.cron = cron;
  if (threshold != null) patch.threshold = Number(threshold);
  if (side) patch.side = side;
  res.json({ schedule: await saveSchedule(patch) });
});

// Ejecutar la inspección ahora (prueba). reingest=false por defecto (rápido).
app.post("/api/admin/schedule/run", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await runWeeklyInspection({ reingest: !!req.body?.reingest });
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --------------------- ingesta de tickers (background) ------------------- */
// Estado en memoria de la ingesta en curso (EDGAR es lento por el rate limit).
let ingestState = { running: false, total: 0, done: 0, current: null, startedAt: null, finishedAt: null, errors: [] };

async function runIngest(tickers, since) {
  ingestState = { running: true, total: tickers.length, done: 0, current: null, startedAt: new Date().toISOString(), finishedAt: null, errors: [] };
  try { await cachePrices(config.market.benchmark); } catch {}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const t of tickers) {
    ingestState.current = t;
    try { await ingestTicker(t, since); }
    catch (e) { ingestState.errors.push(`${t}: ${e.message}`); }
    ingestState.done++;
    await sleep(1500); // respiro entre tickers para no disparar el rate-limit
  }
  ingestState.running = false;
  ingestState.current = null;
  ingestState.finishedAt = new Date().toISOString();
  console.log(`[ingest] completo: ${ingestState.done}/${ingestState.total} (${ingestState.errors.length} errores)`);
}

// Lanza la ingesta de una lista de tickers (no bloquea: responde y sigue en bg).
app.post("/api/admin/ingest", requireAuth, requireAdmin, (req, res) => {
  if (ingestState.running) return res.status(409).json({ error: "ya hay una ingesta en curso", state: ingestState });
  const tickers = [...new Set((req.body?.tickers || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  if (!tickers.length) return res.status(400).json({ error: "lista de tickers vacía" });
  const since = req.body?.since || "2024-12-01";
  runIngest(tickers, since); // fire-and-forget
  res.json({ started: tickers.length });
});

app.get("/api/admin/ingest/status", requireAuth, requireAdmin, (_req, res) => res.json(ingestState));

// Diagnóstico (sin secretos): qué proveedor de precios está activo.
app.get("/api/admin/diag", requireAuth, requireAdmin, (_req, res) => res.json({
  priceProvider: config.market.provider,
  tiingoKeyPresent: !!config.market.tiingoKey,
  tiingoKeyLen: (config.market.tiingoKey || "").length,
  benchmark: config.market.benchmark,
  dataDir: config.dataDir,
  lastPriceError: globalThis.__lastPriceError || null,
}));

/* ----------------- frontend compilado (SPA, mismo origen) --------------- */
// Sirve los estáticos del build de Vite y hace fallback a index.html para las
// rutas del cliente. Se monta DESPUÉS de las rutas /api.
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST, "index.html"));
  });
  console.log(`[server] sirviendo frontend desde ${DIST}`);
} else {
  app.get("/", (_req, res) => res.type("html").send(
    `<h1>Insider Anomaly API</h1><p>API activa. El frontend compilado no se encontró en ${DIST}.</p>`
  ));
}

// Bootstrap opcional: si el store está vacío y SEED_TICKERS está definido, ingiere
// esos tickers la primera vez (útil en Railway con volumen recién creado).
async function bootstrapIngest() {
  const seed = (process.env.SEED_TICKERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!seed.length) return;
  if ((await listTickers()).length) return; // ya hay datos
  console.log(`[bootstrap] ingiriendo ${seed.length} tickers iniciales…`);
  try { await cachePrices(config.market.benchmark); } catch {}
  const since = process.env.SEED_SINCE || "2024-12-01";
  for (const t of seed) {
    try { await ingestTicker(t, since); }
    catch (e) { console.warn(`[bootstrap] ${t}: ${e.message}`); }
  }
  console.log("[bootstrap] ingesta inicial completa");
}

await ensureAdmin();
app.listen(config.port, () => {
  console.log(`API en http://localhost:${config.port}`);
  // Scheduler de alertas embebido (un solo servicio). Desactiva con RUN_SCHEDULER=false.
  if (process.env.RUN_SCHEDULER !== "false") startScheduler();
  // Ingesta inicial en segundo plano (no bloquea el arranque).
  bootstrapIngest().catch((e) => console.warn(`[bootstrap] ${e.message}`));
});
