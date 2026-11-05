import { requireUser } from "@/lib/auth/current";

export default async function DashboardPage() {
  await requireUser();
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
