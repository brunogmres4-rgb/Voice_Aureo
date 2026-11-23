module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const texto = req.query.texto || (req.body && req.body.texto);
  const voz = req.query.voz || "aura-2-nestor-es";

  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  const apiKey = (process.env.DEEPGRAM_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Falta la variable DEEPGRAM_KEY en Vercel" });
  }

  try {
    const url = "https://deepgram.com" + encodeURIComponent(voz);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Token " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: texto })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(audioBuffer);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      causa: error.cause ? String(error.cause) : "sin detalle"
    });
  }
};
