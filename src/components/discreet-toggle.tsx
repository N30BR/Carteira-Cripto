"use client";

import { Eye, EyeOff } from "lucide-react";
import { setDiscreet, useDiscreet } from "./discreet-store";

/** Botão de olho no topo: liga/desliga o modo discreto em todas as abas, na hora. */
export function DiscreetToggle() {
  const on = useDiscreet();
  const label = on ? "Mostrar valores" : "Modo discreto";
  return (
    <button
      type="button"
      onClick={() => setDiscreet(!on)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:text-foreground"
    >
      {on ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
