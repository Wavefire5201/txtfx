"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkle, Lightning, FilmStrip } from "@phosphor-icons/react";

const DEMO_CHARS = " .`,:;cbaO0%#@";
const STAR_CHARS = [" ", ".", "+", "*"];

function useAsciiDemo() {
  const canvasRef = useRef<HTMLPreElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const cols = 60;
    const rows = 20;

    // Generate a gradient pattern
    const baseGrid: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = cols / 2;
        const cy = rows / 2;
        const dx = (c - cx) / cols;
        const dy = (r - cy) / rows;
        const dist = Math.sqrt(dx * dx + dy * dy);
        baseGrid.push(Math.max(0, Math.min(1, 1 - dist * 2.5)));
      }
    }

    // Stars
    const stars = Array.from({ length: 30 }, () => ({
      c: Math.floor(Math.random() * cols),
      r: Math.floor(Math.random() * rows),
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2,
    }));

    const start = performance.now();
    function loop() {
      const t = (performance.now() - start) / 1000;
      let text = "";

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wave = Math.sin(c * 0.15 + t * 0.8) * 0.1 + Math.sin(r * 0.2 + t * 0.5) * 0.1;
          const val = Math.max(0, Math.min(1, baseGrid[r * cols + c] + wave));
          text += DEMO_CHARS[Math.floor(val * (DEMO_CHARS.length - 1))];
        }
        text += "\n";
      }

      // Overlay stars
      const lines = text.split("\n").map((l) => [...l]);
      for (const s of stars) {
        const pulse = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        if (pulse > 0.3 && s.r < lines.length && s.c < (lines[s.r]?.length ?? 0)) {
          const idx = Math.min(Math.floor(pulse * STAR_CHARS.length), STAR_CHARS.length - 1);
          lines[s.r][s.c] = STAR_CHARS[idx];
        }
      }

      if (el) {
        el.textContent = lines.map((l) => l.join("")).join("\n");
      }
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return canvasRef;
}

export default function LandingPage() {
  const demoRef = useAsciiDemo();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="landing">
      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-bg">
          <pre
            ref={demoRef}
            className="landing-ascii-demo"
          />
          <div className="landing-hero-fade" />
        </div>

        <nav className="landing-nav">
          <span className="landing-logo">txtfx</span>
          <div className="landing-nav-spacer" />
          <Link href="/editor" className="landing-nav-link">
            Editor
          </Link>
        </nav>

        <div className="landing-hero-content">
          <h1 className="landing-title">
            Animated ASCII effects<br />over your photographs
          </h1>
          <p className="landing-subtitle">
            Composite character-based visual effects on any image.
            Twinkle, rain, fire, matrix rain, and more -- all rendered in real-time ASCII art.
          </p>
          <div className="landing-cta-row">
            <Link href="/editor" className="landing-cta">
              Open Editor
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <div className="landing-features-grid">
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <Sparkle size={24} />
            </div>
            <h3 className="landing-feature-title">12 Built-in Effects</h3>
            <p className="landing-feature-desc">
              From twinkling stars to matrix rain, fire, snow, meteors, and glitch effects.
              Each fully configurable with real-time parameter controls.
            </p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <Lightning size={24} />
            </div>
            <h3 className="landing-feature-title">Mask-based Compositing</h3>
            <p className="landing-feature-desc">
              Paint foreground and background regions to control exactly where
              effects appear. Feathered edges for smooth transitions.
            </p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <FilmStrip size={24} />
            </div>
            <h3 className="landing-feature-title">Timeline & Export</h3>
            <p className="landing-feature-desc">
              Full timeline with playback controls. Export as standalone HTML,
              embeddable snippets, or scene files for later editing.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      {mounted && (
        <footer className="landing-footer">
          <span className="landing-footer-logo">txtfx</span>
          <span className="landing-footer-sep">--</span>
          <span className="landing-footer-text">ASCII art effects engine</span>
        </footer>
      )}
    </div>
  );
}
