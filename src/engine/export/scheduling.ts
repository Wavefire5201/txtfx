/**
 * Yields one macrotask so queued events (cancel messages, UI work) can run.
 * MessageChannel avoids setTimeout's nested-timeout clamp (~4ms), which adds
 * up to whole seconds over a few hundred export frames.
 *
 * CRITICAL for worker cancellation: encode loops that only await microtasks
 * never let the worker's onmessage fire, making cancel undeliverable.
 */
export function macrotaskYield(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
