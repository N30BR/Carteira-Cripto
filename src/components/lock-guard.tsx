"use client";

// Bloqueio por inatividade no navegador. Só a interação REAL conta (mouse, teclado, rolagem, toque); atualizações
// automáticas de gráficos e APIs não. Quem decide de verdade é o servidor (a sessão bloqueada não recebe dados);
// este componente mostra a tela de bloqueio na hora certa, mantém as abas abertas em sincronia e avisa o servidor
// da atividade. O conteúdo da página fica montado (escondido): gráficos, desenhos, zoom e o que não foi salvo
// continuam iguais depois do desbloqueio. O modo privacidade (olho) não é tocado.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { heartbeatMs } from "@/lib/auth/lock-config";
import { LockScreen } from "./lock-screen";

const ACTIVITY_KEY = "bh:activity";
const LOCK_KEY = "bh:lock";
export const LAST_PATH_KEY = "bh:last-path";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export function LockGuard({ lockMinutes, username }: { lockMinutes: number; username: string }) {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lastActivity = useRef(0);
  const lastBeat = useRef(0);
  const pathname = usePathname();
  const lockMs = lockMinutes * 60_000;

  // Página atual (para voltar a ela se for preciso desbloquear pela página /bloqueio).
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_PATH_KEY, window.location.pathname + window.location.search);
    } catch {}
  }, [pathname]);

  const lock = useCallback((broadcast: boolean) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    document.documentElement.setAttribute("data-locked", "");
    if (broadcast) write(LOCK_KEY, `1:${Date.now()}`);
  }, []);

  const unlock = useCallback((broadcast: boolean) => {
    lockedRef.current = false;
    setLocked(false);
    document.documentElement.removeAttribute("data-locked");
    const now = Date.now();
    lastActivity.current = now;
    lastBeat.current = now;
    if (broadcast) {
      write(ACTIVITY_KEY, String(now));
      write(LOCK_KEY, `0:${now}`);
    }
  }, []);

  useEffect(() => {
    const now = Date.now();
    // Outra aba bloqueada agora: esta também abre bloqueada.
    const shared = read(LOCK_KEY);
    lastActivity.current = Math.max(now, Number(read(ACTIVITY_KEY)) || 0);
    lastBeat.current = 0;
    if (shared?.startsWith("1:")) lock(false);

    const beat = () => {
      const t = Date.now();
      if (t - lastBeat.current < heartbeatMs(lockMinutes)) return;
      lastBeat.current = t;
      void fetch("/api/session/heartbeat", { method: "POST", credentials: "same-origin" })
        .then((r) => {
          if (r.status === 423) lock(true);
          // Sessão encerrada: recarga completa (tira da memória da página os dados privados).
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          else if (r.status === 401) window.location.href = "/login";
        })
        .catch(() => {});
    };
    let lastMove = 0;
    const active = () => {
      if (lockedRef.current) return;
      const t = Date.now();
      lastActivity.current = t;
      // Compartilha com as outras abas (no máximo 1 escrita por segundo).
      if (t - lastMove > 1000) {
        lastMove = t;
        write(ACTIVITY_KEY, String(t));
      }
      beat();
    };
    const onMove = () => {
      const t = Date.now();
      if (t - lastMove > 1000) active();
    };
    for (const e of EVENTS) window.addEventListener(e, active, { capture: true, passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });

    // Abas sincronizadas: atividade, bloqueio e desbloqueio feitos em outra aba.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) lastActivity.current = Math.max(lastActivity.current, Number(e.newValue) || 0);
      if (e.key === LOCK_KEY && e.newValue) {
        if (e.newValue.startsWith("1:")) lock(false);
        else if (e.newValue.startsWith("0:") && lockedRef.current) unlock(false);
      }
    };
    window.addEventListener("storage", onStorage);

    // Confere o servidor ao voltar para a aba (ex.: depois de suspender o computador).
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/session/status", { credentials: "same-origin", cache: "no-store" })
        .then(async (r) => {
          // Sessão encerrada: recarga completa (tira da memória da página os dados privados).
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          if (r.status === 401) return void (window.location.href = "/login");
          const body = (await r.json().catch(() => null)) as { locked?: boolean } | null;
          if (body?.locked) lock(true);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    // 0 = bloqueio por inatividade desativado: não há contagem (o servidor também não bloqueia).
    const timer = setInterval(() => {
      if (lockMs > 0 && !lockedRef.current && Date.now() - lastActivity.current >= lockMs) lock(true);
    }, 1000);
    // Primeiro aviso ao abrir a página (a sessão começa a contar daqui).
    beat();
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, active, { capture: true });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, [lock, unlock, lockMs, lockMinutes]);

  if (!locked) return null;
  return (
    <div
      id="bh-lock"
      role="dialog"
      aria-modal="true"
      aria-label="Sessão bloqueada"
      className="fixed inset-0 z-[1000] grid place-items-center overflow-auto bg-black"
    >
      <LockScreen username={username} onUnlocked={() => unlock(true)} />
    </div>
  );
}
