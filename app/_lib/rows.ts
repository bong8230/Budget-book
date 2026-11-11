import type { Category, Transaction } from "@/lib/db/types";
import type { TransactionRow } from "@/components/transaction-list";
import type { CategoryOption } from "@/components/transaction-form";
import { memberName, type Member } from "./context";

export function toRows(transactions: Transaction[], categories: Category[], members: Member[], meId: string): TransactionRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return transactions.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    occurredOn: t.occurred_on,
    memo: t.memo,
    categoryName: t.category_id ? (names.get(t.category_id) ?? null) : null,
    authorName: memberName(members, t.created_by, meId),
  }));
}

export function toOptions(categories: Category[]): CategoryOption[] {
  return categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

export function sumByType(transactions: Pick<Transaction, "type" | "amount">[]) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += Number(t.amount);
    else if (t.type === "expense") expense += Number(t.amount);
  }
  return { income, expense };
}
