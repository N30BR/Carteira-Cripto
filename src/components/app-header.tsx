import Link from "next/link";
import type { SessionUser } from "@/lib/auth/sessions";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";
import { DiscreetToggle } from "@/components/discreet-toggle";
import { ModulesMenu } from "@/components/modules-menu";
import type { ModuleKey } from "@/lib/modules";

export function AppHeader({ user, disabled }: { user: SessionUser; disabled: ModuleKey[] }) {
  // Módulos desligados em "Personalizar abas" somem; Lançamentos e Ativos ficam sempre; Admin só para administradores.
  const mod = (key: ModuleKey, item: NavItem): NavItem[] => (disabled.includes(key) ? [] : [item]);
  const links: NavItem[] = [
    ...mod("crypto", { href: "/", label: "Cripto" }),
    ...mod("fiat", { href: "/fiduciario", label: "R$", title: "Dashboard fiduciário" }),
    ...mod("invoices", { href: "/faturas", label: "Faturas" }),
    ...mod("transactions", { href: "/transacoes", label: "Transações" }),
    ...mod("summary", { href: "/resumo", label: "Resumo" }),
    ...mod("charts", { href: "/graficos", label: "Gráficos" }),
    ...mod("news", { href: "/noticias", label: "Notícias" }),
    { href: "/lancamentos", label: "Lançamentos" },
    { href: "/ativos", label: "Ativos" },
    ...mod("todos", { href: "/pendencias", label: "Pendências" }),
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="border-b border-border/60 bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:h-14 md:flex-nowrap md:py-0">
        <Link href="/sobre" aria-label="Sobre o BlackHole Dashboard" className="shrink-0">
          <Logo />
        </Link>
        <div className="order-last w-full md:order-none md:w-auto md:min-w-0">
          <NavLinks items={links} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ModulesMenu disabled={disabled} />
          <DiscreetToggle />
          <UserMenu username={user.username} />
        </div>
      </div>
    </header>
  );
}
