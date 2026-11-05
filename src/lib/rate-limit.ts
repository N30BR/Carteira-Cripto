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
      const list = recent(key, now);
      list.push(now.getTime());
      events.set(key, list);
    },
    limited(key: string, now = new Date()): boolean {
      return recent(key, now).length >= max;
    },
    reset(): void {
      events.clear();
    },
  };
}
