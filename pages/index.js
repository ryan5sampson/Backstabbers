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

export default function Setup() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [senators, setSenators] = useState(4);
  const [confidence, setConfidence] = useState("medium");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, senators, confidence })
    });
    const data = await res.json();
    setLoading(false);

    if (data.speech) {
      router.push({
        pathname: "/speech",
        query: {
          speech: encodeURIComponent(data.speech),
          confidence,
          senators
        }
      });
    }
  };

  return (
    <div className="setup-container">
      <h1>⚔ AVE, SENATOR! ⚔</h1>

      <label>Speech Topic</label>
      <div className="row">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button
          onClick={() =>
            setTopic(DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)])
          }
        >
          Pick one
        </button>
      </div>

      <label>Number of Senators (Players)</label>
      <input
        type="number"
        min="2"
        value={senators}
        onChange={(e) => setSenators(e.target.value)}
      />

      <label>Confidence</label>
      <select
        value={confidence}
        onChange={(e) => setConfidence(e.target.value)}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <button onClick={handleGenerate} className="primary-btn" disabled={loading}>
        {loading ? "Generating..." : "Generate Speech"}
      </button>

      <style jsx>{`
        .setup-container {
          max-width: 500px;
          margin: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .row {
          display: flex;
          gap: 8px;
        }
        input, select, button {
          padding: 8px;
          font-size: 1em;
          flex: 1;
        }
        button {
          cursor: pointer;
        }
        .primary-btn {
          background: goldenrod;
          color: white;
          border: none;
        }
      `}</style>
    </div>
  );
}
