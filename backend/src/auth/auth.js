// Autenticación: hashing de contraseñas (bcrypt), emisión/validación de JWT y
// middlewares de Express. El admin inicial se siembra al arrancar si no hay nadie.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { listUsers, createUser, updateUser, findUserById, findUserByEmail } from "../store/usersStore.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function bearer(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

// Requiere sesión válida. Carga el usuario actual en req.user.
export async function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "Falta token" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Usuario inexistente" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// Requiere rol admin (usar después de requireAuth).
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Requiere rol admin" });
  next();
}

// Crea el admin inicial si la base de usuarios está vacía.
export async function seedAdminIfEmpty() {
  const users = await listUsers();
  if (users.length) return;
  const { email, password } = config.seedAdmin;
  await createUser({ email, passwordHash: await hashPassword(password), role: "admin", alerts: true });
  console.log(`[auth] Admin inicial creado: ${email} (cámbialo cuanto antes)`);
}

// Arranque: siembra el admin si no hay nadie y, si ADMIN_RESET=true, FUERZA el
// admin a las credenciales de entorno (recuperación de acceso). Quita la variable
// después de usarla.
export async function ensureAdmin() {
  await seedAdminIfEmpty();
  if (process.env.ADMIN_RESET !== "true") return;
  const { email, password } = config.seedAdmin;
  const passwordHash = await hashPassword(password);
  const existing = await findUserByEmail(email);
  if (existing) {
    await updateUser(existing.id, { passwordHash, role: "admin" });
    console.log(`[auth] ADMIN_RESET: contraseña/rol de ${email} restablecidos`);
  } else {
    await createUser({ email, passwordHash, role: "admin", alerts: true });
    console.log(`[auth] ADMIN_RESET: admin ${email} creado`);
  }
}
