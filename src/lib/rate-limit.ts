const SWEEP_ABOVE = 1000;

/** Conta eventos por chave numa janela deslizante, em memória. */
export function createWindowLimiter(max: number, windowMs: number) {
  const events = new Map<string, number[]>();

  function recent(key: string, now: Date): number[] {
    const cutoff = now.getTime() - windowMs;
    const list = (events.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) events.set(key, list);
    else events.delete(key);
    return list;
  }

  return {
    hit(key: string, now = new Date()): void {
      // Chaves que nunca voltam (ex.: IPs) seriam guardadas para sempre; limpa quando cresce.
      if (events.size > SWEEP_ABOVE) for (const k of [...events.keys()]) recent(k, now);
      const list = recent(key, now);
      list.push(now.getTime());
      events.set(key, list);
    },
    limited(key: string, now = new Date()): boolean {
      return recent(key, now).length >= max;
    },
    clear(key: string): void {
      events.delete(key);
    },
    clearPrefix(prefix: string): void {
      for (const k of [...events.keys()]) if (k.startsWith(prefix)) events.delete(k);
    },
    reset(): void {
      events.clear();
    },
    size(): number {
      return events.size;
    },
  };
}
