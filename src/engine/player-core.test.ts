import { describe, it, expect } from "vitest";
import { createPlayerLoop, PlaybackClock, debounce, shouldRun, type FrameScheduler } from "./player-core";

/** Deterministic scheduler: frames run only when pump() is called. */
function makeScheduler() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const scheduler: FrameScheduler = {
    request(cb) {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    },
    cancel(handle) {
      pending.delete(handle);
    },
  };
  return {
    scheduler,
    pump() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    pendingCount: () => pending.size,
  };
}

describe("createPlayerLoop", () => {
  it("runs a single chain and reschedules after each tick", () => {
    const { scheduler, pump, pendingCount } = makeScheduler();
    let ticks = 0;
    const loop = createPlayerLoop(() => ticks++, scheduler);

    loop.start();
    expect(pendingCount()).toBe(1);
    pump();
    pump();
    expect(ticks).toBe(2);
    expect(pendingCount()).toBe(1);
  });

  it("start() while running never stacks a second chain (the resize bug)", () => {
    const { scheduler, pump, pendingCount } = makeScheduler();
    let ticks = 0;
    const loop = createPlayerLoop(() => ticks++, scheduler);

    loop.start();
    loop.start();
    loop.start();
    expect(pendingCount()).toBe(1); // stacked loops would show 3
    pump();
    expect(ticks).toBe(1);
    expect(pendingCount()).toBe(1);
  });

  it("stop() halts scheduling, even mid-tick", () => {
    const { scheduler, pump, pendingCount } = makeScheduler();
    const loop = createPlayerLoop(() => loop.stop(), scheduler);
    loop.start();
    pump();
    expect(pendingCount()).toBe(0);
    expect(loop.isRunning()).toBe(false);
  });
});

describe("PlaybackClock", () => {
  it("excludes paused periods from elapsed time", () => {
    const clock = new PlaybackClock(1000);
    expect(clock.elapsed(3000)).toBe(2000);

    clock.pause(3000);
    expect(clock.elapsed(10_000)).toBe(2000); // frozen while paused

    clock.resume(10_000);
    expect(clock.elapsed(11_000)).toBe(3000); // 2000 before + 1000 after
  });

  it("double pause/resume calls are idempotent", () => {
    const clock = new PlaybackClock(0);
    clock.pause(100);
    clock.pause(500); // ignored
    clock.resume(1000);
    clock.resume(2000); // ignored
    expect(clock.elapsed(1500)).toBe(600); // 100 active + 500 after resume
  });

  it("restart() zeroes everything", () => {
    const clock = new PlaybackClock(0);
    clock.pause(50);
    clock.restart(5000);
    expect(clock.elapsed(5100)).toBe(100);
  });
});

describe("debounce", () => {
  it("collapses bursts into one trailing call", () => {
    const timers = new Map<number, () => void>();
    let nextId = 1;
    const fakeTimers = {
      set: ((cb: () => void) => {
        const id = nextId++;
        timers.set(id, cb);
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clear: ((id: ReturnType<typeof setTimeout>) => {
        timers.delete(id as unknown as number);
      }) as typeof clearTimeout,
    };

    let calls = 0;
    const fn = debounce(() => calls++, 150, fakeTimers);
    fn();
    fn();
    fn();
    expect(timers.size).toBe(1); // earlier timers cancelled
    for (const cb of [...timers.values()]) cb();
    expect(calls).toBe(1);
  });
});

describe("shouldRun", () => {
  it("requires both visibility and intersection", () => {
    expect(shouldRun(true, true)).toBe(true);
    expect(shouldRun(false, true)).toBe(false);
    expect(shouldRun(true, false)).toBe(false);
    expect(shouldRun(false, false)).toBe(false);
  });
});
