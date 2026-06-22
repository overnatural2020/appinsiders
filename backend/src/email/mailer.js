// Envío de correo vía Resend (https://resend.com). Si no hay RESEND_API_KEY,
// funciona en MODO SIMULADO: registra el correo en consola en vez de enviarlo,
// para poder probar todo el flujo sin credenciales.
import { config } from "../config.js";

const { resendApiKey, from, appUrl } = config.email;

export async function sendEmail({ to, subject, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) return { ok: false, skipped: "sin destinatarios" };

  if (!resendApiKey) {
    console.log("\n[mailer] MODO SIMULADO (define RESEND_API_KEY para enviar de verdad)");
    console.log(`  para:    ${recipients.join(", ")}`);
    console.log(`  asunto:  ${subject}`);
    console.log(`  (html ${html.length} chars)\n`);
    return { ok: true, simulated: true, to: recipients };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  return { ok: true, id: (await res.json()).id, to: recipients };
}

// ---- plantillas ----
const shell = (title, body) => `
<div style="background:#0b0e13;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#11161d;border:1px solid #1c2530;border-radius:16px;overflow:hidden">
    <div style="padding:22px 26px;border-bottom:1px solid #1c2530">
      <div style="font-size:13px;letter-spacing:.04em;color:#5AB0E6;font-weight:700;text-transform:uppercase">Anomalías de insiders</div>
      <div style="font-size:20px;color:#E6EDF3;font-weight:700;margin-top:4px">${title}</div>
    </div>
    <div style="padding:24px 26px;color:#c3ccd6;font-size:14px;line-height:1.6">${body}</div>
    <div style="padding:16px 26px;border-top:1px solid #1c2530;color:#6B7785;font-size:11px">
      Lectura de la fuerza de la señal, no una recomendación. Esto no es asesoría de inversión.
    </div>
  </div>
</div>`;

const button = (label) => `
  <a href="${appUrl}" style="display:inline-block;margin-top:8px;background:#2EE6A6;color:#06281d;
     text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${label} →</a>`;

export function noAnomaliesEmail(week) {
  const body = `
    <p>Inspección semanal completada. <strong>No se detectaron anomalías</strong> de insiders
    en la semana revisada (<strong>${week}</strong>) con la configuración actual.</p>
    <p>Sin compras/ventas a mercado abierto desproporcionadas. Todo dentro de lo normal.</p>
    ${button("Abrir la herramienta")}`;
  return { subject: `Sin anomalías · semana ${week}`, html: shell("Sin anomalías esta semana", body) };
}

export function anomaliesEmail(week, anomalies) {
  const rows = anomalies.map((a) => {
    const col = a.type === "buy" ? "#2EE6A6" : "#FF5C45";
    const tag = a.type === "buy" ? "COMPRA" : "VENTA";
    const extra = [a.opportunistic ? "oportunista" : null, `${a.insiders} insider${a.insiders > 1 ? "s" : ""}`, `z ${a.z}`]
      .filter(Boolean).join(" · ");
    return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1c2530">
        <span style="font-family:ui-monospace,monospace;font-size:15px;color:#E6EDF3;font-weight:700">${a.ticker}</span>
        <span style="font-size:10px;font-weight:700;color:${col};border:1px solid ${col}55;border-radius:5px;padding:2px 6px;margin-left:8px">${tag}</span>
        <div style="color:#6B7785;font-size:12px;margin-top:3px">${extra}</div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #1c2530;text-align:right;font-family:ui-monospace,monospace">
        <span style="color:${col};font-size:20px;font-weight:700">${a.conviction}</span>
        <div style="color:#6B7785;font-size:9px;letter-spacing:.04em">CONVICCIÓN</div>
      </td>
    </tr>`;
  }).join("");

  const body = `
    <p>La inspección de la semana <strong>${week}</strong> detectó
    <strong>${anomalies.length} anomalía${anomalies.length > 1 ? "s" : ""}</strong> de insiders:</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 4px">${rows}</table>
    ${button("Ver detalle en la herramienta")}`;
  return {
    subject: `${anomalies.length} anomalía${anomalies.length > 1 ? "s" : ""} detectada${anomalies.length > 1 ? "s" : ""} · semana ${week}`,
    html: shell(`${anomalies.length} anomalía${anomalies.length > 1 ? "s" : ""} esta semana`, body),
  };
}
