// Request-scoped "after the response" work (Cloudflare ctx.waitUntil), so bookkeeping never delays or breaks the reply.
import { AsyncLocalStorage } from 'node:async_hooks';

type Wait = (p: Promise<unknown>) => void;
const store = new AsyncLocalStorage<Wait>();

export function withAfterResponse<T>(waitUntil: Wait | null, fn: () => T): T {
  return waitUntil ? store.run(waitUntil, fn) : fn();
}

/** Runs `task` on a later tick; any synchronous throw or rejection is only logged under `label`. */
export function runAfterResponse(task: () => unknown, label: string): void {
  const safe = Promise.resolve().then(task).catch(() => console.error(label));
  try { store.getStore()?.(safe); } catch { /* request already finished: the promise still settles on its own */ }
}
