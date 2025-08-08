import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { topic, senators, confidence } = req.body || {};
  if (!senators || isNaN(parseInt(senators))) {
    return res.status(400).json({ error: "Missing or invalid 'senators'." });
  }

  // --- Game math ---
  const players = Math.max(2, Math.min(12, parseInt(senators)));
  const knivesPerPlayer = 24 / players;              // 24 knives total
  const lengthSec = Math.round(knivesPerPlayer * 10); // ~10 sec per knife-per-player
  // Target “spoken” words (≈130 wpm)
  const targetWPM = 130;
  const targetWords = Math.max(60, Math.round((lengthSec / 60) * targetWPM));

  // Turn frequency by confidence (fewer turns if confident)
  const turns =
    confidence === "high" ? 1 :
    confidence === "low"  ? 5 : 3;

  // Evenly space turn points over word indexes
  const turnPoints = [];
  for (let i = 1; i <= turns; i++) {
    turnPoints.push(Math.floor((targetWords / (turns + 1)) * i));
  }

  // Optional slight speed tweak by confidence (we still reveal at the client)
  const wpm =
    confidence === "high" ? 140 :
    confidence === "low"  ? 120 : 130;

  // Build safe prompt (no direct imitation requests)
  const prompt = [
    `Write a comedic speech as if Julius Caesar is addressing Rome about: "${topic || "a Roman decree"}".`,
    `Tone: playful Roman oratory with modern asides. PG-13. Do NOT imitate any specific copyrighted text or ad.`,
    `Length: about ${lengthSec} seconds of speaking (~${targetWords} words).`,
    `Include clear stage directions inline like [PAUSE], [ASIDE], but do not include any "[TURN NOW]" text; turning is managed by the app.`,
    `End with a distinct final line tag: [FINISH].`
  ].join("\n");

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: Math.min(1024, targetWords + 80)
    });

    let speech = completion.choices?.[0]?.message?.content || "";

    // Clean up: strip any unexpected TURN markers if the model added them
    speech = speech.replace(/\[TURN NOW\]/gi, "");

    // Fallback if somehow empty
    if (!speech.trim()) {
      speech = `People of Rome! Today I bring tidings regarding ${topic || "the affairs of the Republic"}.
We have balanced the scales of bread and glory, taxed the pigeons, and disciplined the aqueducts.
Stand tall, adjust your togas, and lend me your ears (lightly, please, I need them back).
[PAUSE]
Some say our budget is stretched thinner than a senator’s hairline, but I say: we are Rome!
We endure, we adapt, and we do it with impeccable sandal game.
[PAUSE]
So breathe deep, cheer loudly, and remember: if anyone asks—this was definitely planned.
[FINISH]`;
    }

    return res.status(200).json({ speech, lengthSec, wpm, turnPoints });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Generation failed" });
  }
}
