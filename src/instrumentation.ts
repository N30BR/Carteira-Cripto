export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/db/client");
  const { ensureBootstrapAdmin } = await import("@/lib/admin/users");
  await ensureBootstrapAdmin(getDb());
}
