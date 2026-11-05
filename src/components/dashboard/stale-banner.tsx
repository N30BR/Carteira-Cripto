export function StaleBanner({ since, now }: { since: Date | null; now: Date }) {
  if (!since) return null;
  const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
  return (
    <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
      Não foi possível atualizar os preços agora. Preços de {minutes} min atrás.
    </div>
  );
}
