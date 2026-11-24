// Función de Vercel: texto -> audio mp3.
// 1) Voz de Álvaro (español de España) de Microsoft Edge, con un reintento si falla.
// 2) Si Edge sigue fallando y existe la clave de Deepgram, usa aura-2-alvaro-es (sin ajuste de tono).
// Variables de entorno opcionales en Vercel:
//   APP_TOKEN          el mismo token que pones en Ajustes de la página
//   TONO               por defecto -15Hz (más negativo = más grave)
//   RITMO              por defecto +0%
//   VOZ                por defecto es-ES-AlvaroNeural
//   DEEPGRAM_API_KEY   (opcional) respaldo si Edge bloquea
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOZ = process.env.VOZ || "es-ES-AlvaroNeural";
const TONO = process.env.TONO || "-12Hz";
const RITMO = process.env.RITMO || "+0%";
const DG = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_KEY || "";
const esc = t => t.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

async function edge(texto, o) {
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: 20000 });
  try {
    await tts.setMetadata(o.voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(esc(texto), { pitch: o.tono, rate: o.ritmo });
    const chunks = [];
    await new Promise((ok, ko) => {
      audioStream.on("data", d => chunks.push(d));
      audioStream.on("end", ok);
      audioStream.on("close", ok);
      audioStream.on("error", ko);
    });
    if (!chunks.length) throw new Error("sin audio");
    return Buffer.concat(chunks);
  } finally {
    try { tts.close() } catch (e) {}
  }
}

async function deepgram(texto) {
  const r = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-alvaro-es", {
    method: "POST",
    headers: { Authorization: "Token " + DG, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto })
  });
  if (!r.ok) throw new Error("Deepgram " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-app-token");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  if (process.env.APP_TOKEN && (req.headers["x-app-token"] || (req.query && req.query.t)) !== process.env.APP_TOKEN)
    return res.status(401).json({ error: "Token no válido" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body) } catch (e) { body = {} } }
  const q = req.query || {};
  const texto = String((body && body.texto) || q.texto || "").trim().slice(0, 1000);
  // Para probar sin redesplegar: ?texto=Hola&tono=-20Hz&ritmo=-5%25&voz=es-ES-AlvaroNeural
  const o = {
    tono: /^[+-]\d{1,3}Hz$/.test(q.tono || "") ? q.tono : TONO,
    ritmo: /^[+-]\d{1,3}%$/.test(q.ritmo || "") ? q.ritmo : RITMO,
    voz: /^es-[A-Za-z]{2}-[A-Za-z]+Neural$/.test(q.voz || "") ? q.voz : VOZ
  };
  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  const intentos = [() => edge(texto, o), () => edge(texto, o)];
  if (DG) intentos.push(() => deepgram(texto));
  let ultimo = "desconocido";
  for (const f of intentos) {
    try {
      const audio = await f();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(audio);
    } catch (e) { ultimo = e && e.message ? e.message : ultimo }
  }
  return res.status(502).json({ error: "Fallo al generar la voz: " + ultimo });
};
