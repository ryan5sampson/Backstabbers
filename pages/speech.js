import { useRouter } from "next/router";
import { useState, useEffect } from "react";

export default function Speech() {
  const router = useRouter();
  const { speech, confidence } = router.query;

  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [turnPrompt, setTurnPrompt] = useState(false);

  if (!speech) return <p>Loading...</p>;

  // Decode and apply split rules
  const decodedSpeech = decodeURIComponent(speech);
  const segments = confidence === "high"
    ? decodedSpeech.split(/(?<=[.?!])\s+/) // only sentence ends
    : confidence === "medium"
    ? decodedSpeech.split(/(?<=[,]|[.?!])\s+/) // commas or sentence ends
    : decodedSpeech.split(/(\s+)/); // between words

  useEffect(() => {
    if (started && segments.length > 0) {
      let idx = 0;
      let turnShown = false;

      const timer = setInterval(() => {
        setDisplayText((prev) => prev + segments[idx]);
        setProgress(((idx + 1) / segments.length) * 100);

        // Show TURN AROUND! randomly after 2+ sentences
        if (!turnShown && idx > 1 && Math.random() < 0.05) {
          setTurnPrompt(true);
          setTimeout(() => setTurnPrompt(false), 2000);
          turnShown = true;
        }

        idx++;
        if (idx >= segments.length) clearInterval(timer);
      }, 500);

      return () => clearInterval(timer);
    }
  }, [started]);

  return (
    <div className="speech-container">
      {!started ? (
        <button onClick={() => setStarted(true)} className="primary-btn">
          Start Speech
        </button>
      ) : (
        <>
          <div className="progress-bar">
            <div style={{ width: `${progress}%` }}></div>
          </div>

          {turnPrompt && <p className="turn-alert">TURN AROUND!</p>}
          <p className="speech-text">{displayText}</p>

          <button onClick={() => router.push("/")} className="exit-btn">
            Exit
          </button>
        </>
      )}

      <style jsx>{`
        .speech-container {
          max-width: 800px;
          margin: auto;
          padding: 20px;
          text-align: center;
        }
        .progress-bar {
          height: 8px;
          background: #ccc;
          margin-bottom: 10px;
          width: 100%;
        }
        .progress-bar div {
          height: 100%;
          background: green;
          transition: width 0.2s;
        }
        .speech-text {
          font-size: 1.2em;
          line-height: 1.6;
          margin-top: 20px;
        }
        .turn-alert {
          color: red;
          font-weight: bold;
          font-size: 1.4em;
        }
        .primary-btn, .exit-btn {
          background: goldenrod;
          color: white;
          border: none;
          padding: 10px 15px;
          font-size: 1.1em;
          cursor: pointer;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}
