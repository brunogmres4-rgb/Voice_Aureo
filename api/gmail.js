// Función de Vercel: conecta tu Gmail (una sola vez) y envía correos con el permiso gmail.send.
// Variables de entorno en Vercel:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   las dos claves de Google Cloud (cliente "Aplicación web")
//   APP_TOKEN                                el mismo token de siempre (recomendado)
//   GOOGLE_REFRESH_TOKEN                     se obtiene al conectar (ver más abajo)
//   GMAIL_REDIRECT   (opcional)              por defecto https://TU-DOMINIO/api/gmail
// Conectar: abre en el NAVEGADOR (no en el WebView) /api/gmail?accion=conectar&t=TU_TOKEN
const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
const hdr = r => {
  r.setHeader("Access-Control-Allow-Origin", "*");
  r.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  r.setHeader("Access-Control-Allow-Headers", "content-type, x-app-token");
  r.setHeader("Cache-Control", "no-store");
};
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const redirectUri = req => process.env.GMAIL_REDIRECT || `https://${req.headers["x-forwarded-host"] || req.headers.host}/api/gmail`;
const firma = (v, k) => crypto.createHmac("sha256", k).update(v).digest("hex").slice(0, 32);
const tokOk = req => {
  const need = process.env.APP_TOKEN;
  if (!need) return true;
  const q = req.query || {};
  return (req.headers["x-app-token"] || q.t) === need;
};
const page = (res, code, titulo, cuerpo) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(code).send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><body style="font:16px system-ui;background:#0B0D0C;color:#E7ECE9;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.6"><h2>${esc(titulo)}</h2>${cuerpo}`);
};

async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token"
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const e = new Error(j.error === "invalid_grant" ? "Google ha caducado el permiso: vuelve a conectar Gmail" : "No se pudo renovar el acceso a Gmail" + (j.error ? " (" + j.error + ")" : ""));
    e.code = j.error === "invalid_grant" ? 401 : 502; throw e;
  }
  return j.access_token;
}

function mensaje({ para, asunto, texto, de }) {
  const l = [];
  if (de) l.push("From: " + de);
  l.push("To: " + para, "Subject: =?UTF-8?B?" + Buffer.from(asunto, "utf8").toString("base64") + "?=",
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(texto.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"));
  return b64u(l.join("\r\n"));
}

module.exports = async (req, res) => {
  hdr(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const id = process.env.GOOGLE_CLIENT_ID, sec = process.env.GOOGLE_CLIENT_SECRET, q = req.query || {};
  if (!id || !sec) return res.status(500).json({ error: "Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en Vercel" });

  if (req.method === "GET") {
    if (q.error) return page(res, 400, "Google no autorizó la conexión", `<p>Motivo: ${esc(q.error)}</p><p>Revisa que tu correo esté en "Usuarios de prueba" y vuelve a intentarlo.</p>`);
    if (q.code) {
      const [ts, f] = String(q.state || "").split(".");
      if (!ts || !f || f !== firma(ts, sec) || Date.now() - Number(ts) > 10 * 60 * 1000)
        return page(res, 400, "Enlace no válido o caducado", "<p>Empieza de nuevo desde <code>/api/gmail?accion=conectar</code>.</p>");
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: q.code, client_id: id, client_secret: sec, redirect_uri: redirectUri(req), grant_type: "authorization_code" })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return page(res, 502, "Google rechazó el código", `<p>${esc(j.error_description || j.error || "error desconocido")}</p><p>Suele ser que la URI de redirección de Google Cloud no coincide con <code>${esc(redirectUri(req))}</code>.</p>`);
      if (!j.refresh_token) return page(res, 409, "Google no devolvió el permiso duradero", "<p>Quita el acceso de esta app en <b>myaccount.google.com/permissions</b> y repite la conexión.</p>");
      return page(res, 200, "Gmail conectado", `<p>Copia este valor en Vercel como variable <b>GOOGLE_REFRESH_TOKEN</b> y vuelve a desplegar. Después cierra esta página.</p><textarea readonly rows=4 style="width:100%;background:#121614;color:#E7ECE9;border:1px solid #333;border-radius:8px;padding:10px;font:13px monospace" onfocus="this.select()">${esc(j.refresh_token)}</textarea><p style="color:#8A948F">Es como una contraseña de envío: no se la enseñes a nadie.</p>`);
    }
    if (q.accion === "conectar") {
      if (!tokOk(req)) return res.status(401).json({ error: "Token no válido" });
      const ts = String(Date.now());
      const u = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: id, redirect_uri: redirectUri(req), response_type: "code", scope: SCOPE,
        access_type: "offline", prompt: "consent", state: ts + "." + firma(ts, sec)
      });
      res.setHeader("Location", u); return res.status(302).end();
    }
    if (q.accion === "estado") {
      if (!tokOk(req)) return res.status(401).json({ error: "Token no válido" });
      return res.status(200).json({ cliente: true, conectado: !!process.env.GOOGLE_REFRESH_TOKEN, redireccion: redirectUri(req) });
    }
    return res.status(404).json({ error: "Usa ?accion=conectar o ?accion=estado" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!tokOk(req)) return res.status(401).json({ error: "Token no válido" });
  if (!process.env.GOOGLE_REFRESH_TOKEN) return res.status(409).json({ error: "Gmail aún no está conectado" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b) } catch (e) { b = {} } } b = b || {};
  const para = String(b.para || "").trim(), asunto = String(b.asunto || "").trim(), texto = String(b.texto || "");
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(para)) return res.status(400).json({ error: "Dirección de destino no válida" });
  if (!asunto || /[\r\n]/.test(asunto) || asunto.length > 200) return res.status(400).json({ error: "Asunto no válido" });
  if (!texto.trim() || texto.length > 20000) return res.status(400).json({ error: "Texto vacío o demasiado largo" });
  try {
    const at = await accessToken();
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: "Bearer " + at, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: mensaje({ para, asunto, texto }) })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: "Gmail rechazó el envío" + (j.error && j.error.message ? ": " + j.error.message : "") });
    return res.status(200).json({ ok: true, id: j.id });
  } catch (e) { return res.status(e.code || 502).json({ error: e.message || "Fallo al enviar" }); }
};
