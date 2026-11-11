import { AddButton, BottomNav } from "@/components/bottom-nav";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getAppContext } from "@/app/_lib/context";
import { listPendingImports } from "@/lib/db/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, ledger } = await getAppContext();
  const { data: pending } = await listPendingImports(db, ledger.id);

  return (
    <>
      <main className="safe-top mx-auto max-w-md px-4 pt-4 pb-28">{children}</main>
      <AddButton />
      <BottomNav pendingCount={pending?.length ?? 0} />
      <RealtimeRefresh ledgerId={ledger.id} />
    </>
  );
}
