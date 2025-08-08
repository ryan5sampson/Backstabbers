import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import styles from "../styles/globals.module.css";

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
  const [paused, setPaused] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

  const wordsRef = useRef([]);
  const timerRef = useRef(null);

  function pickRandomTopic() {
    const t = DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
    setTopic(t);
  }

  async function onGenerate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSpeech("");
    setTurnPoints([]);
    setRevealedWords(0);
    setPaused(false);
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
      setSpeech(s);
      setTurnPoints(data.turnPoints || []);
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
    setPaused(false);
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

  return (
    <>
      <Head>
        <title>Caesar’s Teleprompter</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div className={styles.page}>
        <div className={styles.panel}>
          <h1 className={styles.title}>⚔ Ave, Senator! ⚔</h1>

          <form onSubmit={onGenerate} className={styles.form}>
            <label>Speech topic</label>
            <div className={styles.row}>
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

          {error && <div className={styles.error}>{error}</div>}

          {speech && (
            <div className={styles.teleprompter}>
              <div className={styles.scrollbox}>
                <p className={styles.speech}>{displayed}</p>
              </div>

              {paused && (
                <div className={styles.turnBlock}>
                  <div className={styles.turnText}>TURN AROUND!</div>
                  <button onClick={onResume}>Resume</button>
                </div>
              )}
            </div>
          )}

          <div className={styles.footerNote}>
            Length auto‑scales with player count. Turns depend on confidence.
          </div>
        </div>
      </div>
    </>
  );
}
