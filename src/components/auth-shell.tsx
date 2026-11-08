import { Card } from "@/components/ui/card";
import { Logo } from "@/components/logo";

/**
 * Moldura das telas de acesso (login, recuperar e redefinir senha, confirmar e-mail): mesmo fundo, logomarca e cartão.
 * Fundo decorativo (referência login.png): buraco negro no alto, colunas, códigos e anéis. Fixo e cobrindo a tela;
 * no celular corta as laterais e mantém o centro.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center bg-black px-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática já otimizada (WebP) */}
      <img
        src="/login/fundo.webp"
        alt=""
        aria-hidden
        width={1672}
        height={941}
        fetchPriority="high"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover object-[50%_35%] select-none"
      />
      {/* Logo logo abaixo do buraco negro e formulário no centro, como na referência. Em telas baixas
          (ou com o teclado do celular aberto) a página rola e nada fica fora de alcance. */}
      <div className="flex w-full max-w-sm flex-col items-center gap-7 pt-[max(2rem,32.6dvh)] pb-10">
        <Logo />
        <Card className="w-full rounded-2xl border border-[#8b5cf6]/35 bg-[#0b0712]/90 shadow-[0_0_48px_-12px_rgba(139,92,246,0.55)] backdrop-blur-sm">
          {children}
        </Card>
      </div>
    </main>
  );
}

/** Link textual discreto das telas de acesso (ex.: "Esqueceu a senha", "Voltar ao login"). */
export const authLinkClass =
  "self-center rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
