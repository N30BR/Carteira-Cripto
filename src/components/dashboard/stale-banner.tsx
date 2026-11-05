const box = "rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300";

/** Avisos do topo do dashboard: preços indisponíveis, cotação indisponível ou dados antigos. */
export function StaleBanner({
  since,
  now,
  unavailable,
  warning,
}: {
  since: Date | null;
  now: Date;
  unavailable?: boolean;
  warning?: string | null;
}) {
  const messages: string[] = [];
  if (unavailable) messages.push("Preços indisponíveis no momento. Tente de novo em alguns minutos.");
  if (warning) messages.push(warning);
  if (since && !unavailable) {
    const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
    messages.push(`Não foi possível atualizar agora. Dados de ${minutes} min atrás.`);
  }
  if (!messages.length) return null;
  return (
    <div role="status" className={box}>
      {messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}
