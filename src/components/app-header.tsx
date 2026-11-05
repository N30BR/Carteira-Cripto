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
    { href: "/lancamentos", label: "Lançamentos" },
    { href: "/ativos", label: "Ativos" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" aria-label="Início" className="shrink-0">
          <Logo />
        </Link>
        <NavLinks items={links} />
        <div className="ml-auto shrink-0">
          <UserMenu username={user.username} />
        </div>
      </div>
    </header>
  );
}
