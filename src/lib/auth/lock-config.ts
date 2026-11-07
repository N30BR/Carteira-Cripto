// Tempos do bloqueio por inatividade (sem dependências: usados no navegador e no servidor).
export const LOCK_OPTIONS = [1, 5, 10, 15, 30] as const;
export type LockMinutes = (typeof LOCK_OPTIONS)[number];
export const DEFAULT_LOCK_MINUTES: LockMinutes = 10;
export const isLockMinutes = (v: unknown): v is LockMinutes => (LOCK_OPTIONS as readonly unknown[]).includes(v);

/** Intervalo dos avisos de atividade do navegador (no máximo 30 s; 1/4 do tempo de bloqueio). */
export const heartbeatMs = (minutes: number) => Math.min(30_000, (minutes * 60_000) / 4);
/** Folga do servidor: um intervalo de aviso + 15 s (rede lenta). O navegador bloqueia antes. */
export const graceMs = (minutes: number) => heartbeatMs(minutes) + 15_000;
