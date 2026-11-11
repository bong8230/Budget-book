"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyLedger } from "@/lib/push/notify";
import { formatSigned } from "@/components/format";
import { getAppContext } from "@/app/_lib/context";
import {
  acceptImport,
  addTransaction,
  createInvite,
  deleteTransaction,
  ignoreImport,
  setDisplayName,
  setMonthlyBudget,
  updateTransaction,
} from "@/lib/db/queries";
import type { TransactionType } from "@/lib/db/types";
import type { FormState } from "@/components/transaction-form";

const TYPES: TransactionType[] = ["income", "expense", "transfer"];
const MAX_AMOUNT = 9_999_999_999;

function readTransaction(formData: FormData) {
  const type = String(formData.get("type")) as TransactionType;
  const amount = Number(formData.get("amount"));
  const occurredOn = String(formData.get("occurredOn") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 200);

  if (!TYPES.includes(type)) return { error: "거래 종류를 골라주세요" } as const;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: "금액을 입력해주세요" } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: "날짜를 확인해주세요" } as const;
  return { value: { type, amount, occurredOn, categoryId: type === "transfer" ? null : categoryId, memo } } as const;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function createTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { db, user, ledger, members } = await getAppContext();
  const v = parsed.value;
  const { error } = await addTransaction(db, {
    ledger_id: ledger.id,
    type: v.type,
    amount: v.amount,
    occurred_on: v.occurredOn,
    category_id: v.categoryId,
    memo: v.memo,
    created_by: user.id,
  });
  if (error) return { error: "저장하지 못했어요. 다시 시도해주세요" };
  const me = members.find((m) => m.userId === user.id)?.name ?? "배우자";
  after(() =>
    notifyLedger(ledger.id, user.id, {
      title: `${me}님이 내역을 입력했어요`,
      body: `${formatSigned(v.amount, v.type)}${v.memo ? ` · ${v.memo}` : ""}`,
      url: `/transactions?month=${v.occurredOn.slice(0, 7)}`,
    }).catch(() => {}),
  );
  refreshAll();
  redirect(`/transactions?month=${v.occurredOn.slice(0, 7)}`);
}

export async function updateTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { db } = await getAppContext();
  const v = parsed.value;
  const { error } = await updateTransaction(db, id, {
    type: v.type,
    amount: v.amount,
    occurred_on: v.occurredOn,
    category_id: v.categoryId,
    memo: v.memo,
  });
  if (error) return { error: "수정하지 못했어요. 다시 시도해주세요" };
  refreshAll();
  redirect(`/transactions?month=${v.occurredOn.slice(0, 7)}`);
}

export async function deleteTransactionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const { db } = await getAppContext();
  await deleteTransaction(db, id);
  refreshAll();
  redirect(/^\d{4}-\d{2}$/.test(month) ? `/transactions?month=${month}` : "/transactions");
}

/** 확인 대기 내역을 (수정한 값으로) 등록 */
export async function acceptImportAction(_: FormState, formData: FormData): Promise<FormState> {
  const importId = String(formData.get("importId") ?? "");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { db } = await getAppContext();
  const v = parsed.value;
  const { error } = await acceptImport(db, importId, {
    type: v.type,
    amount: v.amount,
    date: v.occurredOn,
    categoryId: v.categoryId ?? undefined,
    memo: v.memo,
  });
  if (error) return { error: "등록하지 못했어요. 이미 처리된 내역일 수 있어요" };
  refreshAll();
  redirect("/inbox");
}

/** 수정 없이 바로 등록 */
export async function quickAcceptImportAction(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  const { db } = await getAppContext();
  await acceptImport(db, importId);
  refreshAll();
}

export async function ignoreImportAction(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  const { db } = await getAppContext();
  await ignoreImport(db, importId);
  refreshAll();
}

export async function setBudgetAction(_: FormState, formData: FormData): Promise<FormState> {
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^\d]/g, ""));
  const month = String(formData.get("month") ?? "");
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT) return { error: "금액을 확인해주세요" };
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "월을 확인해주세요" };
  const { db, ledger } = await getAppContext();
  const { error } = await setMonthlyBudget(db, ledger.id, `${month}-01`, amount);
  if (error) return { error: "예산을 저장하지 못했어요" };
  refreshAll();
  return {};
}

export async function createInviteAction(): Promise<{ code?: string; error?: string }> {
  const { db, ledger } = await getAppContext();
  const { data, error } = await createInvite(db, ledger.id);
  if (error || typeof data !== "string") return { error: "초대 링크를 만들지 못했어요" };
  return { code: data };
}

export async function setDisplayNameAction(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  if (!name) return { error: "이름을 입력해주세요" };
  const { db, ledger } = await getAppContext();
  const { error } = await setDisplayName(db, ledger.id, name);
  if (error) return { error: "이름을 저장하지 못했어요" };
  refreshAll();
  return {};
}
