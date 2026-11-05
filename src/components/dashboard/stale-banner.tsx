export function StaleBanner({ since, now, unavailable }: { since: Date | null; now: Date; unavailable?: boolean }) {
  if (unavailable) {
    return (
      <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
        Preços indisponíveis no momento. Tente de novo em alguns minutos.
      </div>
    );
  }
  if (!since) return null;
  const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
  return (
    <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
      Não foi possível atualizar os preços agora. Preços de {minutes} min atrás.
    </div>
  );
}
