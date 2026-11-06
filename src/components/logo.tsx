/* eslint-disable @next/next/no-img-element -- imagens fixas e pequenas, já no tamanho certo em /public/brand */

/** Marca BlackHole Dashboard: o buraco negro com as estrelas e a escrita. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/brand/blackhole-icon.png" alt="" width={32} height={32} className="size-8 rounded-md" />
      <img src="/brand/blackhole-wordmark.png" alt="BlackHole Dashboard" width={153} height={32} className="h-8 w-auto" />
    </div>
  );
}
