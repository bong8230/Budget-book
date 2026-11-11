import { notFound } from "next/navigation";
import { getAppContext, memberName } from "@/app/_lib/context";
import { toOptions } from "@/app/_lib/rows";
import { listCategories } from "@/lib/db/queries";
import type { Transaction } from "@/lib/db/types";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { deleteTransactionAction, updateTransactionAction } from "../../actions";

export const metadata = { title: "내역 수정 · 우리집 가계부" };

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user, ledger, members } = await getAppContext();
  const [{ data: tx }, { data: categories }] = await Promise.all([
    db.from("transactions").select("*").eq("id", id).eq("ledger_id", ledger.id).maybeSingle<Transaction>(),
    listCategories(db, ledger.id),
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
      <p className="-mt-2 mb-3 px-1 text-xs text-muted">{memberName(members, tx.created_by, user.id)} 입력</p>
      <TransactionForm
        categories={toOptions(categories ?? [])}
        action={updateTransactionAction}
        hidden={{ id: tx.id }}
        initial={{
          type: tx.type,
          amount: Number(tx.amount),
          occurredOn: tx.occurred_on,
          categoryId: tx.category_id,
          memo: tx.memo,
        }}
      />
    </>
  );
}
