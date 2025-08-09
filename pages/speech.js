import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

// Defaults (you can tweak live in the Settings panel)
const DEFAULT_WPM = { low: 110, medium: 125, high: 140 };
const DEFAULT_MEAN_SENT_PER_TURN = { low: 1, medium: 2, high: 3 }; // avg sentences per turn

export default function Speech() {
  const router = useRouter();
  const {
    speech: encoded,
    confidence = "medium",
    topic: encodedTopic,
  } = router.query;

  const title = decodeURIComponent(encodedTopic || "Address to the Senate");
  const rawSpeech = decodeURIComponent(encoded || "");

  // ----- SETTINGS (live adjustable) -----
  const [wpm, setWpm] = useState(DEFAULT_WPM[confidence] ?? 125);
  const [meanSentencesPerTurn, setMeanSentencesPerTurn] = useState(
    DEFAULT_MEAN_SENT_PER_TURN[confidence] ?? 2
  );
  const [granularity, setGranularity] = useState("sentence"); // "sentence" | "phrase" | "word"
  const [showSettings, setShowSettings] = useState(false);
const [finished, setFinished] = useState(false);
const [finishOverlay, setFinishOverlay] = useState(false);

  // Playback state
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(0);     // word index revealed (exclusive)
  const [turnIndex, setTurnIndex] = useState(0);   // which pause we're on
  const [paragraphBreaks, setParagraphBreaks] = useState([]); // word indices to start new <p> after pauses

  const timerRef = useRef(null);

  // Precompute words, sentences, candidates
  const pre = useMemo(() => {
    const words = rawSpeech.trim().split(/\s+/);

    // sentence ends (index AFTER the end word)
    const sentenceEnds = [];
    for (let i = 0; i < words.length; i++) {
      if (/[.!?]["')]*$/.test(words[i])) sentenceEnds.push(i + 1);
    }

    // sentences with ranges (to find "in conclusion")
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

    const wordBoundaries = Array.from({ length: Math.max(0, words.length - 1) }, (_, i) => i + 1);

    return { words, sentenceEnds, sentences, phraseEndList, wordBoundaries };
  }, [rawSpeech]);

  // Compute turn points (no turns after "in conclusion"; grace before first)
  const turnPoints = useMemo(() => {
    const { sentenceEnds, sentences, phraseEndList, wordBoundaries } = pre;
    const totalSentences = sentenceEnds.length;

    let conclSentenceIdx = sentences.findIndex(s => /(^|\s)in conclusion\b/i.test(s.text));
    if (conclSentenceIdx === -1) conclSentenceIdx = Infinity;
    const noTurnFromWord = conclSentenceIdx < sentences.length ? sentences[conclSentenceIdx].start : Infinity;

    const firstAllowedSentence = confidence === "high" ? 3 : 2;

    let candidates;
    if (granularity === "sentence") candidates = sentenceEnds;
    else if (granularity === "phrase") candidates = phraseEndList;
    else candidates = pre.wordBoundaries;

    if (totalSentences <= firstAllowedSentence || candidates.length === 0) return [];

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

    // First turn near firstAllowedSentence (±0..1), but NOT at/after "in conclusion"
    const firstTargetSentence = Math.min(
      totalSentences - 1,
      firstAllowedSentence + Math.round(Math.random())
    );
    const firstWordIndex = sentenceEnds[firstTargetSentence] ?? sentenceEnds[firstAllowedSentence];
    let firstPoint = nearestCandidateAtOrAfter(firstWordIndex);
    if (firstPoint >= noTurnFromWord) firstPoint = null;
    if (firstPoint) points.push(firstPoint);

    // Remaining turns
    let sIdx = firstTargetSentence;
    while (points.length < targetCount) {
      const jitter = Math.round((Math.random() - 0.5) * 1);
      const step = Math.max(1, Math.round(mean + jitter));
      sIdx += step;
      if (sIdx >= totalSentences) break;
      const wordIdx = sentenceEnds[sIdx];
      let p = nearestCandidateAtOrAfter(wordIdx);
      if (p >= noTurnFromWord) break;
      if (points.length === 0 || p - points[points.length - 1] > 2) points.push(p);
    }

    return points;
  }, [pre, confidence, granularity, meanSentencesPerTurn]);

  // Progress
  const totalWords = pre.words.length;
  const progress = totalWords ? Math.min(100, (revealed / totalWords) * 100) : 0;

  // Word-by-word reveal. Pause 800ms after a turn word.
useEffect(() => {
  if (!started || paused || !totalWords || finished) return;

  // Pause shortly after a turn point so the last word is visible
  if (turnIndex < turnPoints.length && revealed === turnPoints[turnIndex]) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPaused(true), 800);
    return;
  }

  // End-of-speech: wait a moment, then show finish overlay
  if (revealed >= totalWords) {
    setFinished(true);
    // short grace so last word lands before overlay
    timerRef.current = setTimeout(() => setFinishOverlay(true), 900);
    return;
  }

  const delay = 60000 / Math.max(60, Number(wpm) || 125);
  timerRef.current = setTimeout(() => setRevealed(n => n + 1), delay);
  return () => clearTimeout(timerRef.current);
}, [started, paused, revealed, turnIndex, turnPoints, totalWords, wpm, finished]);


  // Controls
  function onStart() {
    setStarted(true);
    setPaused(false);
    setRevealed(0);
    setTurnIndex(0);
    setParagraphBreaks([]);
  }
  function onResume() {
    setParagraphBreaks(arr => (arr.length && arr[arr.length - 1] === revealed) ? arr : [...arr, revealed]);
    setPaused(false);
    setTurnIndex(i => i + 1);
  }
  function onExit() {
    router.push("/");
  }

  // Build paragraphs from paragraphBreaks
  const paragraphs = useMemo(() => {
    if (!totalWords) return [];
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

        {showSettings && (
          <div className="settings">
            <div className="row"><label>WPM</label>
              <input type="number" min={60} max={220} value={wpm} onChange={(e) => setWpm(e.target.value)} />
            </div>
            <div className="row"><label>Avg sentences per turn</label>
              <input type="number" min={1} max={6} step={0.5} value={meanSentencesPerTurn} onChange={(e) => setMeanSentencesPerTurn(e.target.value)} />
            </div>
            <div className="row"><label>Turn positions</label>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                <option value="sentence">Sentences only</option>
                <option value="phrase">Phrases (commas & sentences)</option>
                <option value="word">Between words</option>
              </select>
            </div>
            <div className="hint">Changes apply to the next run. Press Start again to test.</div>
          </div>
        )}

        <div className="progressOuter"><div className="progressInner" style={{ width: `${progress}%` }} /></div>

{!started ? (
  <div className="center">
    <button className="btn primary" onClick={onStart}>▶ Start Speech</button>
  </div>
) : (
  <div className="teleWrap">
    {/* TURN overlay */}
    {paused && !finished && revealed > 0 && revealed < totalWords && (
      <div className="turnOverlay">
        <div className="turnCard">
          <div className="turnText">TURN AROUND!</div>
          <button className="btn primary" onClick={onResume}>Resume</button>
        </div>
      </div>
    )}

    {/* FINISH overlay */}
    {finishOverlay && (
      <div className="turnOverlay">
        <div className="turnCard">
          <div className="turnText">Congratulations, you Survived!</div>
          <button className="btn primary" onClick={onExit}>Back to Setup</button>
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


            <div className="teleprompter">
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
