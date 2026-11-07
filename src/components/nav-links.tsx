"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; title?: string };

/** Abas do menu; a aba da página atual fica destacada. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // No celular o menu rola de lado: mantém a aba atual visível.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav ref={navRef} className="flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Principal">
      {items.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-label={l.title}
            title={l.title}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-md px-1.5 py-1.5 transition-colors xl:px-2",
              // Cor do texto: o roxo do disco da logomarca (referência corbarra.png); o resto do estilo não muda.
              active
                ? "bg-muted font-semibold text-[#a888c0] after:absolute after:inset-x-2 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-[#8b7cf6]"
                : "text-[#a888c0] hover:bg-muted hover:text-[#cdb8e6]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
