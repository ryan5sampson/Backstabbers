import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

// Defaults (used to prefill the Settings panel)
const DEFAULT_WPM = { low: 200, medium: 200, high: 200 };
const DEFAULT_MEAN_SENT_PER_TURN = { low: 1, medium: 2, high: 3 }; // avg sentences per turn

export default function Speech() {
  const router = useRouter();
  const {
    speech: encoded,
    confidence = "medium",
    topic: encodedTopic,
  } = router.query;

  const title = decodeURIComponent(encodedTopic || "Address to the Roman People");
  const rawSpeech = decodeURIComponent(encoded || "");
  const teleRef = useRef(null);


  // ----- SETTINGS (live adjustable) -----
  const [wpm, setWpm] = useState(DEFAULT_WPM[confidence] ?? 200);
  const [meanSentencesPerTurn, setMeanSentencesPerTurn] = useState(
    DEFAULT_MEAN_SENT_PER_TURN[confidence] ?? 2
  );
  const [granularity, setGranularity] = useState("sentence"); // "sentence" | "phrase" | "word"
  const [showSettings, setShowSettings] = useState(false);

  // Playback state
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(0);     // word index revealed (exclusive)
  const [turnIndex, setTurnIndex] = useState(0);   // which pause we're on
  const [paragraphBreaks, setParagraphBreaks] = useState([]); // where to start new <p> after pauses
  const [finished, setFinished] = useState(false);
  const [finishOverlay, setFinishOverlay] = useState(false);

  const timerRef = useRef(null);

  // Precompute words, sentences, and candidate breakpoints
  const pre = useMemo(() => {
    const words = rawSpeech.trim().split(/\s+/);

    // sentence ends (index AFTER the end word)
    const sentenceEnds = [];
    for (let i = 0; i < words.length; i++) {
      if (/[.!?]["')]*$/.test(words[i])) sentenceEnds.push(i + 1);
    }

    // sentences (start/end ranges; detect "in conclusion")
    const sentences = [];
    let prev = 0;
    for (const end of sentenceEnds) {
      sentences.push({ start: prev, end, text: words.slice(prev, end).join(" ") });
      prev = end;
    }
    if (prev < words.length) {
      sentences.push({ start: prev, end: words.length, text: words.slice(prev).join(" ") });
    }

    // phrase ends: commas/semicolons OR sentence ends
    const phraseEndSet = new Set(sentenceEnds);
    for (let i = 0; i < words.length; i++) {
      if (/[,;:]["')]*$/.test(words[i])) phraseEndSet.add(i + 1);
    }
    const phraseEndList = Array.from(phraseEndSet).sort((a, b) => a - b);

    // word boundaries (between words)
    const wordBoundaries = Array.from({ length: Math.max(0, words.length - 1) }, (_, i) => i + 1);

    return { words, sentenceEnds, sentences, phraseEndList, wordBoundaries };
  }, [rawSpeech]);

  // Compute turn points (skip everything at/after "In conclusion"; grace before first)
  const turnPoints = useMemo(() => {
    const { sentenceEnds, sentences, phraseEndList, wordBoundaries } = pre;
    const totalSentences = sentenceEnds.length;

    // find sentence index for "in conclusion"
    let conclSentenceIdx = sentences.findIndex(s => /(^|\s)in conclusion\b/i.test(s.text));
    if (conclSentenceIdx === -1) conclSentenceIdx = Infinity;
    const noTurnFromWord = conclSentenceIdx < sentences.length ? sentences[conclSentenceIdx].start : Infinity;

    // grace before first turn
    const firstAllowedSentence = confidence === "high" ? 3 : 2;

    // choose candidate list
    let candidates;
    if (granularity === "sentence") candidates = sentenceEnds;
    else if (granularity === "phrase") candidates = phraseEndList;
    else candidates = pre.wordBoundaries;

    if (totalSentences <= firstAllowedSentence || candidates.length === 0) return [];

    // determine target count with jitter from mean sentences/turn
    const mean = Math.max(1, Number(meanSentencesPerTurn) || 2);
    const baseCount = (totalSentences - firstAllowedSentence) / mean;
    const targetCount = Math.max(1, Math.round(baseCount * (0.8 + Math.random() * 0.4)));

    const nearestCandidateAtOrAfter = (idx) => {
      let lo = 0, hi = candidates.length - 1, ans = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (candidates[mid] >= idx) { ans = candidates[mid]; hi = mid - 1; }
        else lo = mid + 1;
      }
      return ans ?? candidates[candidates.length - 1];
    };

    const points = [];

    // first turn near firstAllowedSentence (±0..1), but NOT at/after "in conclusion"
    const firstTargetSentence = Math.min(
      totalSentences - 1,
      firstAllowedSentence + Math.round(Math.random())
    );
    const firstWordIndex = sentenceEnds[firstTargetSentence] ?? sentenceEnds[firstAllowedSentence];
    let p0 = nearestCandidateAtOrAfter(firstWordIndex);
    if (p0 < noTurnFromWord) points.push(p0);

    // remaining turns: hop ~mean sentences (±1 jitter), never at/after "in conclusion"
    let sIdx = firstTargetSentence;
    while (points.length < targetCount) {
      const jitter = Math.round((Math.random() - 0.5) * 1); // -1, 0, +1
      const step = Math.max(1, Math.round(mean + jitter));
      sIdx += step;
      if (sIdx >= totalSentences) break;
      const wordIdx = sentenceEnds[sIdx];
      const nxt = nearestCandidateAtOrAfter(wordIdx);
      if (nxt >= noTurnFromWord) break;
      if (points.length === 0 || nxt - points[points.length - 1] > 2) points.push(nxt);
    }

    return points;
  }, [pre, confidence, granularity, meanSentencesPerTurn]);
  
// Build paragraphs from paragraphBreaks
const paragraphs = useMemo(() => {
  if (!pre.words.length) return [];
  const breaks = paragraphBreaks.slice();
  if (breaks[breaks.length - 1] !== revealed && revealed > 0) breaks.push(revealed);

  const parts = [];
  let prev = 0;
  for (const b of breaks) {
    if (b > prev) parts.push(pre.words.slice(prev, b).join(" "));
    prev = b;
  }
  if (parts.length === 0 && revealed > 0) {
    parts.push(pre.words.slice(0, revealed).join(" "));
  }
  return parts;
}, [paragraphBreaks, revealed, pre.words]);

// Progress
const totalWords = pre.words.length;
const progress = totalWords ? Math.min(100, (revealed / totalWords) * 100) : 0;

// Word-by-word reveal. Pause 800ms after a turn word. Delay finish overlay a tad.
useEffect(() => {
  if (!started || paused || !totalWords || finished) return;

  // pause shortly after a turn point so last word is readable
  if (turnIndex < turnPoints.length && revealed === turnPoints[turnIndex]) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPaused(true), 800);
    return;
  }

  // end of speech → mark finished and show overlay after a short grace
  if (revealed >= totalWords) {
    setFinished(true);
    timerRef.current = setTimeout(() => setFinishOverlay(true), 900);
    return;
  }

  const delay = 60000 / Math.max(60, Number(wpm) || 125);
  timerRef.current = setTimeout(() => setRevealed((n) => n + 1), delay);
  return () => clearTimeout(timerRef.current);
}, [started, paused, revealed, turnIndex, turnPoints, totalWords, wpm, finished]);

// Auto-scroll the teleprompter pane as words reveal
useEffect(() => {
  if (!started || !teleRef.current) return;
  teleRef.current.scrollTo({
    top: teleRef.current.scrollHeight,
    behavior: "smooth",
  });
}, [revealed, paragraphs, started]);

// Optional: lock page scroll while overlays are visible
useEffect(() => {
  const block = paused || finishOverlay;
  if (block) document.body.classList.add("modal-open");
  else document.body.classList.remove("modal-open");
  return () => document.body.classList.remove("modal-open");
}, [paused, finishOverlay]);

  // Controls
  function onStart() {
    setStarted(true);
    setPaused(false);
    setRevealed(0);
    setTurnIndex(0);
    setParagraphBreaks([]);
    setFinished(false);
    setFinishOverlay(false);
  }
  function onResume() {
    // Start a new paragraph at the current revealed index
    setParagraphBreaks(arr => (arr.length && arr[arr.length - 1] === revealed) ? arr : [...arr, revealed]);
    setPaused(false);
    setTurnIndex(i => i + 1);
  }
  function onExit() {
    router.push("/");
  }


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

            <div className="hint">Changes apply to the next run. Press Start again to test.</div>
          </div>
        )}
<div className="laurelLine" aria-hidden="true">
  <svg viewBox="0 0 600 30" preserveAspectRatio="xMidYMid meet" role="img" aria-label="laurel divider">
    <defs>
      <linearGradient id="laurelGold" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#e5d29a" />
        <stop offset="1" stopColor="#b89654" />
      </linearGradient>

      <symbol id="leaf" viewBox="0 0 20 20">
        <ellipse cx="10" cy="10" rx="9" ry="5" />
      </symbol>
    </defs>

    <circle cx="300" cy="15" r="3" fill="url(#laurelGold)" />

    <g fill="url(#laurelGold)" transform="translate(300,15) rotate(180)">
      <use href="#leaf" transform="translate(16,0) rotate(-22) scale(0.9,1)" />
      <use href="#leaf" transform="translate(40,0) rotate(-18) scale(0.9,1)" />
      <use href="#leaf" transform="translate(64,0) rotate(-15) scale(0.9,1)" />
      <use href="#leaf" transform="translate(88,0) rotate(-12) scale(0.9,1)" />
      <use href="#leaf" transform="translate(112,0) rotate(-10) scale(0.9,1)" />
      <use href="#leaf" transform="translate(136,0) rotate(-8)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(160,0) rotate(-6)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(184,0) rotate(-4)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(208,0) rotate(-2)  scale(0.9,1)" />
    </g>

    <g fill="url(#laurelGold)" transform="translate(300,15)">
      <use href="#leaf" transform="translate(16,0) rotate(-22) scale(0.9,1)" />
      <use href="#leaf" transform="translate(40,0) rotate(-18) scale(0.9,1)" />
      <use href="#leaf" transform="translate(64,0) rotate(-15) scale(0.9,1)" />
      <use href="#leaf" transform="translate(88,0) rotate(-12) scale(0.9,1)" />
      <use href="#leaf" transform="translate(112,0) rotate(-10) scale(0.9,1)" />
      <use href="#leaf" transform="translate(136,0) rotate(-8)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(160,0) rotate(-6)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(184,0) rotate(-4)  scale(0.9,1)" />
      <use href="#leaf" transform="translate(208,0) rotate(-2)  scale(0.9,1)" />
    </g>
  </svg>
</div>
        <div className="progressOuter">
          <div className="progressInner" style={{ width: `${progress}%` }} />
        </div>

        {!started ? (
          <div className="center">
            <button className="btn primary" onClick={onStart}>▶ Start Speech</button>
          </div>
        ) : (
          <div className="teleWrap">
            {/* TURN overlay */}
            {paused && !finished && revealed > 0 && revealed < totalWords ? (
              <div className="turnOverlay">
                <div className="turnCard">
                  <div className="turnText">TURN AROUND!</div>
                  <button className="btn primary" onClick={onResume}>Resume</button>
                </div>
              </div>
            ) : null}

            {/* FINISH overlay */}
            {finishOverlay ? (
              <div className="turnOverlay">
                <div className="turnCard">
                  <div className="turnText">Congratulations, you Survived!</div>
                  <button className="btn primary" onClick={onExit}>Back to Setup</button>
                </div>
              </div>
            ) : null}

<div className="teleprompter" ref={teleRef}>
  {paragraphs.length > 0 ? (
    paragraphs.map((p, i) => <p key={i} className="speech">{p}</p>)
  ) : (
    <p className="speech">{pre.words.slice(0, revealed).join(" ")}</p>
  )}
</div>

          </div>
        )}
      </div>
    </div>
  );
}
