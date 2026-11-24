// Función de Vercel: texto -> audio mp3 con la voz de Álvaro (español de España) de Microsoft Edge.
// Sin clave de API ni tarjeta. Variables de entorno opcionales en Vercel:
//   APP_TOKEN  token que la página manda en la cabecera x-app-token (el mismo de Ajustes)
//   VOZ        por defecto es-ES-AlvaroNeural
//   TONO       por defecto -15Hz (más negativo = más grave; prueba -10Hz, -20Hz, -25Hz)
//   RITMO      por defecto +0% (velocidad; por ejemplo -5% para hablar más despacio)
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOZ = process.env.VOZ || "es-ES-AlvaroNeural";
const TONO = process.env.TONO || "-15Hz";
const RITMO = process.env.RITMO || "+0%";
const esc = t => t.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-app-token");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (process.env.APP_TOKEN && req.headers["x-app-token"] !== process.env.APP_TOKEN)
    return res.status(401).json({ error: "Token no válido" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body) } catch (e) { body = {} } }
  const texto = String((body && body.texto) || "").trim().slice(0, 1000);
  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(esc(texto), { pitch: TONO, rate: RITMO });
    const chunks = [];
    await new Promise((ok, ko) => {
      audioStream.on("data", d => chunks.push(d));
      audioStream.on("end", ok);
      audioStream.on("close", ok);
      audioStream.on("error", ko);
    });
    if (!chunks.length) return res.status(502).json({ error: "Microsoft no devolvió audio" });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.concat(chunks));
  } catch (e) {
    return res.status(502).json({ error: "Fallo al generar la voz: " + (e && e.message ? e.message : "desconocido") });
  } finally {
    try { tts.close() } catch (e) {}
  }
};
