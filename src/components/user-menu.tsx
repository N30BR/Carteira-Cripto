"use client";

import Link from "next/link";
import { BookImage, KeyRound, Keyboard, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(app)/actions";
import { confirmAction } from "@/components/confirm-dialog";

export function UserMenu({ username }: { username: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <span className="priv">{username}</span> ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/conta/senha">
            <KeyRound /> Trocar senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/conta/seguranca">
            <ShieldCheck /> Segurança
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/atalhos">
            <Keyboard /> Atalhos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/referencias">
            <BookImage /> Referências
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const ok = await confirmAction({
              title: "Sair da conta?",
              message: "Tem certeza de que deseja sair do BlackHole Dashboard?",
              confirmLabel: "Sair da conta",
              destructive: false,
            });
            if (ok) await logoutAction();
          }}
        >
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
