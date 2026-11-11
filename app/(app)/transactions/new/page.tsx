import { getAppContext } from "@/app/_lib/context";
import { toOptions } from "@/app/_lib/rows";
import { listCategories } from "@/lib/db/queries";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { createTransactionAction } from "../../actions";

export const metadata = { title: "입력 · 우리집 가계부" };

export default async function NewTransactionPage() {
  const { db, ledger } = await getAppContext();
  const { data: categories } = await listCategories(db, ledger.id);
  return (
    <>
      <PageHeader title="내역 입력" back="/transactions" />
      <TransactionForm categories={toOptions(categories ?? [])} action={createTransactionAction} />
    </>
  );
}
