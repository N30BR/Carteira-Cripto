// Fundo espacial das páginas (referência fundo.png): fica numa camada fixa ATRÁS de tudo,
// então só aparece nos espaços vazios; cartões, tabelas e gráficos mantêm o próprio fundo.
// Mesma cena da página Sobre (estrelas, chuva de código e galáxias), em versão mais discreta.

// Números pseudoaleatórios fixos: a cena sai igual no servidor e no navegador.
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
const rnd = seeded(7);
// Chuva só na faixa das margens (até ~9% da largura de cada lado).
const RAIN = Array.from({ length: 12 }, (_, i) => {
  const side = i % 2 === 0 ? "left" : "right";
  const offset = 0.6 + Math.floor(i / 2) * 1.5 + rnd() * 0.8;
  const text = Array.from({ length: 70 }, () => (rnd() > 0.5 ? "1" : "0")).join("");
  return { side, offset, text, duration: 22 + rnd() * 22, delay: -rnd() * 30, opacity: 0.12 + rnd() * 0.4 };
});
const STARS = Array.from({ length: 90 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: rnd() * 1.2 + 0.3, d: rnd() * 4 }));
const GALAXIES = [
  { left: "1.5%", top: "18%", w: 120, rot: -28 },
  { left: "3%", top: "58%", w: 140, rot: 18 },
  { right: "1.5%", top: "26%", w: 140, rot: -24 },
  { right: "3%", top: "70%", w: 110, rot: 30 },
];

export function SpaceBackdrop() {
  return (
    <div className="bh-backdrop" aria-hidden>
      <svg className="bh-stars" preserveAspectRatio="none" viewBox="0 0 100 100">
        {STARS.map((st, i) => (
          <circle
            key={i}
            className={i % 3 === 0 ? "bh-twinkle" : undefined}
            style={{ animationDelay: `${-st.d}s` }}
            cx={st.x}
            cy={st.y}
            r={st.r * 0.07}
            fill="#e9d5ff"
            fillOpacity={0.7}
          />
        ))}
      </svg>
      {RAIN.map((r, i) => (
        <span
          key={i}
          className="bh-rain bh-side"
          style={{ [r.side]: `${r.offset}%`, opacity: r.opacity, animationDuration: `${r.duration}s`, animationDelay: `${r.delay}s` }}
        >
          {r.text}
        </span>
      ))}
      {GALAXIES.map((g, i) => (
        <svg
          key={i}
          className="bh-galaxy bh-side"
          style={{ left: g.left, right: g.right, top: g.top, width: g.w, transform: `rotate(${g.rot}deg)` }}
          viewBox="0 0 200 80"
        >
          <defs>
            <radialGradient id={`bgx${i}`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.12" stopColor="#f0abfc" />
              <stop offset="0.45" stopColor="#9333ea" stopOpacity="0.6" />
              <stop offset="1" stopColor="#581c87" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="100" cy="40" rx="98" ry="30" fill={`url(#bgx${i})`} />
          <g className="bh-galaxy-spin" fill="none" stroke="#e9d5ff" strokeOpacity="0.45">
            <ellipse cx="100" cy="40" rx="70" ry="20" strokeWidth="0.8" strokeDasharray="30 12" />
            <ellipse cx="100" cy="40" rx="45" ry="13" strokeWidth="0.8" strokeDasharray="18 10" />
          </g>
        </svg>
      ))}
    </div>
  );
}
