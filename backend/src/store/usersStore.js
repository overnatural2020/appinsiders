// Persistencia de usuarios y de la configuración del scheduler en archivos JSON
// (misma filosofía que jsonStore: simple para arrancar, swap a Postgres después).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const dir = config.dataDir;
const usersFile = join(dir, "users.json");
const scheduleFile = join(dir, "schedule.json");

async function ensureDir() { await mkdir(dir, { recursive: true }); }

async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJSON(file, data) {
  await ensureDir();
  await writeFile(file, JSON.stringify(data, null, 2));
}

// ---- usuarios ----
// user = { id, email, passwordHash, role: 'admin'|'viewer', alerts: bool, createdAt }
export async function listUsers() {
  return readJSON(usersFile, []);
}
export async function findUserByEmail(email) {
  const users = await listUsers();
  return users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}
export async function findUserById(id) {
  const users = await listUsers();
  return users.find((u) => u.id === id) || null;
}
export async function createUser({ email, passwordHash, role = "viewer", alerts = true }) {
  const users = await listUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("Ya existe un usuario con ese correo");
  }
  const user = { id: randomUUID(), email, passwordHash, role, alerts, createdAt: new Date().toISOString() };
  users.push(user);
  await writeJSON(usersFile, users);
  return user;
}
export async function updateUser(id, patch) {
  const users = await listUsers();
  const i = users.findIndex((u) => u.id === id);
  if (i === -1) throw new Error("Usuario no encontrado");
  users[i] = { ...users[i], ...patch, id: users[i].id }; // id inmutable
  await writeJSON(usersFile, users);
  return users[i];
}
export async function deleteUser(id) {
  const users = await listUsers();
  const next = users.filter((u) => u.id !== id);
  await writeJSON(usersFile, next);
  return users.length !== next.length;
}

// Usuarios que reciben alertas (activos con alerts=true).
export async function alertRecipients() {
  return (await listUsers()).filter((u) => u.alerts).map((u) => u.email);
}

// Quita el hash antes de exponer por API.
export const publicUser = (u) => u && ({ id: u.id, email: u.email, role: u.role, alerts: u.alerts, createdAt: u.createdAt });

// ---- configuración del scheduler ----
const DEFAULT_SCHEDULE = {
  enabled: true,
  cron: config.schedule.cron,
  threshold: 2.5,       // z mínimo
  side: "buy",          // buy | sell | both
  lastRun: null,        // { at, week, anomalies, recipients, ok }
};
export async function getSchedule() {
  return { ...DEFAULT_SCHEDULE, ...(await readJSON(scheduleFile, {})) };
}
export async function saveSchedule(patch) {
  const cur = await getSchedule();
  const next = { ...cur, ...patch };
  await writeJSON(scheduleFile, next);
  return next;
}
