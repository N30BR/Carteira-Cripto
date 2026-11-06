import { cn } from "@/lib/utils";

/** Valor pessoal (dinheiro, total ou quantidade): no modo discreto aparece como "***", na mesma cor. */
export function Priv({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("priv", className)}>{children}</span>;
}
