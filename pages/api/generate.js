import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory cache
let savedSpeeches = [];

// Funny default prompts if no topic is provided
const FUNNY_DEFAULTS = [
  "The glorious invention of Caesar salads—even though they are suspiciously modern",
  "My vision that a distant nation will think about Rome at least once each week",
  "How I cannot possibly be killed, and how my beloved friends would never betray me"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { topic, senators, confidence } = req.body || {};
  topic = (topic || "").trim();
  const numPlayers = Math.max(1, parseInt(senators, 10) || 1);

  // Determine target speech length based on number of players
  const speechSeconds = 24 + numPlayers * 8;
  const approxWords = Math.round((speechSeconds / 60) * 180); // 180 wpm baseline

  // If no topic, pick from our funny defaults—and also check cache first
  if (!topic) {
    // If we have cached speeches, serve one randomly (free)
    if (savedSpeeches.length > 0) {
      const pick = savedSpeeches[Math.floor(Math.random() * savedSpeeches.length)];
      return res.status(200).json({ speech: pick, wpm: pickWpm(confidence) });
    }
    topic = FUNNY_DEFAULTS[Math.floor(Math.random() * FUNNY_DEFAULTS.length)];
  }

  // If cached exact topic, return it
  const cached = savedSpeeches.find(s => s.__topic === topic);
  if (cached) {
    return res.status(200).json({ speech: cached.text, wpm: pickWpm(confidence) });
  }

  try {
    const prompt = [
      `Write a comedic speech as if JULIUS CAESAR is addressing the ROMAN PEOPLE. The speech should only contain the words Caesar is saying, and nothing else.`,
      `Topic: "${topic}".`,
      `Tone: bombastic oratory + modern asides; playful; ironic; PG‑13; witty callbacks; avoid copying any specific copyrighted text.`,
      `Voice: confident, theatrical, self‑aggrandizing, with occasional jabs at senators and rival generals.`,
      `Pacing: short to medium sentences; vivid imagery; Roman references (aqueducts, legions, augurs, SPQR, laurel wreaths).`,
      `Close with a paragraph that begins with "In conclusion," (exact phrase) and then 2–4 more sentences. Do NOT end immediately after "In conclusion,"`,
      `Length: about ${speechSeconds} seconds spoken (roughly ${approxWords} words).`,
      `End with [FINISH].`
    ].join('\n');

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: 512
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "";
    text = text.replace(/\[FINISH\]\s*$/i, "").trim();

    // Save to cache with topic for future free pulls
    savedSpeeches.unshift({ __topic: topic, text });
    if (savedSpeeches.length > 12) savedSpeeches.pop();

    return res.status(200).json({ speech: text, wpm: pickWpm(confidence) });
  } catch (err) {
    console.error("OpenAI error:", err?.message || err);

    // Fallback if quota/exceptions
    const fallback = makeFallback(topic);
    savedSpeeches.unshift({ __topic: topic, text: fallback });
    if (savedSpeeches.length > 12) savedSpeeches.pop();

    return res.status(200).json({ speech: fallback, wpm: pickWpm(confidence), _note: "FALLBACK" });
  }
}

function pickWpm(confidence) {
  if (confidence === "low") return 110;
  if (confidence === "high") return 140;
  return 125;
}

function makeFallback(topic) {
  return `People of Rome! I come not to mumble, but to thunder about ${topic}.
[PAUSE]
Behold our aqueducts, our legions, our suspiciously crunchy croutons—proof that destiny favors the bold!
[PAUSE]
In conclusion, my fellow Romans, raise your laurel wreaths, hold your dagg—decorative letter openers—and let history remember this day for laughter and triumph.`;
}
