import React, { useState } from "react";
import { login } from "./api";

const C = {
  bg: "#080B0F", panel: "#0F141A", line: "#1C2530",
  text: "#E6EDF3", mut: "#6B7785", ice: "#5AB0E6", sell: "#FF5C45",
};
const MONO = "ui-monospace,'SF Mono',Menlo,Monaco,monospace";
const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const user = await login(email.trim(), password);
      onLogin(user);
    } catch (e) {
      setErr(e.message || "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  const input = {
    width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`,
    borderRadius: 9, padding: "11px 12px", color: C.text, fontSize: 14, outline: "none", marginTop: 6,
  };

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, background: C.ice, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 650 }}>Anomalías de insiders</h1>
        </div>
        <p style={{ color: C.mut, fontSize: 13, margin: "6px 0 20px" }}>Inicia sesión para acceder a la herramienta.</p>

        <label style={{ fontSize: 12.5, color: C.mut }}>Correo
          <input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@overnatural.com" required />
        </label>
        <label style={{ fontSize: 12.5, color: C.mut, display: "block", marginTop: 14 }}>Contraseña
          <input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </label>

        {err && <div style={{ color: C.sell, fontSize: 12.5, marginTop: 14 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{
          width: "100%", marginTop: 20, background: C.ice, color: "#06222e", border: "none",
          borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1,
        }}>{busy ? "Entrando…" : "Entrar"}</button>

        <p style={{ color: C.mut, fontSize: 11, marginTop: 16, fontFamily: MONO, textAlign: "center" }}>
          Acceso solo para usuarios autorizados.
        </p>
      </form>
    </div>
  );
}
