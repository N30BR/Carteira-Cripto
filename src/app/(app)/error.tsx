"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border p-10 text-center">
      <p className="font-medium">Não foi possível carregar esta parte agora.</p>
      <p className="text-sm text-muted-foreground">Pode ter sido uma queda de conexão. Seus dados estão salvos.</p>
      <Button onClick={reset}>Tentar de novo</Button>
    </div>
  );
}
