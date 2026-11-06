"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Imagem de referência num painel do app; clicar amplia (fecha com X, Esc ou clique fora).
 * A figura não é recortada nem recolorida: só o contêiner segue o visual do dashboard.
 */
export function ReferenceImage({ src, alt, width, height, caption }: { src: string; alt: string; width: number; height: number; caption?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <figure className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar: ${alt}`}
        className="group relative overflow-hidden rounded-xl border bg-card p-2 transition-colors hover:border-[#8b7cf6]/60 focus-visible:border-[#8b7cf6] focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo estático já otimizado (WebP), sem o otimizador do Next */}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" className="h-auto w-full rounded-lg" />
        <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="size-4" />
        </span>
      </button>
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[96vh] w-auto max-w-[96vw] overflow-auto p-3 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- mesma imagem, na resolução original */}
          <img src={src} alt={alt} width={width} height={height} className="h-auto max-h-[90vh] w-auto max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </figure>
  );
}
