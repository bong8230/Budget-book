import { notFound } from "next/navigation";
import { getAppContext } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { listCategories, listPaymentMethods } from "@/lib/db/queries";
import type { ImportItem } from "@/lib/db/types";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { acceptImportAction } from "../../actions";

export const metadata = { title: "수정 후 등록 · 우리집 가계부" };

export default async function ReviewImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db, ledger } = await getAppContext();
  const [{ data: item }, { data: categories }, { data: methods }] = await Promise.all([
    db.from("imports").select("*").eq("id", id).eq("status", "pending").maybeSingle<ImportItem>(),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
  ]);
  if (!item) notFound();

  return (
    <>
      <PageHeader title="수정 후 등록" back="/inbox" />
      <p className="mb-3 rounded-xl bg-surface p-3 text-xs break-all whitespace-pre-wrap text-muted">{item.raw_text}</p>
      <TransactionForm
        categories={toOptions(categories ?? [])}
        paymentMethods={toPaymentOptions(methods ?? [])}
        action={acceptImportAction}
        hidden={{ importId: item.id, merchant: item.merchant ?? "" }}
        submitLabel="등록"
        initial={{
          type: item.type ?? "expense",
          amount: item.amount != null ? Number(item.amount) : 0,
          occurredOn: item.occurred_on ?? undefined,
          categoryId: item.category_id,
          paymentMethodId: item.payment_method_id,
          memo: item.merchant ?? "",
        }}
      />
    </>
  );
}
