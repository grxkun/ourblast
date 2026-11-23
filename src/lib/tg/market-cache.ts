// SPDX-License-Identifier: BUSL-1.1
/** Per-isolate snapshots; only a runtime-retained refresh may outlive its request. */
export class MarketCache<K, V> {
  private snapshots = new Map<K, { value: V; updatedAt: number }>();
  private pending = new Map<K, Promise<{ value: V; updatedAt: number }>>();

  constructor(private ttl: number, private maxAge: number, private now = Date.now) {}

  async read(key: K, load: () => Promise<V>, retain?: (work: Promise<unknown>) => void) {
    const own = this.snapshots.get(key);
    if (own && this.now() - own.updatedAt < this.ttl) return { ...own, refreshing: false };
    const fallback = own ?? [...this.snapshots.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    let job = this.pending.get(key);
    if (!job) {
      job = load().then((value) => {
        const snapshot = { value, updatedAt: this.now() };
        this.snapshots.set(key, snapshot);
        return snapshot;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    if (fallback && this.now() - fallback.updatedAt < this.maxAge && retain) {
      retain(job.catch(() => undefined));
      return { ...fallback, refreshing: true };
    }
    return { ...await job, refreshing: false };
  }
}

/** Avoid queueing hundreds of outbound connections in one Worker invocation. */
export async function marketPool<T>(items: T[], slots: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(slots, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await run(item);
    }
  }));
}