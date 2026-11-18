"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { claimStartupIntro } from "@/app/lib/startupIntro.mjs";

type Props = { children: React.ReactNode };

// Slower premium timing
const INTRO_DURATION_MS = 6200;

export default function IntroGate({ children }: Props) {
  const [showIntro, setShowIntro] = useState<boolean|null>(null);
  const decision = useRef<boolean|null>(null);

  const audioSrc = useMemo(() => "/splash-chime.mp3", []);
  const oImgSrc = useMemo(() => "/logo-o.png", []); // ✅ matches your /public file

  useEffect(() => {
    if (decision.current === null) {
      let storage;
      try { storage = window.sessionStorage; } catch {}
      decision.current = claimStartupIntro(storage);
    }
    setShowIntro(decision.current);
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    const t = setTimeout(() => setShowIntro(false), INTRO_DURATION_MS);
    return () => clearTimeout(t);
  }, [showIntro]);

  useEffect(() => {
  if (!showIntro) return;

  const audio = new Audio("/splash-chime.mp3");
  audio.volume = 0.55;
  audio.preload = "auto";
  let disposed = false;
  const onFirstTouch = async () => {
    if (disposed) return;
    try { await audio.play(); } catch {}
  };

  const tryPlay = async () => {
    try {
      await audio.play();
    } catch {
      // Wait for first user interaction
      if (!disposed) window.addEventListener("pointerdown", onFirstTouch, { once: true });
    }
  };

  // Slight delay = feels premium
  const t = setTimeout(tryPlay, 420);

  return () => {
    disposed = true;
    window.removeEventListener("pointerdown", onFirstTouch);
    clearTimeout(t);
    audio.pause();
    audio.currentTime = 0;
  };
}, [showIntro]);


  if (showIntro === null) return null;
  if (!showIntro) return <>{children}</>;

  return (
    <div className="neosplash">
      <div className="neosplash-wrap">
        <div className="neosplash-word" aria-label="NeoLearn">
          <span className="neo-ne">Ne</span>

          <span className="neo-o" aria-hidden="true">
            <span className="neo-o-pulse" />
            <span className="neo-o-glow" />
            <span className="neo-o-shine" />
            <img className="neo-o-img" src={oImgSrc} alt="O" draggable={false} />
          </span>

          <span className="neo-learn">Learn</span>
        </div>

        <div className="neosplash-tagline">The Future of Learning</div>
        <div className="neosplash-skip">Loading...</div>
      </div>
    </div>
  );
}

