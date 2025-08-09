import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory cache
let speechCache = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topic, senators, confidence } = req.body;

  // 1. If we already have this speech, return it
  if (speechCache[topic]) {
    return res.status(200).json(speechCache[topic]);
  }

  try {
    const prompt = `
You are an ancient Roman senator giving a dramatic speech on the topic: "${topic}".
The speech should be lively, persuasive, and humorous.
There are ${senators} players.
Confidence level: ${confidence}.
Mark points in the speech where the speaker should pause and turn dramatically
by writing "[TURN]" on its own line.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // switched to cheaper model
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
    });

    const text = completion.choices[0].message.content || "";
    const cleaned = text.replace(/\[FINISH\]\s*$/i, "").trim();

    // Determine turn points
    const words = cleaned.split(/\s+/);
    const turnPoints = [];
    words.forEach((w, i) => {
      if (w.includes("[TURN]")) {
        turnPoints.push(i);
      }
    });

    const result = {
      speech: cleaned.replace(/\[TURN\]/g, ""),
      turnPoints,
      wpm: 130
    };

    // Save in cache
    speechCache[topic] = result;

    return res.status(200).json(result);

  } catch (err) {
    console.error("Error generating speech:", err.message);

    // 2. Fallback: return random cached speech if available
    const topics = Object.keys(speechCache);
    if (topics.length > 0) {
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      return res.status(200).json(speechCache[randomTopic]);
    }

    // 3. If no cache yet, hard fail
    return res.status(500).json({ error: "Failed to generate and no fallback available" });
  }
}
