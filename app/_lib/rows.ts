import type { Category, PaymentMethod, Transaction } from "@/lib/db/types";
import type { TransactionRow } from "@/components/transaction-list";
import type { CategoryOption, PaymentOption } from "@/components/transaction-form";
import { memberName, type Member } from "./context";

export function toRows(
  transactions: Transaction[],
  categories: Category[],
  members: Member[],
  meId: string,
  paymentMethods: PaymentMethod[] = [],
): TransactionRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const methods = new Map(paymentMethods.map((p) => [p.id, p.name]));
  return transactions.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    occurredOn: t.occurred_on,
    memo: t.memo || t.merchant || "",
    categoryName: t.category_id ? (names.get(t.category_id) ?? null) : null,
    authorName: memberName(members, t.created_by, meId),
    paymentMethodName: t.payment_method_id ? (methods.get(t.payment_method_id) ?? null) : null,
  }));
}

export function toOptions(categories: Category[]): CategoryOption[] {
  return categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

export function toPaymentOptions(methods: PaymentMethod[]): PaymentOption[] {
  return methods.filter((m) => !m.archived_at).map((m) => ({ id: m.id, name: m.name, kind: m.kind }));
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
