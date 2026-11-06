"use client";

import { useSyncExternalStore } from "react";
import { DISCREET_COOKIE } from "@/lib/discreet";

// Estado do modo discreto no navegador: o atributo data-discreet no <html> (vem do servidor pelo cookie).
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const read = () => document.documentElement.hasAttribute("data-discreet");

/** Liga/desliga em todas as abas na hora e guarda a escolha (cookie, por 1 ano). */
export function setDiscreet(on: boolean) {
  if (on) document.documentElement.dataset.discreet = "";
  else delete document.documentElement.dataset.discreet;
  document.cookie = `${DISCREET_COOKIE}=${on ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  listeners.forEach((fn) => fn());
}

/** Gráficos: esconder valores em dinheiro (eixo, rótulos e dicas) quando o modo discreto está ligado. */
export function useDiscreet(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Texto que substitui um valor escondido. */
export const HIDDEN = "***";
