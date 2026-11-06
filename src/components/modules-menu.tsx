"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setModulesAction } from "@/app/(app)/modules-actions";
import { MODULES, moduleForPath, type ModuleKey } from "@/lib/modules";
import { safeAction } from "@/lib/safe-action";

/**
 * Seta ▾ ao lado do olho: liga/desliga módulos (só a visibilidade; o olho cuida da privacidade).
 * Desligar não apaga nada; a escolha fica salva na conta.
 */
export function ModulesMenu({ disabled: initial }: { disabled: ModuleKey[] }) {
  const [disabled, setDisabled] = useState(initial);
  const [, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  function toggle(key: ModuleKey, on: boolean) {
    const next = on ? disabled.filter((k) => k !== key) : [...disabled, key];
    const before = disabled;
    setDisabled(next);
    start(async () => {
      const r = await safeAction(() => setModulesAction(next));
      if (!r.ok) {
        setDisabled(before);
        toast.error(r.error);
        return;
      }
      // Estava na aba que acabou de desligar: vai para uma aba ativa.
      const here = moduleForPath(pathname);
      if (here && r.disabled.includes(here)) router.replace(r.fallback);
      else router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Personalizar abas"
          title="Personalizar abas"
          className="grid h-9 w-6 place-items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ▾
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Personalizar abas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODULES.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.key}
            checked={!disabled.includes(m.key)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(v) => toggle(m.key, v === true)}
          >
            {m.menuLabel}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Lançamentos e Ativos ficam sempre visíveis. Desligar só esconde: nenhum registro é apagado.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
