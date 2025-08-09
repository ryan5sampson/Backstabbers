import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store speeches in-memory for prototype
// (will reset every time server restarts — fine for now)
let savedSpeeches = [];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topic, senators, confidence } = req.body || {};

  // Fallback: no topic? Return a saved speech if available
  if (!topic && savedSpeeches.length > 0) {
    const randomSpeech = savedSpeeches[Math.floor(Math.random() * savedSpeeches.length)];
    return res.status(200).json({
      speech: randomSpeech,
      wpm: confidence === "low" ? 100 : confidence === "medium" ? 130 : 150
    });
  }

  try {
    // Use GPT-4o-mini to save tokens
    const prompt = `Write a persuasive Roman Senate speech on the topic "${topic}" for ${senators} senators listening. Confidence level: ${confidence}. Keep it under 200 words.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });

    const speech = completion.choices[0]?.message?.content?.trim();

    if (speech) {
      savedSpeeches.push(speech); // store for fallback
      if (savedSpeeches.length > 10) savedSpeeches.shift(); // keep only 10 most recent
    }

    return res.status(200).json({
      speech,
      wpm: confidence === "low" ? 100 : confidence === "medium" ? 130 : 150
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
}
