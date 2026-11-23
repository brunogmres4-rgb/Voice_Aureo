const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

module.exports = async (req, res) => {
  // Permite que tu HTML local o de cualquier web pueda llamarlo
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const texto = req.query.texto || (req.body && req.body.texto);
  const voz = req.query.voz || "es-ES-AlvaroNeural"; // También puedes usar: es-ES-ElviraNeural

  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    
    const { audioStream } = tts.toStream(texto);
    res.setHeader("Content-Type", "audio/mpeg");
    audioStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
