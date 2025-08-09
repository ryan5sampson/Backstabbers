import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const DEFAULT_TOPICS = [
  "Bread & Circuses budget cuts",
  "Olive oil shortages",
  "Gladiator union negotiations",
  "Aquila (eagle) population boom",
  "Senate toga laundry scandal",
  "Public bath renovations",
  "Chariot traffic laws",
  "Aqueduct maintenance day"
];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [senators, setSenators] = useState(4);
  const [confidence, setConfidence] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [speech, setSpeech] = useState("");
  const [turnPoints, setTurnPoints] = useState([]);
  const [wpm, setWpm] = useState(130);
  const [error, setError] = useState("");

  // Teleprompter state
  const [revealedWords, setRevealedWords] = useState(0);
  const [paused, setPaused] = useState(true); // default to paused until start clicked
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

  const wordsRef = useRef([]);
  const timerRef = useRef(null);

  function pickRandomTopic() {
    const t = DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
    setTopic(t);
  }

  function getBreakpoints(words, confidence) {
    const breakpoints = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (confidence === "high" && /[.!?]$/.test(word)) breakpoints.push(i + 1);
      else if (confidence === "medium" && /[.!?,;]$/.test(word)) breakpoints.push(i + 1);
      else if (confidence === "low" && Math.random() < 0.08) breakpoints.push(i + 1);
    }
    return breakpoints;
  }

  async function onGenerate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSpeech("");
    setTurnPoints([]);
    setRevealedWords(0);
    setPaused(true);
    setCurrentTurnIndex(0);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, senators, confidence })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");

      let s = (data.speech || "").replace(/\[FINISH\]\s*$/i, "").trim();

      // Ensure "in conclusion" ending
      if (!/in conclusion/i.test(s)) {
        s += "\n\nIn conclusion, my fellow senators...";
      }

      setSpeech(s);

      // Local turn points generation according to confidence rules
      const words = s.split(/\s+/);
      const breakpoints = getBreakpoints(words, confidence);
      setTurnPoints(breakpoints);
      setWpm(data.wpm || 130);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Prepare words array on speech change
  useEffect(() => {
    if (!speech) return;
    wordsRef.current = speech.split(/\s+/);
    setRevealedWords(0);
    setCurrentTurnIndex(0);
  }, [speech]);

  // Teleprompter reveal loop
  useEffect(() => {
    if (!speech || paused) return;

    const words = wordsRef.current;
    if (revealedWords >= words.length) return; // done

    // If we hit a turn breakpoint, pause and show TURN cue
    if (currentTurnIndex < turnPoints.length && revealedWords === turnPoints[currentTurnIndex]) {
      setPaused(true);
      return;
    }

    const delay = 60000 / (wpm || 130); // ms per word
    timerRef.current = setTimeout(() => {
      setRevealedWords((n) => n + 1);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [revealedWords, paused, speech, wpm, currentTurnIndex, turnPoints]);

  function onResume() {
    setPaused(false);
    setCurrentTurnIndex((i) => i + 1);
  }

  const displayed = wordsRef.current.slice(0, revealedWords).join(" ");
  const progress = wordsRef.current.length
    ? (revealedWords / wordsRef.current.length) * 100
    : 0;

  return (
    <>
      <Head>
        <title>Caesar’s Teleprompter</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{ padding: "20px", fontFamily: "Cinzel, serif" }}>
        <h1>⚔ Ave, Senator! ⚔</h1>

        <form onSubmit={onGenerate}>
          <label>Speech topic</label>
          <div>
            <input
              type="text"
              placeholder="Bread & Circuses"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button type="button" onClick={pickRandomTopic}>Pick one</button>
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
            <option value="low">Low (many turns)</option>
            <option value="medium">Medium</option>
            <option value="high">High (few turns)</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Consulting the Augurs..." : "Generate Speech"}
          </button>
        </form>

        {error && <div style={{ color: "red" }}>{error}</div>}

        {speech && revealedWords === 0 && (
          <button onClick={() => setPaused(false)} style={{ marginTop: "10px" }}>
            ▶ Start Speech
          </button>
        )}

        {speech && (
          <>
            <div style={{ margin: "10px 0", height: "8px", background: "#ddd", borderRadius: "4px" }}>
              <div style={{
                height: "100%",
                width: `${progress}%`,
                background: "#6c0",
                borderRadius: "4px",
                transition: "width 0.2s ease"
              }}></div>
            </div>

            <div style={{ marginTop: "20px" }}>
              <p>{displayed}</p>

              {paused && revealedWords > 0 && revealedWords < wordsRef.current.length && (
                <div>
                  <div style={{ fontWeight: "bold", color: "red" }}>TURN AROUND!</div>
                  <button onClick={onResume}>Resume</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
