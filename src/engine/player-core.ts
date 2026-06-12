/**
 * Control-flow helpers for the standalone player — extracted from the IIFE
 * so loop lifecycle, pause/resume time accounting, and resize debouncing are
 * unit-testable. Must stay dependency-free within src/engine (bundled into
 * the exported-HTML player by scripts/build-player.ts).
 */

export interface FrameScheduler {
  request(cb: () => void): number;
  cancel(handle: number): void;
}

const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export interface PlayerLoop {
  /** Starts the loop; a running loop is cancelled first (never stacks). */
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * Single-chain animation loop: start() is idempotent-safe (cancels any
 * previous chain) and tick is rescheduled until stop().
 */
export function createPlayerLoop(tick: () => void, scheduler: FrameScheduler = rafScheduler): PlayerLoop {
  let handle = 0;
  let running = false;

  function frame() {
    if (!running) return;
    tick();
    if (running) handle = scheduler.request(frame);
  }

  return {
    start() {
      if (running) scheduler.cancel(handle);
      running = true;
      handle = scheduler.request(frame);
    },
    stop() {
      running = false;
      scheduler.cancel(handle);
    },
    isRunning: () => running,
  };
}

/**
 * Tracks pause periods so scene time doesn't jump after the page was hidden:
 * effective elapsed = (now - startedAt) - total paused duration.
 */
export class PlaybackClock {
  private startedAt: number;
  private pausedAt: number | null = null;
  private pausedTotal = 0;

  constructor(now: number) {
    this.startedAt = now;
  }

  pause(now: number): void {
    if (this.pausedAt === null) this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += now - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** Elapsed activity time in ms, excluding paused periods. */
  elapsed(now: number): number {
    const end = this.pausedAt ?? now;
    return end - this.startedAt - this.pausedTotal;
  }

  restart(now: number): void {
    this.startedAt = now;
    this.pausedAt = null;
    this.pausedTotal = 0;
  }
}

/** Trailing-edge debounce (timer injection for tests). */
export function debounce(
  fn: () => void,
  waitMs: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): () => void {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (handle !== null) timers.clear(handle);
    handle = timers.set(() => {
      handle = null;
      fn();
    }, waitMs);
  };
}

/** The loop runs only when the tab is visible AND the player is on screen. */
export function shouldRun(documentVisible: boolean, intersecting: boolean): boolean {
  return documentVisible && intersecting;
}
