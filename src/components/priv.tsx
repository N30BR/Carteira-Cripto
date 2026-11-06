import { cn } from "@/lib/utils";

/** Valor pessoal: no modo discreto aparece como "***" (ou "●●●●" com `dots`), na mesma cor. */
export function Priv({ children, dots, className }: { children: React.ReactNode; dots?: boolean; className?: string }) {
  return <span className={cn("priv", dots && "priv-dots", className)}>{children}</span>;
}
