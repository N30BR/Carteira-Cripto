import { getModuleState } from "@/lib/auth/modules";
import { shortcutSections } from "@/lib/shortcuts";
import { ShortcutsView } from "./shortcuts-view";

export const metadata = { title: "Atalhos · BlackHole Dashboard" };

/** Atalhos de teclado (aberta pelo menu de perfil). Só mostra seções com atalhos e módulos ligados. */
export default async function ShortcutsPage() {
  const { disabled } = await getModuleState();
  const sections = shortcutSections(disabled).map((s) => ({
    id: s.id,
    label: s.label,
    shortcuts: s.shortcuts.map(({ id, keys, action, description, when }) => ({ id, keys, action, description, when })),
  }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Atalhos de Teclado</h1>
        <p className="text-sm text-muted-foreground">Consulte os comandos disponíveis para navegar e utilizar as funcionalidades do BlackHole Dashboard.</p>
      </div>
      <ShortcutsView sections={sections} />
    </div>
  );
}
