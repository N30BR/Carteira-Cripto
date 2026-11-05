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
    <nav ref={navRef} className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm" aria-label="Principal">
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
              "relative shrink-0 rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-muted font-semibold text-foreground after:absolute after:inset-x-3 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-[#8b7cf6]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
