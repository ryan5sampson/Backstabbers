import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

// Map confidence -> words-per-minute and average turns per sentence
const WPM = { low: 110, medium: 125, high: 140 };
const TURN_AVG = { low: 1, medium: 2, high: 3 }; // avg sentences per turn

export default function Speech() {
  const router = useRouter();
  const { speech: encoded, confidence = "medium" } = router.query;

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);

  const wordsRef = useRef([]);
  const timerRef = useRef(null);

  // decode + precompute words / sentence boundaries
  const { words, sentenceEnds, turnPoints } = useMemo(() => {
    const s = decodeURIComponent(encoded || "");
    const w = s.trim().split(/\s+/);                 // words
    const ends = [];                                  // word index AFTER sentence end
    for (let i = 0; i < w.length; i++) {
      if (/[.!?]["')]*$/.test(w[i])) ends.push(i + 1);
    }

    // --- Generate turn points based on sentences ---
    // grace: no turns in first 2 sentences
    const mean = TURN_AVG[confidence] || 2;
    const totalSentences = ends.length;
    const points = [];

    if (totalSentences > 2) {
      // choose a variable number of turns around totalSentences / mean, jitter ±20%
      const approx = Math.max(1, Math.round(((totalSentences - 2) / mean) * (0.8 + Math.random() * 0.4)));

      // generate spaced turns using a noisy step
      let sIdx = 2; // sentence index (0-based), first allowed is the 3rd sentence
      while (points.length < approx) {
        const jitter = Math.round((Math.random() - 0.5) * 1); // -1,0,1
        const step = Math.max(1, Math.round(mean + jitter));
        sIdx += step;
        if (sIdx >= totalSentences) break;
        points.push(ends[sIdx]); // word index to pause at
      }
    }

    return { words: w, sentenceEnds: ends, turnPoints: points };
  }, [encoded, confidence]);

  const total = words.length;
  const progress = total ? Math.min(100, (revealed / total) * 100) : 0;

  // reveal loop
  useEffect(() => {
    if (!started || paused || !total) return;

    // pause at a turn point
    if (turnIndex < turnPoints.length && revealed === turnPoints[turnIndex]) {
      setPaused(true);
      return;
    }

    const delay = 60000 / (WPM[confidence] || 125);
    timerRef.current = setTimeout(() => setRevealed(n => n + 1), delay);
    return () => clearTimeout(timerRef.current);
  }, [started, paused, revealed, turnIndex, turnPoints, total, confidence]);

  function onStart() {
    setStarted(true);
    setPaused(false);        // start from paused=false
    setRevealed(0);
    setTurnIndex(0);
  }
  function onResume() {
    setPaused(false);
    setTurnIndex(i => i + 1);
  }
  function onExit() {
    router.push("/");
  }

  const displayed = words.slice(0, revealed).join(" ");

  return (
    <div className="page">
      <div className="card">

        <div className="topbar">
          <button className="ghost" onClick={onExit}>← Exit</button>
          <div className="title">⚔ AVE, SENATOR! ⚔</div>
          <div style={{ width: 64 }} />
        </div>

        <div className="progressOuter"><div className="progressInner" style={{ width: `${progress}%` }} /></div>

        {!started ? (
          <div className="center">
            <button className="primary" onClick={onStart}>▶ Start Speech</button>
          </div>
        ) : (
          <>
            {paused && revealed > 0 && revealed < total && (
              <div className="turnBox">
                <div className="turnText">TURN AROUND!</div>
                <button className="primary" onClick={onResume}>Resume</button>
              </div>
            )}

            <div className="teleprompter">
              <p className="speech">{displayed}</p>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .page { min-height:100vh; display:grid; place-items:center; padding:16px; }
        .card { width:100%; max-width:900px; background:#fffdf5; border:6px solid #c9a86b; border-radius:12px; padding:16px; }
        .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .title { font-weight:800; text-align:center; }
        .ghost { background:transparent; border:none; color:#3b2a00; font-weight:700; cursor:pointer; }
        .progressOuter { height:10px; background:#ddd; border-radius:6px; overflow:hidden; }
        .progressInner { height:100%; background:#6c0; transition:width .15s ease; }
        .center { display:grid; place-items:center; padding:12px; }
        .primary { background:#c9a86b; color:#3b2a00; border:none; padding:10px 14px; border-radius:6px; font-weight:800; cursor:pointer; }
        .teleprompter { margin-top:16px; padding:16px; background:#fffef9; border:2px solid #e4d6aa; border-radius:8px; }
        .speech { margin:0; text-align:left; line-height:1.6; font-size:1.2rem; }
        .turnBox { margin-top:12px; display:grid; place-items:center; gap:8px; }
        .turnText { color:#b00000; font-weight:900; font-size:1.6rem; }
        @media (max-width: 520px) {
          .speech { font-size:1.05rem; }
        }
      `}</style>
    </div>
  );
}
