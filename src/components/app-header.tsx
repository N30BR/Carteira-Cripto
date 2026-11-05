import Link from "next/link";
import type { SessionUser } from "@/lib/auth/sessions";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";

export function AppHeader({ user }: { user: SessionUser }) {
  const links: { href: string; label: string; title?: string }[] = [
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
        <Link href="/" aria-label="Início">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-label={l.title}
              title={l.title}
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <UserMenu username={user.username} />
        </div>
      </div>
    </header>
  );
}
