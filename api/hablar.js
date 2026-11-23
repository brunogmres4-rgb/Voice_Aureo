module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const texto = req.query.texto || (req.body && req.body.texto);
  const voz = req.query.voz || "aura-2-alvaro-es"; // También: aura-2-diana-es o aura-2-carina-es

  if (!texto) return res.status(400).json({ error: "Falta el texto" });

  try {
    const response = await fetch(
      `https://deepgram.com{voz}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.DEEPGRAM_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: texto })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(audioBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
