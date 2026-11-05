import { createWindowLimiter } from "@/lib/rate-limit";

export const IP_MAX_FAILURES = 20;
export const IP_WINDOW_MS = 15 * 60 * 1000;

const limiter = createWindowLimiter(IP_MAX_FAILURES, IP_WINDOW_MS);

/**
 * IP do cliente a partir do x-forwarded-for. Os valores da esquerda são enviados pelo
 * próprio cliente e podem ser forjados; o N-ésimo a partir da direita foi acrescentado
 * pelo proxy confiável (N = TRUSTED_PROXY_HOPS).
 */
export function clientIp(xff: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  const parts = (xff ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const n = Math.max(1, Math.floor(hops) || 1);
  return parts.length >= n ? parts[parts.length - n] : parts[0];
}

export function ipLimited(ip: string | null, now = new Date()): boolean {
  return ip !== null && limiter.limited(ip, now);
}

export function recordIpFailure(ip: string | null, now = new Date()): void {
  if (ip !== null) limiter.hit(ip, now);
}

export function resetIpLimits(): void {
  limiter.reset();
}
