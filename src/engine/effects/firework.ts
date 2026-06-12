import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";

const CHAR_AT = "@".codePointAt(0)!;
const CHAR_PLUS = "+".codePointAt(0)!;
const CHAR_DOT = ".".codePointAt(0)!;
const CHAR_STAR = "*".codePointAt(0)!;

interface Particle {
  c: number;
  r: number;
  vc: number;
  vr: number;
  life: number;
  maxLife: number;
  char: number;
  type: "main" | "flash" | "spark";
  color: number;
}

interface Burst {
  particles: Particle[];
  age: number;
}

export class FireworkEffect implements AsciiEffect {
  type = "firework";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private bursts: Burst[] = [];
  private nextSpawn = 3;
  private lastTime = 0;
  private intervalMin = 3;
  private intervalMax = 5;
  private particleCount = 50;
  private maxRadius = 20;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";
  private glowRadius = 18;
  private spawnCounter = 0;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const needsRegen = this.grid.cols === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.intervalMin = (params.intervalMin as number) ?? 3;
    this.intervalMax = (params.intervalMax as number) ?? 5;
    this.particleCount = (params.particleCount as number) ?? 50;
    this.maxRadius = (params.maxRadius as number) ?? 20;
    this.colors = readColorsPacked(params, "#ffcc00");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 18;
    this.grid = grid;

    if (needsRegen) {
      this.bursts = [];
      this.spawnCounter = 0;
      this.nextSpawn = this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }
  }

  update(dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;

    // Detect loop wrap: if time went backward, reset nextSpawn to new time + interval
    if (time < this.lastTime) {
      this.nextSpawn = time + this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }
    this.lastTime = time;

    if (time > this.nextSpawn) {
      this.spawnBurst(cols, rows);
      this.nextSpawn = time + this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.age += dt;
      let alive = false;

      for (const p of burst.particles) {
        p.life += dt;
        if (p.life > p.maxLife) continue;
        alive = true;

        p.c += p.vc * dt;
        p.r += p.vr * dt;
        // Gravity: full on falling sparks, gentle on main/flash so bursts don't hang
        const g = p.type === "spark" ? 3 : p.type === "main" ? 1 : 0.6;
        p.vr += g * dt;

        const t = p.life / p.maxLife;
        const brightness = Math.pow(1 - t, 2);
        const r = Math.round(p.r);
        const c = Math.round(p.c);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const chCode = t < 0.3 ? p.char : t < 0.6 ? CHAR_PLUS : CHAR_DOT;
          // For gradient mode, whole burst shifts color together based on burst age
          const color = this.colorMode === "gradient"
            ? pickColorPacked(this.colors, this.colorMode, 0, Math.min(1, burst.age / 1.5))
            : p.color;
          out.push(r, c, chCode, brightness, color, this.glowRadius);
        }
      }

      if (!alive) {
        this.bursts[i] = this.bursts[this.bursts.length - 1];
        this.bursts.pop();
      }
    }
  }

  private spawnBurst(cols: number, rows: number): void {
    const cx = cols > 16 ? 8 + Math.random() * (cols - 16) : cols / 2;
    const cy = rows > 12 ? 6 + Math.random() * (rows - 12) : rows / 2;
    const particles: Particle[] = [];

    // Pick a burst color (random per burst or per particle)
    const burstIdx = this.colorMode === "random"
      ? Math.floor(Math.random() * this.colors.length)
      : this.spawnCounter;
    const burstColor = pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, burstIdx);
    this.spawnCounter++;

    // Main radial particles
    for (let i = 0; i < this.particleCount; i++) {
      const angle = (Math.PI * 2 * i) / this.particleCount + (Math.random() - 0.5) * 0.3;
      const dist = 0.4 + Math.random() * 0.6;
      const speed = this.maxRadius * dist;
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter + i;
      particles.push({
        c: cx, r: cy,
        vc: Math.cos(angle) * speed,
        vr: Math.sin(angle) * speed * 0.45, // vertical squash
        life: 0,
        maxLife: 0.7 + Math.random() * 1,
        char: CHAR_AT,
        type: "main",
        color: pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      });
    }

    // Core flash
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      particles.push({
        c: cx, r: cy,
        vc: Math.cos(angle) * speed,
        vr: Math.sin(angle) * speed * 0.45,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.3,
        char: CHAR_STAR,
        type: "flash",
        color: burstColor,
      });
    }

    // Falling sparks
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * this.maxRadius * 0.7;
      particles.push({
        c: cx + Math.cos(angle) * dist,
        r: cy + Math.sin(angle) * dist * 0.45,
        vc: (Math.random() - 0.5) * 3,
        vr: 1 + Math.random() * 3,
        life: 0,
        maxLife: 0.8 + Math.random() * 1.2,
        char: CHAR_DOT,
        type: "spark",
        color: burstColor,
      });
    }

    this.bursts.push({ particles, age: 0 });
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "intervalMin", label: "Min interval (s)", type: "slider", min: 0.5, max: 10, step: 0.5, defaultValue: 3 },
      { key: "intervalMax", label: "Max interval (s)", type: "slider", min: 1, max: 20, step: 0.5, defaultValue: 5 },
      { key: "particleCount", label: "Particles", type: "slider", min: 20, max: 100, step: 5, defaultValue: 50 },
      { key: "maxRadius", label: "Radius", type: "slider", min: 8, max: 40, step: 2, defaultValue: 20 },
      ...colorControls("#ffcc00"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 18 },
    ];
  }
}
