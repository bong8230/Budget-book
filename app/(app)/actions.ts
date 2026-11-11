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
  if (!isRealDate(occurredOn)) return { error: "날짜를 확인해주세요" } as const;
  return { value: { type, amount, occurredOn, categoryId: type === "transfer" ? null : categoryId, memo } } as const;
}

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

type AppContext = Awaited<ReturnType<typeof getAppContext>>;

/** 거래가 새로 생겼을 때 배우자에게 푸시. 응답을 늦추지 않도록 after()로 보낸다 */
function notifyAdded(ctx: AppContext, t: { type: TransactionType; amount: number; occurredOn: string; memo: string }) {
  const me = ctx.members.find((m) => m.userId === ctx.user.id)?.name ?? "배우자";
  after(() =>
    notifyLedger(ctx.ledger.id, ctx.user.id, {
      title: `${me}님이 내역을 입력했어요`,
      body: `${formatSigned(t.amount, t.type)}${t.memo ? ` · ${t.memo}` : ""}`,
      url: `/transactions?month=${t.occurredOn.slice(0, 7)}`,
    }).catch(() => {}),
  );
}

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function createTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const ctx = await getAppContext();
  const { db, user, ledger } = ctx;
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
  notifyAdded(ctx, v);
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
  const { error } = await deleteTransaction(db, id);
  if (error) redirect(`/transactions/${encodeURIComponent(id)}?error=delete`);
  refreshAll();
  redirect(/^\d{4}-\d{2}$/.test(month) ? `/transactions?month=${month}` : "/transactions");
}

/** 확인 대기 내역을 (수정한 값으로) 등록 */
export async function acceptImportAction(_: FormState, formData: FormData): Promise<FormState> {
  const importId = String(formData.get("importId") ?? "");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const ctx = await getAppContext();
  const v = parsed.value;
  const { error } = await acceptImport(ctx.db, importId, {
    type: v.type,
    amount: v.amount,
    date: v.occurredOn,
    categoryId: v.categoryId ?? undefined,
    memo: v.memo,
  });
  if (error) return { error: "등록하지 못했어요. 이미 처리된 내역일 수 있어요" };
  notifyAdded(ctx, v);
  refreshAll();
  redirect("/inbox");
}

/** 수정 없이 바로 등록 */
export async function quickAcceptImportAction(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  const ctx = await getAppContext();
  const { data: item } = await ctx.db
    .from("imports")
    .select("type,amount,occurred_on,merchant")
    .eq("id", importId)
    .eq("status", "pending")
    .maybeSingle<{ type: TransactionType | null; amount: number | null; occurred_on: string | null; merchant: string | null }>();
  if (!item || !item.type || item.amount == null || !item.occurred_on) redirect("/inbox?error=accept");
  const { error } = await acceptImport(ctx.db, importId);
  if (error) redirect("/inbox?error=accept");
  notifyAdded(ctx, { type: item.type, amount: Number(item.amount), occurredOn: item.occurred_on, memo: item.merchant ?? "" });
  refreshAll();
  redirect("/inbox");
}

export async function ignoreImportAction(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  const { db } = await getAppContext();
  const { error } = await ignoreImport(db, importId);
  if (error) redirect("/inbox?error=ignore");
  refreshAll();
  redirect("/inbox");
}

export async function setBudgetAction(_: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("amount") ?? "").replace(/[,\s원]/g, "");
  const month = String(formData.get("month") ?? "");
  if (!/^\d{1,10}$/.test(raw)) return { error: "예산 금액을 숫자로 입력해주세요" };
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount > MAX_AMOUNT) return { error: "금액을 확인해주세요" };
  if (!isRealDate(`${month}-01`)) return { error: "월을 확인해주세요" };
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
