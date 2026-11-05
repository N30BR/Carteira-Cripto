import Link from "next/link";
import type { SessionUser } from "@/lib/auth/sessions";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";

export function AppHeader({ user }: { user: SessionUser }) {
  const links: NavItem[] = [
    { href: "/", label: "Cripto" },
    { href: "/fiduciario", label: "R$", title: "Dashboard fiduciário" },
    { href: "/faturas", label: "Faturas" },
    { href: "/transacoes", label: "Transações" },
    { href: "/resumo", label: "Resumo" },
    { href: "/lancamentos", label: "Lançamentos" },
    { href: "/pendencias", label: "Pendências" },
    { href: "/ativos", label: "Ativos" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:h-14 md:flex-nowrap md:py-0">
        <Link href="/" aria-label="Início" className="shrink-0">
          <Logo />
        </Link>
        <div className="order-last w-full md:order-none md:w-auto md:min-w-0">
          <NavLinks items={links} />
        </div>
        <div className="ml-auto shrink-0">
          <UserMenu username={user.username} />
        </div>
      </div>
    </header>
  );
}
