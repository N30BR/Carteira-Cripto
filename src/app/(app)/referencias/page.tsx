import { ReferenceImage } from "./reference-image";

export const metadata = { title: "Referências · BlackHole Dashboard" };

/** Material visual de consulta (aberto pelo menu de perfil). As imagens ficam em public/referencias. */
export default function ReferencesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Referências</h1>
        <p className="text-sm text-muted-foreground">Material visual de consulta para análise gráfica e interpretação de estruturas de mercado.</p>
      </div>

      <section aria-labelledby="ref-elliott" className="flex flex-col gap-3">
        <h2 id="ref-elliott" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-4 w-1 rounded-full bg-[#8b7cf6]" aria-hidden />
          Ondas de Elliott
        </h2>
        <ReferenceImage
          src="/referencias/ondas-de-elliott.webp"
          width={1536}
          height={1024}
          alt="Ondas de Elliott: impulso (1-2-3-4-5), correção (A-B-C), triângulo (A-B-C-D-E), duplo combinado (W-X-Y) e triplo combinado (W-X-Y-X-Z)"
        />
      </section>

      <section aria-labelledby="ref-wyckoff" className="flex flex-col gap-3">
        <h2 id="ref-wyckoff" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-4 w-1 rounded-full bg-[#8b7cf6]" aria-hidden />
          Método Wyckoff
        </h2>
        {/* Uma embaixo da outra, na largura toda: os textos menores das figuras continuam legíveis. */}
        <div className="flex flex-col gap-6">
          <ReferenceImage
            src="/referencias/wyckoff-1.webp"
            width={1448}
            height={1086}
            caption="1. Acumulação, fases A–E, Spring e Distribuição"
            alt="Wyckoff, leitura simples: acumulação, fases A a E, spring e distribuição"
          />
          <ReferenceImage
            src="/referencias/wyckoff-2.webp"
            width={1448}
            height={1086}
            caption="2. Zona de acumulação, manipulação (Spring) e zona de distribuição"
            alt="Wyckoff: zona de acumulação, manipulação (spring), zona de distribuição e resumo"
          />
        </div>
      </section>
    </div>
  );
}
