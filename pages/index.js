import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";

const DEFAULT_TOPICS = [
  "The glorious invention of Caesar salads",
  "My vision: a future nation that thinks about Rome at least once a week",
  "Why I, Julius Caesar, cannot possibly be killed—and why my dear friends would never betray me"
];

// Ensure "In conclusion" exists AND is ≥ 3 sentences before the end
function ensureInConclusionBuffer(text) {
  const sentences = (text.match(/[^.!?]+[.!?]+(?:["')]+)?/g) || [text]).map(s => s.trim());
  let idx = sentences.findIndex(seg => /(^|\s)in conclusion\b/i.test(seg));

  if (idx === -1) {
    sentences.push("In conclusion, my fellow senators, heed me.");
    idx = sentences.length - 1;
  }

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

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

export default function Setup() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const topicRef = useRef(null);
  const [senators, setSenators] = useState(4);
  const [confidence, setConfidence] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Restore saved senator count on mount and persist changes
  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("senators");
    if (saved) {
      const n = Math.min(12, Math.max(2, parseInt(saved, 10)));
      if (!isNaN(n)) setSenators(n);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("senators", String(senators));
    }
  }, [senators]);

  useEffect(() => {
    if (topicRef.current) {
      topicRef.current.style.height = "auto";
      topicRef.current.style.height = topicRef.current.scrollHeight + "px";
    }
  }, [topic]);

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
      if (!res.ok || !data.speech) throw new Error(data.error || "Generation failed");

      // Clean up & enforce "In conclusion" runway
      let s = (data.speech || "").replace(/\[FINISH\]\s*$/i, "").trim();
      s = ensureInConclusionBuffer(s);

      // Go to teleprompter page
      router.push({
        pathname: "/speech",
        query: {
          speech: s,
          confidence,
          senators: String(senators),
          topic: topic || "Address to the Roman People"
        }
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">⚔ ROMAN SPEECH GENERATOR ⚔</h1>

        <label>Speech Topic</label>
        <div className="row">
          <textarea
            ref={topicRef}
            rows={1}
            placeholder="Caesar salads, anyone?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              setTopic(DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)])
            }
          >
            choose for me
          </button>
        </div>

        <label>Number of senators (players)</label>
        <div className="numSelect">
          <button
            type="button"
            onClick={() => setSenators((s) => Math.max(2, s - 1))}
          >
            ↓
          </button>
          <div className="value">{senators}</div>
          <button
            type="button"
            onClick={() => setSenators((s) => Math.min(12, s + 1))}
          >
            ↑
          </button>
        </div>

        <label>Confidence</label>
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <button className="btn primary" disabled={loading} onClick={handleGenerate}>
          {loading ? "Consulting the Augurs..." : "Generate Speech"}
        </button>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
