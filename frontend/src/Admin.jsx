import React, { useEffect, useState } from "react";
import {
  adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser,
  adminGetSchedule, adminSaveSchedule, adminRunInspection,
} from "./api";

const C = {
  bg: "#080B0F", panel: "#0F141A", panelHi: "#131A22", line: "#1C2530",
  text: "#E6EDF3", mut: "#6B7785", buy: "#2EE6A6", sell: "#FF5C45", ice: "#5AB0E6", amber: "#F4B740",
};
const MONO = "ui-monospace,'SF Mono',Menlo,Monaco,monospace";
const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";

const Panel = ({ children, pad = 18 }) => <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: pad, marginBottom: 16 }}>{children}</div>;
const H2 = ({ children, right }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 2px 12px" }}><h2 style={{ margin: 0, fontSize: 13, color: C.mut, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{children}</h2>{right}</div>;
const input = { background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, outline: "none" };
const btn = (bg, fg = "#06222e") => ({ background: bg, color: fg, border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" });

export default function Admin({ me, onClose }) {
  const [users, setUsers] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", role: "viewer", alerts: true });
  const [runResult, setRunResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (t, kind = "ok") => { setMsg({ t, kind }); setTimeout(() => setMsg(null), 3500); };

  const load = async () => {
    try {
      const [u, s] = await Promise.all([adminListUsers(), adminGetSchedule()]);
      setUsers(u); setSchedule(s.schedule); setRecipients(s.recipients);
    } catch (e) { flash(e.message, "err"); }
  };
  useEffect(() => { load(); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await adminCreateUser(form);
      setForm({ email: "", password: "", role: "viewer", alerts: true });
      flash("Usuario creado");
      load();
    } catch (e) { flash(e.message, "err"); }
  };
  const patchUser = async (id, patch) => {
    try { await adminUpdateUser(id, patch); load(); }
    catch (e) { flash(e.message, "err"); }
  };
  const removeUser = async (id, email) => {
    if (!confirm(`¿Eliminar a ${email}?`)) return;
    try { await adminDeleteUser(id); flash("Usuario eliminado"); load(); }
    catch (e) { flash(e.message, "err"); }
  };

  const saveSchedule = async (patch) => {
    try { const s = await adminSaveSchedule(patch); setSchedule(s); flash("Programación guardada"); load(); }
    catch (e) { flash(e.message, "err"); }
  };
  const runNow = async (reingest) => {
    setBusy(true); setRunResult(null);
    try { const r = await adminRunInspection(reingest); setRunResult(r); flash("Inspección ejecutada"); load(); }
    catch (e) { flash(e.message, "err"); }
    finally { setBusy(false); }
  };

  if (!schedule) return <div style={{ fontFamily: SANS, background: C.bg, color: C.mut, minHeight: "100vh", padding: 40 }}>Cargando panel…</div>;

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: "100vh", padding: "18px 16px 44px", maxWidth: 760, margin: "0 auto" }}>
      <style>{`button{font-family:inherit} input,select{font-family:inherit}`}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ width: 8, height: 8, background: C.amber, borderRadius: 2 }} />
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Panel de administración</h1>
        <button onClick={onClose} style={{ ...btn(C.panelHi, C.text), marginLeft: "auto", border: `1px solid ${C.line}` }}>← Volver a la herramienta</button>
      </div>

      {msg && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, fontSize: 13, background: (msg.kind === "err" ? C.sell : C.buy) + "1A", color: msg.kind === "err" ? C.sell : C.buy, border: `1px solid ${(msg.kind === "err" ? C.sell : C.buy)}55` }}>{msg.t}</div>}

      {/* ---------- USUARIOS ---------- */}
      <H2 right={<span style={{ fontFamily: MONO, fontSize: 12, color: C.mut }}>{users.length}</span>}>Usuarios</H2>
      <Panel>
        <form onSubmit={createUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <input style={input} type="email" placeholder="correo@overnatural.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input style={input} type="text" placeholder="contraseña (≥ 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">Viewer (solo ver)</option>
            <option value="admin">Admin</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.mut }}>
            <input type="checkbox" checked={form.alerts} onChange={(e) => setForm({ ...form, alerts: e.target.checked })} /> Recibe alertas
          </label>
          <button type="submit" style={{ ...btn(C.ice), gridColumn: "1 / -1" }}>+ Crear usuario</button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}{u.id === me.id && <span style={{ color: C.mut, fontWeight: 400 }}> · tú</span>}</div>
                <div style={{ fontSize: 11, color: C.mut, fontFamily: MONO }}>{u.role}</div>
              </div>
              <select value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })} style={{ ...input, padding: "5px 7px", fontSize: 12 }}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.mut }}>
                <input type="checkbox" checked={u.alerts} onChange={(e) => patchUser(u.id, { alerts: e.target.checked })} /> alertas
              </label>
              {u.id !== me.id && <button onClick={() => removeUser(u.id, u.email)} style={{ ...btn("transparent", C.sell), border: `1px solid ${C.sell}55`, padding: "5px 9px" }}>Eliminar</button>}
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------- ALERTAS / SCHEDULER ---------- */}
      <H2>Alerta semanal por correo</H2>
      <Panel>
        <Row label="Activar inspección automática">
          <Toggle on={schedule.enabled} onClick={() => saveSchedule({ enabled: !schedule.enabled })} />
        </Row>
        <Row label="Programación (cron, UTC)">
          <input style={{ ...input, width: 150, fontFamily: MONO, textAlign: "center" }} value={schedule.cron} onChange={(e) => setSchedule({ ...schedule, cron: e.target.value })} onBlur={(e) => saveSchedule({ cron: e.target.value })} />
        </Row>
        <Row label="Señal a vigilar">
          <select style={input} value={schedule.side} onChange={(e) => saveSchedule({ side: e.target.value })}>
            <option value="buy">Compras</option>
            <option value="sell">Ventas</option>
            <option value="both">Ambas</option>
          </select>
        </Row>
        <Row label="Sensibilidad (z mínimo)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={1.5} max={4} step={0.5} value={schedule.threshold} onChange={(e) => setSchedule({ ...schedule, threshold: +e.target.value })} onMouseUp={(e) => saveSchedule({ threshold: +e.target.value })} style={{ width: 130, accentColor: C.ice }} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ice, minWidth: 58 }}>z ≥ {Number(schedule.threshold).toFixed(1)}</span>
          </div>
        </Row>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.mut }}>
          Destinatarios actuales ({recipients.length}): <span style={{ color: C.text }}>{recipients.join(", ") || "ninguno"}</span>
        </div>
        {schedule.lastRun && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.mut }}>
            Última corrida: <span style={{ color: C.text, fontFamily: MONO }}>{new Date(schedule.lastRun.at).toLocaleString("es")}</span> · semana {schedule.lastRun.week} · {schedule.lastRun.anomalies} anomalías · {schedule.lastRun.recipients} correos {schedule.lastRun.simulated ? "(simulado)" : "(enviados)"}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => runNow(false)} disabled={busy} style={{ ...btn(C.buy), opacity: busy ? 0.6 : 1 }}>{busy ? "Ejecutando…" : "▷ Ejecutar ahora (prueba)"}</button>
          <button onClick={() => runNow(true)} disabled={busy} style={{ ...btn(C.panelHi, C.text), border: `1px solid ${C.line}`, opacity: busy ? 0.6 : 1 }}>Refrescar datos + ejecutar</button>
        </div>
        {runResult && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13 }}>
            Semana <strong>{runResult.week}</strong>: {runResult.anomalies?.length || 0} anomalías · correo a {runResult.recipients} destinatario(s) {runResult.simulated ? "(modo simulado — define RESEND_API_KEY para envío real)" : "(enviado)"}.
            {runResult.anomalies?.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {runResult.anomalies.map((a) => <li key={a.ticker} style={{ fontFamily: MONO, fontSize: 12, marginTop: 2 }}>{a.ticker} · {a.type === "buy" ? "COMPRA" : "VENTA"} · conv {a.conviction} · z {a.z}</li>)}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <p style={{ color: C.mut, fontSize: 11, textAlign: "center", marginTop: 10 }}>
        El scheduler corre la inspección al principio de cada semana y envía el correo a todos los usuarios con alertas activas.
      </p>
    </div>
  );
}

const Row = ({ label, children }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 14 }}><span style={{ fontSize: 12.5, color: C.mut, fontWeight: 500 }}>{label}</span>{children}</div>;
const Toggle = ({ on, onClick }) => <button onClick={onClick} aria-pressed={on} style={{ width: 46, height: 26, borderRadius: 13, border: "none", background: on ? C.buy : C.line, position: "relative", flexShrink: 0, cursor: "pointer" }}><span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 20, background: "#fff", transition: "left .15s" }} /></button>;
