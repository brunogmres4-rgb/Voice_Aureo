const { EdgeTTS } = require("edge-tts-universal");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const texto = req.query.texto || (req.body && req.body.texto);
  const voz = req.query.voz || "es-ES-AlvaroNeural";

  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  try {
    const tts = new EdgeTTS(texto, voz);
    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    return res.status(200).send(audioBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
};
