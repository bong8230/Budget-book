import { getAppContext } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { listCategories, listPaymentMethods } from "@/lib/db/queries";
import type { RecurringItem } from "@/lib/db/types";
import { TransactionForm, type TransactionFormValues } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { createTransactionAction } from "../../actions";

export const metadata = { title: "입력 · 우리집 가계부" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ recurring?: string; date?: string }> }) {
  const { recurring: recurringId, date } = await searchParams;
  const { db, ledger } = await getAppContext();
  const [{ data: categories }, { data: methods }, recurring] = await Promise.all([
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
    recurringId && UUID.test(recurringId)
      ? db.from("recurring_items").select("*").eq("id", recurringId).eq("ledger_id", ledger.id).maybeSingle<RecurringItem>()
      : Promise.resolve({ data: null }),
  ]);

  const item = recurring.data;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const initial: Partial<TransactionFormValues> | undefined = item
    ? {
        type: item.type,
        amount: Number(item.amount),
        categoryId: item.category_id,
        paymentMethodId: item.payment_method_id,
        memo: item.name,
        occurredOn: day,
      }
    : day
      ? { occurredOn: day }
      : undefined;

  return (
    <>
      <PageHeader title={item ? `${item.name} 입력` : "내역 입력"} back={item ? "/recurring" : day ? `/transactions?view=calendar&month=${day.slice(0, 7)}&day=${day}` : "/transactions"} />
      <TransactionForm
        categories={toOptions(categories ?? [])}
        paymentMethods={toPaymentOptions(methods ?? [])}
        action={createTransactionAction}
        initial={initial}
        hidden={item ? { back: "/recurring" } : day ? { back: "calendar" } : undefined}
      />
    </>
  );
}
