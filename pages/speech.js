import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

// words-per-minute by confidence
const WPM = { low: 110, medium: 125, high: 140 };
// average sentences per turn (lower = more frequent)
const MEAN_SENT_PER_TURN = { low: 1, medium: 2, high: 3 };

export default function Speech() {
  const router = useRouter();
  const { speech: encoded, confidence = "medium", topic: encodedTopic } = router.query;

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);

  const title = decodeURIComponent(encodedTopic || "Address to the Senate");

  const wordsRef = useRef([]);
  const timerRef = useRef(null);

  // decode + precompute
  const { words, sentenceEnds, turnPoints } = useMemo(() => {
    const raw = decodeURIComponent(encoded || "");
    const words = raw.trim().split(/\s+/);

    // sentence end = word that ends with . ! ? (optionally followed by quotes/parens)
    const sentenceEnds = [];
    for (let i = 0; i < words.length; i++) {
      if (/[.!?]["')]*$/.test(words[i])) sentenceEnds.push(i + 1); // store index AFTER the end word
    }

    // ---- turn point generation (sentence-based) ----
    const mean = MEAN_SENT_PER_TURN[confidence] ?? 2;
    const totalSent = sentenceEnds.length;

    // Grace period before first turn:
    // low/medium → min after sentence 2; high → min after sentence 3
    const firstAllowedSentence = confidence === "high" ? 3 : 2;

    const pts = [];
    if (totalSent > firstAllowedSentence) {
      // Aim for count ≈ (remaining sentences) / mean, with ±20% jitter
      const baseCount = (totalSent - firstAllowedSentence) / mean;
      const targetCount = Math.max(
        1,
        Math.round(baseCount * (0.8 + Math.random() * 0.4))
      );

      // First turn: near the firstAllowedSentence (±0–1)
      let sIdx = firstAllowedSentence + Math.round(Math.random()); // 2 or 3 (or 3/4 for high)
      if (sIdx < totalSent) pts.push(sentenceEnds[sIdx]);

      // Remaining turns: hop by ~mean sentences with small jitter
      while (pts.length < targetCount) {
        const jitter = Math.round((Math.random() - 0.5) * 1); // -1, 0, +1
        const step = Math.max(1, Math.round(mean + jitter));
        sIdx += step;
        if (sIdx >= totalSent) break;
        pts.push(sentenceEnds[sIdx]);
      }
    }

    return { words, sentenceEnds, turnPoints: pts };
  }, [encoded, confidence]);

  const totalWords = words.length;
  const progress = totalWords ? Math.min(100, (revealed / totalWords) * 100) : 0;

  // reveal loop
  useEffect(() => {
    if (!started || paused || !totalWords) return;

// pause at a turn point, but only after a brief delay so they can read the last word
if (turnIndex < turnPoints.length && revealed === turnPoints[turnIndex]) {
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    setPaused(true);
  }, 800); // 0.8 second pause after the word appears
  return;
}

    const delay = 60000 / (WPM[confidence] || 125);
    timerRef.current = setTimeout(() => setRevealed(n => n + 1), delay);
    return () => clearTimeout(timerRef.current);
  }, [started, paused, revealed, turnIndex, turnPoints, totalWords, confidence]);

  function onStart() {
    wordsRef.current = words;   // keep for future tweaks if needed
    setStarted(true);
    setPaused(false);
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
          <div className="title">{title}</div>
          <div style={{ width: 64 }} />
        </div>

        <div className="progressOuter">
          <div className="progressInner" style={{ width: `${progress}%` }} />
        </div>

        {!started ? (
          <div className="center">
            <button className="primary" onClick={onStart}>▶ Start Speech</button>
          </div>
        ) : (
          <div className="teleWrap">
            {/* Overlay that does NOT shift layout */}
            {paused && revealed > 0 && revealed < totalWords && (
              <div className="turnOverlay">
                <div className="turnCard">
                  <div className="turnText">TURN AROUND!</div>
                  <button className="primary" onClick={onResume}>Resume</button>
                </div>
              </div>
            )}

            <div className="teleprompter">
              <p className="speech">{displayed}</p>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .page { min-height:100vh; display:grid; place-items:center; padding:16px; }
        .card { width:100%; max-width:1000px; background:#fffdf5; border:6px solid #c9a86b; border-radius:12px; padding:16px; }
        .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .title { font-weight:800; text-align:center; }
        .ghost { background:transparent; border:none; color:#3b2a00; font-weight:700; cursor:pointer; }
        .progressOuter { height:12px; background:#ddd; border-radius:6px; overflow:hidden; }
        .progressInner { height:100%; background:#6c0; transition:width .15s ease; }
        .center { display:grid; place-items:center; padding:14px; }
        .primary { background:#c9a86b; color:#3b2a00; border:none; padding:12px 16px; border-radius:8px; font-weight:800; cursor:pointer; }

        .teleWrap { position:relative; margin-top:16px; }
        .teleprompter { padding:18px; background:#fffef9; border:2px solid #e4d6aa; border-radius:8px; min-height:40vh; }
        .speech { margin:0; text-align:left; line-height:1.7; font-size:1.5rem; } /* bigger text */

        .turnOverlay {
          position:absolute;
          inset:0; /* cover the teleprompter area */
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,248,220,0.85);
          z-index:10;
        }
        .turnCard {
          text-align:center;
          padding:18px 22px;
          border:3px solid #c9a86b;
          border-radius:10px;
          background:#fffdf5;
          box-shadow:0 8px 20px rgba(0,0,0,0.15);
        }
        .turnText { color:#b00000; font-weight:900; font-size:2rem; margin-bottom:10px; }

        @media (max-width: 540px) {
          .speech { font-size:1.25rem; line-height:1.6; }
          .turnText { font-size:1.6rem; }
        }
      `}</style>
    </div>
  );
}
