import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

// Default mappings (used to prefill settings; you can tweak live in the UI)
const DEFAULT_WPM = { low: 110, medium: 125, high: 140 };
const DEFAULT_MEAN_SENT_PER_TURN = { low: 1, medium: 2, high: 3 };

export default function Speech() {
  const router = useRouter();
  const {
    speech: encoded,
    confidence = "medium",
    topic: encodedTopic,
    senators
  } = router.query;

  const title = decodeURIComponent(encodedTopic || "Address to the Senate");
  const rawSpeech = decodeURIComponent(encoded || "");

  // ----- SETTINGS (live adjustable) -----
  const [wpm, setWpm] = useState(DEFAULT_WPM[confidence] ?? 125);
  // Average sentences per turn (lower = more frequent)
  const [meanSentencesPerTurn, setMeanSentencesPerTurn] = useState(
    DEFAULT_MEAN_SENT_PER_TURN[confidence] ?? 2
  );
  // Where turns are permitted
  const [granularity, setGranularity] = useState("sentence"); // "sentence" | "phrase" | "word"
  // UI state
  const [showSettings, setShowSettings] = useState(false);

  // Playback state
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(0);     // word index revealed (exclusive)
  const [turnIndex, setTurnIndex] = useState(0);   // which pause we're on
  const [paragraphBreaks, setParagraphBreaks] = useState([]); // word indices to start new <p> after pauses

  const timerRef = useRef(null);

  // Precompute words and break candidates
const { words, sentenceEnds, turnPoints } = useMemo(() => {
  const raw = decodeURIComponent(encoded || "");
  const words = raw.trim().split(/\s+/);

  // Compute sentence boundaries (index AFTER the sentence-ending token)
  const sentenceEnds = [];
  for (let i = 0; i < words.length; i++) {
    if (/[.!?]["')]*$/.test(words[i])) sentenceEnds.push(i + 1);
  }

  // Build sentence ranges so we can detect which one has "in conclusion"
  const sentences = [];
  let prev = 0;
  for (const end of sentenceEnds) {
    sentences.push({ start: prev, end, text: words.slice(prev, end).join(" ") });
    prev = end;
  }
  if (prev < words.length) {
    // Trailing fragment (just in case)
    sentences.push({ start: prev, end: words.length, text: words.slice(prev).join(" ") });
  }

  // Find first sentence that contains "in conclusion"
  let conclSentenceIdx = sentences.findIndex(s => /(^|\s)in conclusion\b/i.test(s.text));
  if (conclSentenceIdx === -1) conclSentenceIdx = Infinity; // no "in conclusion" found

  // Candidate breakpoints by granularity
  const sentenceOnly = sentenceEnds; // sentence ends
  const phraseEndSet = new Set(sentenceEnds);
  for (let i = 0; i < words.length; i++) {
    if (/[,;:]["')]*$/.test(words[i])) phraseEndSet.add(i + 1);
  }
  const phraseOnly = Array.from(phraseEndSet).sort((a, b) => a - b);
  const wordBoundaries = Array.from({ length: Math.max(0, words.length - 1) }, (_, i) => i + 1);

  const totalSentences = sentenceEnds.length;
  const firstAllowedSentence = confidence === "high" ? 3 : 2;

  let candidates;
  if (granularity === "sentence") candidates = sentenceOnly;
  else if (granularity === "phrase") candidates = phraseOnly;
  else candidates = wordBoundaries;

  if (totalSentences <= firstAllowedSentence || candidates.length === 0) {
    return { words, sentenceEnds, turnPoints: [] };
  }

  // Compute a "no-turn zone" starting at the beginning of the "in conclusion" sentence
  const noTurnFromWord = conclSentenceIdx < sentences.length ? sentences[conclSentenceIdx].start : Infinity;

  const mean = Math.max(1, Number(meanSentencesPerTurn) || 2);
  const baseCount = (totalSentences - firstAllowedSentence) / mean;
  const targetCount = Math.max(1, Math.round(baseCount * (0.8 + Math.random() * 0.4)));

  const nearestCandidateAtOrAfter = (idx) => {
    // Binary search to find first candidate >= idx
    let lo = 0, hi = candidates.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (candidates[mid] >= idx) { ans = candidates[mid]; hi = mid - 1; }
      else lo = mid + 1;
    }
    return ans ?? candidates[candidates.length - 1];
  };

  const points = [];

  // First turn near sentence #firstAllowedSentence (±0..1), but NOT in/after "in conclusion"
  const firstTargetSentence = Math.min(
    totalSentences - 1,
    firstAllowedSentence + Math.round(Math.random())
  );
  const firstWordIndex = sentenceEnds[firstTargetSentence] ?? sentenceEnds[firstAllowedSentence];
  let firstPoint = nearestCandidateAtOrAfter(firstWordIndex);
  if (firstPoint >= noTurnFromWord) firstPoint = null;
  if (firstPoint) points.push(firstPoint);

  // Remaining turns: hop ~mean sentences (±1 jitter), but never at/after "in conclusion"
  let sIdx = firstTargetSentence;
  while (points.length < targetCount) {
    const jitter = Math.round((Math.random() - 0.5) * 1); // -1,0,+1
    const step = Math.max(1, Math.round(mean + jitter));
    sIdx += step;
    if (sIdx >= totalSentences) break;
    const wordIdx = sentenceEnds[sIdx];
    let p = nearestCandidateAtOrAfter(wordIdx);
    if (p >= noTurnFromWord) break;
    if (points.length === 0 || p - points[points.length - 1] > 2) points.push(p);
  }

  return { words, sentenceEnds, turnPoints: points };
}, [encoded, confidence, granularity, meanSentencesPerTurn]);


  // Generate turn points from settings (with grace period)
  const turnPoints = useMemo(() => {
    const { words, sentenceEnds, phraseEndList, wordBoundaries } = pre;
    const totalSentences = sentenceEnds.length;
    // Grace: minimum sentence number before first turn
    const firstAllowedSentence = confidence === "high" ? 3 : 2;

    // Select candidate break indices based on granularity
    let candidates;
    if (granularity === "sentence") candidates = sentenceEnds;
    else if (granularity === "phrase") candidates = phraseEndList;
    else candidates = wordBoundaries; // "word"

    if (totalSentences <= firstAllowedSentence || candidates.length === 0) return [];

    // Convert “avg sentences per turn” into sentence targets; then map to nearest candidate index
    const mean = Math.max(1, Number(meanSentencesPerTurn) || 2);

    // Estimate target number of pauses after grace (±20% jitter)
    const baseCount = (totalSentences - firstAllowedSentence) / mean;
    const targetCount = Math.max(1, Math.round(baseCount * (0.8 + Math.random() * 0.4)));

    const points = [];

    // Helper: find the first candidate index >= a given word index
    const nearestCandidateAtOrAfter = (idx) => {
      // candidates are sorted ascending
      let lo = 0, hi = candidates.length - 1, ans = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (candidates[mid] >= idx) { ans = candidates[mid]; hi = mid - 1; }
        else lo = mid + 1;
      }
      return ans ?? candidates[candidates.length - 1];
    };

    // First turn aimed around the end of sentence #firstAllowedSentence (±0..1)
    const firstTargetSentence = Math.min(
      totalSentences - 1,
      firstAllowedSentence + Math.round(Math.random()) // 2 or 3 (or 3/4 for high)
    );
    const firstWordIndex = sentenceEnds[firstTargetSentence] ?? sentenceEnds[firstAllowedSentence];
    const firstPoint = nearestCandidateAtOrAfter(firstWordIndex);
    if (firstPoint) points.push(firstPoint);

    // Remaining turns: hop ~mean sentences with slight jitter
    let sIdx = firstTargetSentence;
    while (points.length < targetCount) {
      const jitter = Math.round((Math.random() - 0.5) * 1); // -1,0,+1
      const step = Math.max(1, Math.round(mean + jitter));
      sIdx += step;
      if (sIdx >= totalSentences) break;
      const wordIdx = sentenceEnds[sIdx];
      const point = nearestCandidateAtOrAfter(wordIdx);
      if (!point) break;
      // prevent duplicates / too-close pauses (e.g., within 2 words)
      if (points.length === 0 || point - points[points.length - 1] > 2) points.push(point);
    }

    return points;
  }, [pre, confidence, granularity, meanSentencesPerTurn]);

  // Progress
  const totalWords = pre.words.length;
  const progress = totalWords ? Math.min(100, (revealed / totalWords) * 100) : 0;

  // Reveal loop (word-by-word at chosen WPM)
  useEffect(() => {
    if (!started || paused || !totalWords) return;

    // If at a turn point, wait a short grace, then pause & overlay
    if (turnIndex < turnPoints.length && revealed === turnPoints[turnIndex]) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPaused(true);
      }, 800); // grace after last word appears
      return;
    }

    const delay = 60000 / Math.max(60, Number(wpm) || 125); // clamp to sane min 60 WPM
    timerRef.current = setTimeout(() => setRevealed((n) => n + 1), delay);
    return () => clearTimeout(timerRef.current);
  }, [started, paused, revealed, turnIndex, turnPoints, totalWords, wpm]);

  // Controls
  function onStart() {
    setStarted(true);
    setPaused(false);
    setRevealed(0);
    setTurnIndex(0);
    setParagraphBreaks([]); // fresh run
  }
  function onResume() {
    // When resuming after a pause, start a new paragraph at the current revealed index
    setParagraphBreaks((arr) => {
      if (arr.length && arr[arr.length - 1] === revealed) return arr;
      return [...arr, revealed];
    });
    setPaused(false);
    setTurnIndex((i) => i + 1);
  }
  function onExit() {
    router.push("/");
  }

  // Build paragraphs from paragraphBreaks
  const paragraphs = useMemo(() => {
    if (!totalWords) return [];
    const breaks = paragraphBreaks.slice();
    // Include end-of-speech so the last paragraph renders cleanly
    if (breaks[breaks.length - 1] !== revealed && revealed > 0) breaks.push(revealed);

    const parts = [];
    let prev = 0;
    for (const b of breaks) {
      if (b > prev) parts.push(pre.words.slice(prev, b).join(" "));
      prev = b;
    }
    // If we haven't added anything yet (no pause), show the current text as a single paragraph
    if (parts.length === 0 && revealed > 0) {
      parts.push(pre.words.slice(0, revealed).join(" "));
    }
    return parts;
  }, [paragraphBreaks, revealed, pre.words, totalWords]);

  return (
    <div className="page">
      <div className="card">
        <div className="topbar">
          <button className="ghost" onClick={onExit}>← Exit</button>
          <div className="title">{title}</div>
          <button className="ghost" onClick={() => setShowSettings(s => !s)}>
            {showSettings ? "Close Settings" : "Settings"}
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="settings">
            <div className="row">
              <label>WPM</label>
              <input
                type="number"
                min={60}
                max={220}
                value={wpm}
                onChange={(e) => setWpm(e.target.value)}
              />
            </div>

            <div className="row">
              <label>Avg sentences per turn</label>
              <input
                type="number"
                min={1}
                max={6}
                step={0.5}
                value={meanSentencesPerTurn}
                onChange={(e) => setMeanSentencesPerTurn(e.target.value)}
              />
            </div>

            <div className="row">
              <label>Turn positions</label>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                <option value="sentence">Sentences only</option>
                <option value="phrase">Phrases (commas & sentences)</option>
                <option value="word">Between words</option>
              </select>
            </div>

            <div className="hint">
              Changes apply **immediately** to the next run. Press Start again to test.
            </div>
          </div>
        )}

        <div className="progressOuter">
          <div className="progressInner" style={{ width: `${progress}%` }} />
        </div>

{!started ? (
  <div className="center">
    <button className="primary" onClick={onStart}>▶ Start Speech</button>
  </div>
) : revealed >= totalWords ? (
  <div className="center" style={{ minHeight: "40vh" }}>
    <h2 style={{ marginBottom: 8 }}>Congratulations, you Survived!</h2>
    <button className="primary" onClick={onExit}>Back to Setup</button>
  </div>
) : (
  <div className="teleWrap">
    {/* Overlay pause */}
    {paused && revealed > 0 && revealed < totalWords && (
      <div className="turnOverlay">
        <div className="turnCard">
          <div className="turnText">TURN AROUND!</div>
          <button className="primary" onClick={onResume}>Resume</button>
        </div>
      </div>
    )}

    <div className="teleprompter">
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => <p key={i} className="speech">{p}</p>)
      ) : (
        <p className="speech">{pre.words.slice(0, revealed).join(" ")}</p>
      )}
    </div>
  </div>
)}

      <style jsx>{`
        .page { min-height:100vh; display:grid; place-items:center; padding:16px; }
        .card { width:100%; max-width:1000px; background:#fffdf5; border:6px solid #c9a86b; border-radius:12px; padding:16px; }
        .topbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .title { font-weight:800; text-align:center; }
        .ghost { background:transparent; border:none; color:#3b2a00; font-weight:700; cursor:pointer; }
        .progressOuter { height:12px; background:#ddd; border-radius:6px; overflow:hidden; margin-top:8px; }
        .progressInner { height:100%; background:#6c0; transition:width .15s ease; }
        .center { display:grid; place-items:center; padding:14px; }
        .primary { background:#c9a86b; color:#3b2a00; border:none; padding:12px 16px; border-radius:8px; font-weight:800; cursor:pointer; }

        .settings { margin-top:10px; padding:12px; border:2px solid #e4d6aa; border-radius:8px; background:#fffef9; }
        .settings .row { display:flex; align-items:center; gap:10px; margin:8px 0; }
        .settings label { min-width:200px; }
        .settings input, .settings select { padding:8px; border:2px solid #c9a86b; border-radius:6px; background:#fffef7; }
        .hint { font-size:.9rem; opacity:.8; margin-top:4px; }

        .teleWrap { position:relative; margin-top:16px; }
        .teleprompter { padding:18px; background:#fffef9; border:2px solid #e4d6aa; border-radius:8px; min-height:40vh; }
        .speech { margin:0 0 1rem 0; text-align:left; line-height:1.7; font-size:1.6rem; } /* bigger text */

        .turnOverlay {
          position:absolute;
          inset:0; /* cover teleprompter */
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
        .turnText { color:#b00000; font-weight:900; font-size:2.2rem; margin-bottom:10px; }

        @media (max-width: 540px) {
          .speech { font-size:1.35rem; line-height:1.6; }
          .turnText { font-size:1.8rem; }
          .settings label { min-width:140px; }
        }
      `}</style>
    </div>
  );
}
