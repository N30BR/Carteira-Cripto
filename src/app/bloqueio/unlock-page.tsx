"use client";

import { useRouter } from "next/navigation";
import { LockScreen } from "@/components/lock-screen";
import { LAST_PATH_KEY } from "@/components/lock-guard";

/** Depois de desbloquear, volta para a página em que a pessoa estava (só caminhos do próprio site). */
export function UnlockPage({ username }: { username: string }) {
  const router = useRouter();
  return (
    <LockScreen
      username={username}
      onUnlocked={() => {
        let back = "/";
        try {
          const p = sessionStorage.getItem(LAST_PATH_KEY);
          if (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/bloqueio")) back = p;
        } catch {}
        try {
          localStorage.setItem("bh:lock", `0:${Date.now()}`);
          localStorage.setItem("bh:activity", String(Date.now()));
        } catch {}
        router.replace(back);
        router.refresh();
      }}
    />
  );
}
