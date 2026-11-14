import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsterLogoMark from "./AsterLogo.jsx";

const scenes = [
  {
    id: "welcome",
    kind: "hero",
    title: "A calm home for your whole school",
    caption: "Aster keeps leaders, teachers and students moving forward together — in one workspace.",
    duration: 7,
  },
  {
    id: "marks",
    kind: "marks",
    title: "Teachers record marks in minutes",
    caption: "Every assessment snapshots the class roster, so no student is ever missed.",
    duration: 7,
  },
  {
    id: "review",
    kind: "review",
    title: "Admins review and approve once",
    caption: "Submitted marks are checked, then approved or returned with a clear note.",
    duration: 7,
  },
  {
    id: "publish",
    kind: "publish",
    title: "Publish a frozen result sheet",
    caption: "Approved assessments become term percentages and are locked into a snapshot.",
    duration: 7,
  },
  {
    id: "progress",
    kind: "progress",
    title: "Everyone sees progress, in sync",
    caption: "Students open only their own published report — no letter grades invented, ever.",
    duration: 7,
  },
];

const totalDuration = scenes.reduce((total, scene) => total + scene.duration, 0);

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function SceneVisual({ kind }) {
  if (kind === "hero") {
    return <div className="explainer-visual explainer-visual-hero">
      <div className="scene-orbit">
        <span className="scene-ring scene-ring-a" />
        <span className="scene-ring scene-ring-b" />
        <span className="scene-cube scene-cube-a" />
        <span className="scene-cube scene-cube-b" />
        <span className="scene-orb" />
        <span className="scene-core"><AsterLogoMark className="scene-logo" /></span>
      </div>
    </div>;
  }
  if (kind === "marks") {
    return <div className="explainer-visual explainer-visual-cards">
      {["Ada O.", "Chidi N.", "Zainab B."].map((name, index) => <article className="scene-card" key={name} style={{ "--i": index }}>
        <span className="scene-avatar" />
        <span className="scene-lines"><i /><i /></span>
        <span className="scene-score">{84 + index * 3}</span>
        <span className="scene-check">✓</span>
      </article>)}
    </div>;
  }
  if (kind === "review") {
    return <div className="explainer-visual explainer-visual-flow">
      <span className="scene-node">Teacher<br /><small>submits</small></span>
      <span className="scene-beam" />
      <span className="scene-node scene-node-accent">Admin<br /><small>reviews</small></span>
      <span className="scene-beam scene-beam-b" />
      <span className="scene-node scene-node-ok">Approved<br /><small>recorded</small></span>
    </div>;
  }
  if (kind === "publish") {
    return <div className="explainer-visual explainer-visual-doc">
      <div className="scene-sheet">
        <span className="scene-sheet-title" />
        {[0, 1, 2, 3].map((row) => <span className="scene-sheet-row" key={row}><i /><b>{62 + row * 7}%</b></span>)}
      </div>
      <span className="scene-seal">✓</span>
    </div>;
  }
  return <div className="explainer-visual explainer-visual-chart">
    {[38, 56, 72, 88].map((height, index) => <span className="scene-bar" key={index} style={{ "--h": `${height}%`, "--i": index }} />)}
    <span className="scene-trend">↗ 88%</span>
  </div>;
}

export default function ExplainerVideo({ open, onClose }) {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const dialogRef = useRef(null);
  const scene = scenes[index];

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const reset = useCallback(() => {
    setIndex(0);
    setElapsed(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    reset();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, reset]);

  useEffect(() => {
    if (!open || !playing || reducedMotion) return undefined;
    const id = window.setInterval(() => setElapsed((previous) => previous + 0.06), 60);
    return () => window.clearInterval(id);
  }, [open, playing, reducedMotion]);

  useEffect(() => {
    if (!open || elapsed < scene.duration) return;
    if (index < scenes.length - 1) {
      setIndex((previous) => previous + 1);
      setElapsed(0);
    } else {
      setPlaying(false);
      setElapsed(scene.duration);
    }
  }, [open, elapsed, index, scene.duration]);

  const goTo = useCallback((next) => {
    setIndex(Math.max(0, Math.min(scenes.length - 1, next)));
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === " " || event.key === "k") { event.preventDefault(); setPlaying((previous) => !previous); }
      else if (event.key === "ArrowRight") goTo(index + 1);
      else if (event.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, index, goTo]);

  if (!open) return null;

  const elapsedBefore = scenes.slice(0, index).reduce((total, item) => total + item.duration, 0);
  const overall = Math.min(1, (elapsedBefore + elapsed) / totalDuration);
  const sceneProgress = Math.min(1, elapsed / scene.duration);

  const seek = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const target = ratio * totalDuration;
    let remaining = target;
    let targetIndex = 0;
    while (targetIndex < scenes.length - 1 && remaining >= scenes[targetIndex].duration) {
      remaining -= scenes[targetIndex].duration;
      targetIndex += 1;
    }
    setIndex(targetIndex);
    setElapsed(remaining);
  };

  return (
    <div
      className="explainer-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className="explainer"
        role="dialog"
        aria-modal="true"
        aria-label="How Aster works — short explainer"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="explainer-head">
          <div className="explainer-title">
            <AsterLogoMark className="mini-brand" />
            <div>
              <strong>How Aster works</strong>
              <small>A short explainer · {formatTime(totalDuration)}</small>
            </div>
          </div>
          <button className="explainer-close" type="button" onClick={onClose} aria-label="Close the explainer video">×</button>
        </header>

        <div className="explainer-body">
          <div className="explainer-screen">
            <span className="explainer-screen-glow" />
            <div className="explainer-stage" key={scene.id}>
              <SceneVisual kind={scene.kind} />
            </div>
            <div className="explainer-caption" key={`${scene.id}-caption`}>
              <h3>{scene.title}</h3>
              <p>{scene.caption}</p>
            </div>
          </div>

          <aside className="explainer-chapters" aria-label="Explainer chapters">
            {scenes.map((item, itemIndex) => <button
              key={item.id}
              type="button"
              className={`explainer-chapter ${itemIndex === index ? "active" : ""} ${itemIndex < index ? "done" : ""}`}
              onClick={() => goTo(itemIndex)}
            >
              <span className="explainer-chapter-no">{String(itemIndex + 1).padStart(2, "0")}</span>
              <span className="explainer-chapter-copy"><strong>{item.title}</strong><small>{formatTime(item.duration)}</small></span>
              <span className="explainer-chapter-bar"><i style={{ transform: `scaleX(${itemIndex < index ? 1 : itemIndex === index ? sceneProgress : 0})` }} /></span>
            </button>)}
          </aside>
        </div>

        <footer className="explainer-controls">
          <button className="explainer-btn" type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous scene">⤺</button>
          <button className="explainer-play" type="button" onClick={() => setPlaying((previous) => !previous)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="explainer-btn" type="button" onClick={() => goTo(index + 1)} disabled={index === scenes.length - 1} aria-label="Next scene">⤻</button>
          <span className="explainer-time">{formatTime(elapsedBefore + elapsed)} / {formatTime(totalDuration)}</span>
          <button className="explainer-track" type="button" onClick={seek} aria-label="Seek through the explainer">
            <span className="explainer-track-fill" style={{ transform: `scaleX(${overall})` }} />
          </button>
          <button className="explainer-btn" type="button" onClick={reset} aria-label="Restart the explainer">↺</button>
        </footer>
      </section>
    </div>
  );
}
