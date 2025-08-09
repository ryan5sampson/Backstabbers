import { useState } from "react";
import { useRouter } from "next/router";

const DEFAULT_TOPICS = [
  "Bread & Circuses budget cuts",
  "Olive oil shortages",
  "Gladiator union negotiations",
  "Aqueduct maintenance day",
  "Senate toga laundry scandal",
  "Public bath renovations",
  "Chariot traffic laws"
];
function ensureInConclusionBuffer(text) {
  // Split into sentences, keeping punctuation
  const sentences = (text.match(/[^.!?]+[.!?]+(?:["')]+)?/g) || [text]).map(s => s.trim());
  let idx = sentences.findIndex(seg => /(^|\s)in conclusion\b/i.test(seg));

  if (idx === -1) {
    // Append an "In conclusion," sentence if it's missing
    sentences.push("In conclusion, my fellow senators, heed me.");
    idx = sentences.length - 1;
  }

  // Ensure at least 3 sentences AFTER the "in conclusion" sentence
  const remaining = sentences.length - idx - 1;
  const needed = Math.max(0, 3 - remaining);
  const closers = [
    "Steel your resolve and act with haste.",
    "Let every hand finish the duty before us.",
    "Rome expects every dagger to do its part."
  ];
  for (let i = 0; i < needed; i++) {
    sentences.push(closers[i] || "Let us see this business to its end.");
  }

  // Light tidy
  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

export default function Setup() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [senators, setSenators] = useState(4);
  const [confidence, setConfidence] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

async function handleGenerate() {
  try {
    setLoading(true);
    setError("");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, senators, confidence })
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.speech) throw new Error(data.error || "Generation failed");

    // 1) Clean up model output
    let s = (data.speech || "").replace(/\[FINISH\]\s*$/i, "").trim();

    // 2) Force "In conclusion" exists and is ≥ 3 sentences from the end.
    s = ensureInConclusionBuffer(s);

    // 3) Go to speech page
    router.push({
      pathname: "/speech",
      query: {
        speech: encodeURIComponent(s),
        confidence,
        senators: String(senators),
        topic: encodeURIComponent(topic || "Address to the Senate")
      }
    });
  } catch (e) {
    setLoading(false);
    setError(String(e.message || e));
  }
}

// ...everything above unchanged...

router.push({
  pathname: "/speech",
  query: {
    speech: encodeURIComponent(s),
    confidence,
    senators: String(senators),
    topic: encodeURIComponent(topic || "Address to the Senate")   // ← add this
  }
});

    } catch (e) {
      setLoading(false);
      setError(String(e.message || e));
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>⚔ AVE, SENATOR! ⚔</h1>

        <label>Speech Topic</label>
        <div className="row">
          <input
            type="text"
            placeholder="Bread & Circuses"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button type="button" onClick={() =>
            setTopic(DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)])
          }>Pick one</button>
        </div>

        <label>Number of senators (players)</label>
        <input
          type="number"
          min={2}
          max={12}
          value={senators}
          onChange={(e) => setSenators(e.target.value)}
        />

        <label>Confidence</label>
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <button className="primary" disabled={loading} onClick={handleGenerate}>
          {loading ? "Consulting the Augurs..." : "Generate Speech"}
        </button>

        {error && <div className="error">{error}</div>}
      </div>

      <style jsx>{`
        .page { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
        .card { width: 100%; max-width: 720px; background:#fffdf5; border:6px solid #c9a86b; border-radius:12px; padding:20px; }
        h1 { text-align:center; margin:0 0 16px; }
        .row { display:flex; gap:8px; }
        input, select, button { padding:10px; font-size:1rem; }
        input, select { flex:1; border:2px solid #c9a86b; border-radius:6px; background:#fffef7; }
        button { background:#c9a86b; color:#3b2a00; border:none; border-radius:6px; cursor:pointer; font-weight:700; }
        .primary { width:100%; margin-top:8px; }
        .error { margin-top:10px; color:#a40000; background:#fff0f0; border:2px solid #a40000; padding:10px; border-radius:6px; }
        @media (max-width: 520px) { .row { flex-direction: column; } }
      `}</style>
    </div>
  );
}
