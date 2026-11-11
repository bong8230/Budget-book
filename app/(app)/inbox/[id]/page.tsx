import { notFound } from "next/navigation";
import { getAppContext } from "@/app/_lib/context";
import { toOptions } from "@/app/_lib/rows";
import { listCategories } from "@/lib/db/queries";
import type { ImportItem } from "@/lib/db/types";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { acceptImportAction } from "../../actions";

export const metadata = { title: "수정 후 등록 · 우리집 가계부" };

export default async function ReviewImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, ledger } = await getAppContext();
  const [{ data: item }, { data: categories }] = await Promise.all([
    db.from("imports").select("*").eq("id", id).eq("status", "pending").maybeSingle<ImportItem>(),
    listCategories(db, ledger.id),
  ]);
  if (!item) notFound();

  return (
    <>
      <PageHeader title="수정 후 등록" back="/inbox" />
      <p className="mb-3 rounded-xl bg-surface p-3 text-xs break-all whitespace-pre-wrap text-muted">{item.raw_text}</p>
      <TransactionForm
        categories={toOptions(categories ?? [])}
        action={acceptImportAction}
        hidden={{ importId: item.id }}
        submitLabel="등록"
        initial={{
          type: item.type ?? "expense",
          amount: item.amount != null ? Number(item.amount) : 0,
          occurredOn: item.occurred_on ?? undefined,
          memo: item.merchant ?? "",
        }}
      />
    </>
  );
}
