import { notFound } from "next/navigation";
import { getAppContext, memberName } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { listCategories, listPaymentMethods } from "@/lib/db/queries";
import type { Transaction } from "@/lib/db/types";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { deleteTransactionAction, updateTransactionAction } from "../../actions";

export const metadata = { title: "내역 수정 · 우리집 가계부" };

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { db, user, ledger, members } = await getAppContext();
  const [{ data: tx }, { data: categories }, { data: methods }] = await Promise.all([
    db.from("transactions").select("*").eq("id", id).eq("ledger_id", ledger.id).maybeSingle<Transaction>(),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
  ]);
  if (!tx) notFound();

  return (
    <>
      <PageHeader title="내역 수정" back={`/transactions?month=${tx.occurred_on.slice(0, 7)}`}>
        <form action={deleteTransactionAction}>
          <input type="hidden" name="id" value={tx.id} />
          <input type="hidden" name="month" value={tx.occurred_on.slice(0, 7)} />
          <button type="submit" className="text-sm text-expense">
            삭제
          </button>
        </form>
      </PageHeader>
      {error === "delete" && (
        <p role="alert" className="mb-3 rounded-xl bg-surface p-3 text-sm text-expense">
          삭제하지 못했어요. 다시 시도해주세요.
        </p>
      )}
      <p className="-mt-2 mb-3 px-1 text-xs text-muted">{memberName(members, tx.created_by, user.id)} 입력</p>
      <TransactionForm
        categories={toOptions(categories ?? [])}
        paymentMethods={toPaymentOptions(methods ?? [])}
        action={updateTransactionAction}
        hidden={{ id: tx.id }}
        initial={{
          type: tx.type,
          amount: Number(tx.amount),
          occurredOn: tx.occurred_on,
          categoryId: tx.category_id,
          paymentMethodId: tx.payment_method_id,
          memo: tx.memo || tx.merchant || "",
        }}
      />
    </>
  );
}
