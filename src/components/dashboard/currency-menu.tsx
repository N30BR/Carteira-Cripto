"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CURRENCIES, type RefCurrency } from "@/lib/currency";

const LABELS: Record<RefCurrency, string> = { USDT: "USDT (US$)", BTC: "BTC (₿)", BRL: "BRL (R$)" };

/** Menu da moeda de referência; lembra a escolha num cookie do navegador, separado por dashboard. */
export function CurrencyMenu({ current, cookieName }: { current: RefCurrency; cookieName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(value: string) {
    document.cookie = `${cookieName}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const next = new URLSearchParams(params);
    next.set("moeda", value);
    router.push(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Moeda de referência: ${current}`}>
          {current} ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mostrar valores em</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current} onValueChange={choose}>
          {CURRENCIES.map((c) => (
            <DropdownMenuRadioItem key={c} value={c}>
              {LABELS[c]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
