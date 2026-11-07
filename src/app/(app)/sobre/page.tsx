/* eslint-disable @next/next/no-img-element -- logo original fixa em /public/brand */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, ChartColumn, CreditCard, Layers, Link2, Plus, SquareCheck, Target } from "lucide-react";
import { getModuleState } from "@/lib/auth/modules";
import type { ModuleKey } from "@/lib/modules";
import "./sobre.css";

export const metadata = { title: "Sobre · BlackHole Dashboard" };

type Card = { label: string; href: string; module: ModuleKey | null; color: string; icon: LucideIcon | "R$" };

// Os oito módulos centrais, em 4 colunas × 2 linhas (como na referência).
const CARDS: Card[] = [
  { label: "Portfólio", href: "/", module: "crypto", color: "#3b82f6", icon: Link2 },
  { label: "R$ / Financeiro", href: "/fiduciario", module: "fiat", color: "#4ade80", icon: "R$" },
  { label: "Faturas", href: "/faturas", module: "invoices", color: "#c084fc", icon: CreditCard },
  { label: "Transações", href: "/transacoes", module: "transactions", color: "#4ade80", icon: ArrowLeftRight },
  { label: "Resumo", href: "/resumo", module: "summary", color: "#3b82f6", icon: ChartColumn },
  { label: "Lançamentos", href: "/lancamentos", module: null, color: "#fb923c", icon: Plus },
  { label: "Ativos", href: "/ativos", module: null, color: "#3b82f6", icon: Layers },
  { label: "Pendências", href: "/pendencias", module: "todos", color: "#c084fc", icon: SquareCheck },
];

// Números pseudoaleatórios fixos: a cena sai igual no servidor e no navegador.
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
const rnd = seeded(42);
const RAIN = Array.from({ length: 16 }, (_, i) => {
  const side = i % 2 === 0 ? "left" : "right";
  const offset = 1 + Math.floor(i / 2) * 2.9 + rnd() * 1.5; // só nas laterais (até ~25% da largura)
  const text = Array.from({ length: 70 }, () => (rnd() > 0.5 ? "1" : "0")).join("");
  return { side, offset, text, duration: 18 + rnd() * 22, delay: -rnd() * 30, opacity: 0.15 + rnd() * 0.6 };
});
const STARS = Array.from({ length: 120 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: rnd() * 1.3 + 0.3, d: rnd() * 4 }));
const GALAXIES = [
  { left: "4%", top: "14%", w: 150, rot: -28 },
  { left: "10%", top: "34%", w: 110, rot: 22 },
  { left: "6%", top: "56%", w: 170, rot: 18 },
  { right: "5%", top: "20%", w: 170, rot: -24 },
  { right: "9%", top: "52%", w: 150, rot: -18 },
  { right: "3%", top: "72%", w: 110, rot: 30 },
];

export default async function AboutPage() {
  const { on } = await getModuleState();

  return (
    <div className={`bh-scene relative left-1/2 -my-8 w-screen max-w-[100vw] -translate-x-1/2`}>
      {/* Fundo: estrelas, chuva de código e galáxias nas laterais */}
      <svg className="bh-stars" aria-hidden preserveAspectRatio="none" viewBox="0 0 100 100">
        {STARS.map((st, i) => (
          <circle
            key={i}
            className={i % 3 === 0 ? "bh-twinkle" : undefined}
            style={{ animationDelay: `${-st.d}s` }}
            cx={st.x}
            cy={st.y}
            r={st.r * 0.08}
            fill="#e9d5ff"
          />
        ))}
      </svg>
      {RAIN.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className="bh-rain"
          style={{ [r.side]: `${r.offset}%`, opacity: r.opacity, animationDuration: `${r.duration}s`, animationDelay: `${r.delay}s` }}
        >
          {r.text}
        </span>
      ))}
      {GALAXIES.map((g, i) => (
        <svg
          key={i}
          aria-hidden
          className={`bh-galaxy hidden md:block`}
          style={{ left: g.left, right: g.right, top: g.top, width: g.w, transform: `rotate(${g.rot}deg)` }}
          viewBox="0 0 200 80"
        >
          <defs>
            <radialGradient id={`gx${i}`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.12" stopColor="#f0abfc" />
              <stop offset="0.45" stopColor="#9333ea" stopOpacity="0.6" />
              <stop offset="1" stopColor="#581c87" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="100" cy="40" rx="98" ry="30" fill={`url(#gx${i})`} />
          <g className="bh-galaxy-spin" fill="none" stroke="#e9d5ff" strokeOpacity="0.45">
            <ellipse cx="100" cy="40" rx="70" ry="20" strokeWidth="0.8" strokeDasharray="30 12" />
            <ellipse cx="100" cy="40" rx="45" ry="13" strokeWidth="0.8" strokeDasharray="18 10" />
          </g>
        </svg>
      ))}

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-4 pb-0 text-center">
        <BlackHole />

        <h1 className="sr-only">Sobre o BlackHole Dashboard</h1>
        <img
          src="/brand/blackhole-wordmark-lg.png"
          alt="BlackHole Dashboard"
          width={698}
          height={151}
          className={`bh-wordmark relative h-auto w-[min(420px,80vw)]`}
        />

        <p className="relative mt-6 max-w-2xl px-6 text-xl leading-snug font-medium text-balance sm:text-[1.7rem]">
          <span aria-hidden className="absolute inset-y-0 left-0 w-2.5 rounded-l-sm border-y-2 border-l-2 border-violet-300/70" />
          Centralize suas informações em um único ponto denso de <span className="bh-accent">dados úteis</span>, claros e{" "}
          <span className="bh-accent">acionáveis</span>.
          <span aria-hidden className="absolute inset-y-0 right-0 w-2.5 rounded-r-sm border-y-2 border-r-2 border-violet-300/70" />
        </p>

        <p className="mt-5 max-w-[38rem] text-sm leading-relaxed text-[#d4d4dc] sm:text-base">
          Uma plataforma pessoal para reunir finanças, ativos, faturas, transações, resumos e rotina em um ambiente único, onde informação dispersa
          se transforma em leitura rápida, contexto e decisão.
        </p>

        <section aria-labelledby="proposito" className={`bh-purpose relative mt-7 flex w-full max-w-2xl items-center gap-5 rounded-2xl bg-black/50 px-6 py-5 text-left`}>
          <Target className="size-11 shrink-0 rounded-full bg-fuchsia-500/10 p-1.5 text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.7)]" strokeWidth={1.8} />
          <span aria-hidden className="h-12 w-px shrink-0 bg-white/25" />
          <div>
            <h2 id="proposito" className="text-lg font-semibold">
              Propósito
            </h2>
            <p className="text-sm leading-snug text-[#d4d4dc] sm:text-[0.95rem]">
              Concentrar sinais essenciais, reduzir fragmentação e converter complexidade em clareza estratégica.
            </p>
          </div>
        </section>

        <section aria-labelledby="modulos" className="mt-8 w-full max-w-3xl">
          <h2 id="modulos" className={`bh-rule justify-center text-xs font-medium tracking-[0.45em] text-[#e4e4e7] uppercase`}>
            Módulos centrais
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CARDS.map((c) => {
              const enabled = c.module === null || on(c.module);
              const Icon = c.icon;
              const body = (
                <>
                  {Icon === "R$" ? (
                    <span className="w-7 text-center text-lg font-bold" style={{ color: c.color }}>
                      R$
                    </span>
                  ) : (
                    <Icon className="size-6 shrink-0" style={{ color: c.color }} strokeWidth={2} />
                  )}
                  <span className="min-w-0 flex-1 text-sm leading-tight font-medium">{c.label}</span>
                </>
              );
              const cls = `bh-card flex min-h-12 py-2 items-center gap-3 rounded-xl px-4 text-left outline-none`;
              return (
                <li key={c.label}>
                  {enabled ? (
                    <Link href={c.href} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <span className={`${cls} opacity-35`} aria-disabled title="Desligado em Personalizar abas">
                      {body}
                      <span className="sr-only">(desligado)</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="filosofia" className="mt-9 flex flex-col items-center">
          <svg aria-hidden viewBox="0 0 48 24" className="h-6 w-12 text-violet-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.9)]">
            <path
              d="M24 12c-4-5-7-8-11-8a8 8 0 0 0 0 16c4 0 7-3 11-8s7-8 11-8a8 8 0 0 1 0 16c-4 0-7-3-11-8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            />
          </svg>
          <h2 id="filosofia" className={`bh-rule mt-2 justify-center text-xs font-medium tracking-[0.45em] text-[#e4e4e7] uppercase`}>
            Filosofia
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#e4e4e7] italic sm:text-base">
            Menos ruído. Mais estrutura. Um painel pessoal, obscuro e funcional, onde múltiplas camadas de informação convergem para um núcleo de
            leitura e ação.
          </p>
        </section>
      </div>

      <GravityWell />
    </div>
  );
}

/** Buraco negro: núcleo escuro, disco de acreção brilhante e anéis orbitais violetas. */
function BlackHole() {
  return (
    <svg className="bh-hole" viewBox="0 0 560 300" aria-hidden>
      <defs>
        <radialGradient id="bh-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0.6" stopColor="#f5d0fe" stopOpacity="0.95" />
          <stop offset="0.72" stopColor="#c084fc" stopOpacity="0.5" />
          <stop offset="1" stopColor="#6b21a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bh-disk" x1="0" x2="1">
          <stop offset="0" stopColor="#7e22ce" stopOpacity="0" />
          <stop offset="0.2" stopColor="#a855f7" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="0.8" stopColor="#a855f7" />
          <stop offset="1" stopColor="#7e22ce" stopOpacity="0" />
        </linearGradient>
        <filter id="bh-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* brilho em volta do núcleo */}
      <circle className="bh-glow" cx="280" cy="140" r="122" fill="url(#bh-halo)" />
      {/* anéis orbitais finos, inclinados */}
      <g fill="none" stroke="#d8b4fe" strokeOpacity="0.55">
        <ellipse cx="280" cy="150" rx="268" ry="50" strokeWidth="1" transform="rotate(-8 280 150)" />
        <ellipse cx="280" cy="150" rx="236" ry="40" strokeWidth="1.2" strokeDasharray="70 18" className="bh-disk" transform="rotate(-8 280 150)" />
      </g>
      {/* disco: metade de trás (atrás do núcleo) */}
      <path d="M100 150 A 180 34 0 0 1 460 150" fill="none" stroke="url(#bh-disk)" strokeWidth="10" opacity="0.55" filter="url(#bh-blur)" transform="rotate(-8 280 150)" />
      {/* núcleo e anel de fótons */}
      <circle cx="280" cy="140" r="74" fill="#000" />
      <circle cx="280" cy="140" r="76" fill="none" stroke="#fae8ff" strokeOpacity="0.85" strokeWidth="2" />
      {/* disco: metade da frente, por cima do núcleo */}
      <g transform="rotate(-8 280 150)">
        <path d="M100 150 A 180 34 0 0 0 460 150" fill="none" stroke="url(#bh-disk)" strokeWidth="16" opacity="0.5" filter="url(#bh-blur)" />
        <path d="M100 150 A 180 34 0 0 0 460 150" fill="none" stroke="url(#bh-disk)" strokeWidth="5" />
        <path className="bh-disk" d="M60 150 A 220 44 0 0 0 500 150" fill="none" stroke="url(#bh-disk)" strokeWidth="2" strokeDasharray="120 20 60 14" opacity="0.85" />
      </g>
    </svg>
  );
}

/** Rodapé: círculos gravitacionais e o feixe de luz violeta. */
function GravityWell() {
  return (
    <svg className="bh-well" viewBox="0 0 1100 220" aria-hidden>
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c084fc" stopOpacity="0" />
          <stop offset="0.7" stopColor="#f5d0fe" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id="core">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.3" stopColor="#e879f9" stopOpacity="0.8" />
          <stop offset="1" stopColor="#7e22ce" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="548" y="0" width="4" height="150" fill="url(#beam)" />
      <ellipse cx="550" cy="160" rx="120" ry="26" fill="url(#core)" opacity="0.8" />
      <g fill="none" stroke="#d8b4fe">
        {[60, 120, 190, 270, 360, 460].map((rx, i) => (
          <ellipse
            key={rx}
            className="bh-ripple"
            style={{ animationDelay: `${i * 0.6}s` }}
            cx="550"
            cy="165"
            rx={rx}
            ry={rx * 0.13}
            strokeWidth={i < 2 ? 2 : 1}
            strokeOpacity={0.9 - i * 0.13}
          />
        ))}
      </g>
    </svg>
  );
}
