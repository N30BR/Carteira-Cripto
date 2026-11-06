/** Estado vazio quando todos os módulos de uma tela fixa (Ativos, Lançamentos) estão desligados. */
export function ModulesEmpty({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {what} estão desligados. Para mostrar de novo, abra <strong>Personalizar abas</strong> (a seta ▾ ao lado do olho, no topo). Seus registros
      continuam guardados.
    </p>
  );
}
