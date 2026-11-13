"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyLedger } from "@/lib/push/notify";
import { formatSigned } from "@/components/format";
import { getAppContext } from "@/app/_lib/context";
import {
  acceptImport,
  addPaymentMethod,
  addRecurring,
  addRule,
  addTransaction,
  archivePaymentMethod,
  createInvite,
  deleteRecurring,
  deleteRule,
  deleteTransaction,
  ignoreImport,
  mergeImport,
  setDisplayName,
  setMonthlyBudget,
  updatePaymentMethod,
  updateRecurring,
  updateRule,
  updateTransaction,
} from "@/lib/db/queries";
import type { PaymentMethod, TransactionType } from "@/lib/db/types";
import type { FormState } from "@/components/transaction-form";

const TYPES: TransactionType[] = ["income", "expense", "transfer"];
const KINDS: PaymentMethod["kind"][] = ["card", "account", "cash"];
const MAX_AMOUNT = 9_999_999_999;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ───────── 입력 검증 도우미 ───────── */

function str(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optionalId(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "");
  return UUID.test(v) ? v : null;
}

function requiredId(formData: FormData, key: string): string {
  const v = String(formData.get(key) ?? "");
  if (!UUID.test(v)) throw new Error(`잘못된 ${key}`);
  return v;
}

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function parseAmount(raw: string): number | null {
  const clean = raw.replace(/[,\s원]/g, "");
  if (!/^\d{1,10}$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) && n <= MAX_AMOUNT ? n : null;
}

function readTransaction(formData: FormData) {
  const type = String(formData.get("type")) as TransactionType;
  const amount = Number(formData.get("amount"));
  const occurredOn = String(formData.get("occurredOn") ?? "");
  const categoryId = optionalId(formData, "categoryId");
  const paymentMethodId = optionalId(formData, "paymentMethodId");
  const memo = str(formData, "memo");

  if (!TYPES.includes(type)) return { error: "거래 종류를 골라주세요" } as const;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: "금액을 입력해주세요" } as const;
  if (!isRealDate(occurredOn)) return { error: "날짜를 확인해주세요" } as const;
  return {
    value: { type, amount, occurredOn, categoryId: type === "transfer" ? null : categoryId, paymentMethodId, memo },
  } as const;
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

/* ───────── 거래 ───────── */

export async function createTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  const ctx = await getAppContext();
  const v = parsed.value;
  const { error } = await addTransaction(ctx.db, {
    ledger_id: ctx.ledger.id,
    type: v.type,
    amount: v.amount,
    occurred_on: v.occurredOn,
    category_id: v.categoryId,
    payment_method_id: v.paymentMethodId,
    memo: v.memo,
    created_by: ctx.user.id,
  });
  if (error) return { error: "저장하지 못했어요. 다시 시도해주세요" };
  notifyAdded(ctx, v);
  refreshAll();
  redirect(str(formData, "back", 20) === "/recurring" ? "/recurring" : `/transactions?month=${v.occurredOn.slice(0, 7)}`);
}

export async function updateTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!id) return { error: "잘못된 요청이에요" };
  const { db } = await getAppContext();
  const v = parsed.value;
  const { error } = await updateTransaction(db, id, {
    type: v.type,
    amount: v.amount,
    occurred_on: v.occurredOn,
    category_id: v.categoryId,
    payment_method_id: v.paymentMethodId,
    memo: v.memo,
  });
  if (error) return { error: "수정하지 못했어요. 다시 시도해주세요" };
  refreshAll();
  redirect(`/transactions?month=${v.occurredOn.slice(0, 7)}`);
}

export async function deleteTransactionAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const month = str(formData, "month", 7);
  const { db } = await getAppContext();
  const { error } = await deleteTransaction(db, id);
  if (error) redirect(`/transactions/${id}?error=delete`);
  refreshAll();
  redirect(/^\d{4}-\d{2}$/.test(month) ? `/transactions?month=${month}` : "/transactions");
}

/**
 * AI가 방금 추가한 거래 되돌리기 (화면 이동 없음).
 * 본인이 AI로 추가했고 24시간 안인 거래만 지운다. 배우자 거래나 직접 입력한 거래는 지울 수 없다.
 */
export async function undoTransactionAction(id: string): Promise<{ ok: boolean }> {
  if (!UUID.test(id)) return { ok: false };
  const { db, user, ledger } = await getAppContext();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("ledger_id", ledger.id)
    .eq("created_by", user.id)
    .eq("source", "ai")
    .gte("created_at", since)
    .select("id");
  const ok = !error && (data?.length ?? 0) === 1;
  if (ok) refreshAll();
  return { ok };
}

/** AI가 만든 확인 카드(draft)를 사용자가 눌러 저장 */
export async function confirmAiDraftAction(draft: {
  type: string;
  amount: number;
  occurredOn: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  memo: string;
}): Promise<{ id?: string; error?: string }> {
  const fd = new FormData();
  fd.set("type", draft.type);
  fd.set("amount", String(draft.amount));
  fd.set("occurredOn", draft.occurredOn);
  fd.set("categoryId", draft.categoryId ?? "");
  fd.set("paymentMethodId", draft.paymentMethodId ?? "");
  fd.set("memo", String(draft.memo ?? ""));
  const parsed = readTransaction(fd);
  if ("error" in parsed) return { error: parsed.error };
  const ctx = await getAppContext();
  const v = parsed.value;
  const { data, error } = await addTransaction(ctx.db, {
    ledger_id: ctx.ledger.id,
    type: v.type,
    amount: v.amount,
    occurred_on: v.occurredOn,
    category_id: v.categoryId,
    payment_method_id: v.paymentMethodId,
    memo: v.memo,
    created_by: ctx.user.id,
    source: "ai",
  });
  if (error || !data) return { error: "저장하지 못했어요" };
  notifyAdded(ctx, v);
  refreshAll();
  return { id: (data as { id: string }).id };
}

/* ───────── 확인 대기함 ───────── */

/** 확인 대기 내역을 (수정한 값으로) 등록 */
export async function acceptImportAction(_: FormState, formData: FormData): Promise<FormState> {
  const importId = optionalId(formData, "importId");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!importId) return { error: "잘못된 요청이에요" };
  const ctx = await getAppContext();
  const v = parsed.value;
  const { error } = await acceptImport(ctx.db, importId, {
    type: v.type,
    amount: v.amount,
    date: v.occurredOn,
    categoryId: v.categoryId ?? undefined,
    paymentMethodId: v.paymentMethodId ?? undefined,
    merchant: str(formData, "merchant") || undefined,
    memo: v.memo,
  });
  if (error) return { error: "등록하지 못했어요. 이미 처리된 내역일 수 있어요" };
  notifyAdded(ctx, v);
  refreshAll();
  redirect("/inbox");
}

/** 수정 없이 바로 등록 */
export async function quickAcceptImportAction(formData: FormData) {
  const importId = requiredId(formData, "importId");
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
  const importId = requiredId(formData, "importId");
  const { db } = await getAppContext();
  const { error } = await ignoreImport(db, importId);
  if (error) redirect("/inbox?error=ignore");
  refreshAll();
  redirect("/inbox");
}

/** 이미 입력한 거래와 같은 내역: 새로 만들지 않고 합친다 (배우자 알림 없음) */
export async function mergeImportAction(formData: FormData) {
  const importId = requiredId(formData, "importId");
  const transactionId = requiredId(formData, "transactionId");
  const { db } = await getAppContext();
  const { error } = await mergeImport(db, importId, transactionId);
  if (error) redirect("/inbox?error=merge");
  refreshAll();
  redirect("/inbox?done=merge");
}

/* ───────── 예산·가계부 ───────── */

export async function setBudgetAction(_: FormState, formData: FormData): Promise<FormState> {
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const month = str(formData, "month", 7);
  if (amount == null) return { error: "예산 금액을 숫자로 입력해주세요" };
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
  const name = str(formData, "name", 30);
  if (!name) return { error: "이름을 입력해주세요" };
  const { db, ledger } = await getAppContext();
  const { error } = await setDisplayName(db, ledger.id, name);
  if (error) return { error: "이름을 저장하지 못했어요" };
  refreshAll();
  return {};
}

/* ───────── 결제수단 ───────── */

function keywordsFrom(formData: FormData): string[] {
  return [
    ...new Set(
      str(formData, "keywords", 300)
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 30),
    ),
  ].slice(0, 10);
}

export async function savePaymentMethodAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const name = str(formData, "name", 40);
  const kind = String(formData.get("kind")) as PaymentMethod["kind"];
  const mine = formData.get("mine") === "on";
  if (!name) return { error: "이름을 입력해주세요" };
  if (!KINDS.includes(kind)) return { error: "종류를 골라주세요" };
  const ctx = await getAppContext();
  const values = { name, kind, keywords: keywordsFrom(formData), owner_id: mine ? ctx.user.id : null };
  const { error } = id
    ? await updatePaymentMethod(ctx.db, id, values)
    : await addPaymentMethod(ctx.db, { ledger_id: ctx.ledger.id, ...values });
  if (error) return { error: "저장하지 못했어요" };
  refreshAll();
  // 추가는 같은 화면에 머문다 (같은 주소로 redirect 하면 저장 중 상태가 멈추는 경우가 있다). 수정은 ?edit= 에서 목록으로
  if (id) redirect("/settings/payment-methods");
  return undefined;
}

export async function archivePaymentMethodAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db } = await getAppContext();
  const { error } = await archivePaymentMethod(db, id);
  if (error) redirect("/settings/payment-methods?error=archive");
  refreshAll();
  redirect("/settings/payment-methods");
}

/* ───────── 자동 분류 규칙 ───────── */

export async function saveRuleAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const keyword = str(formData, "keyword", 40);
  const rawType = String(formData.get("setType") ?? "");
  const setType = TYPES.includes(rawType as TransactionType) ? (rawType as TransactionType) : null;
  const categoryId = setType === "transfer" ? null : optionalId(formData, "categoryId");
  const paymentMethodId = optionalId(formData, "paymentMethodId");
  const autoAccept = formData.get("autoAccept") === "on";
  if (keyword.length < 2) return { error: "키워드를 2글자 이상 입력해주세요" };
  if (!setType && !categoryId && !paymentMethodId) return { error: "카테고리·종류·결제수단 중 하나는 정해주세요" };

  const ctx = await getAppContext();
  const values = { keyword, set_type: setType, category_id: categoryId, payment_method_id: paymentMethodId, auto_accept: autoAccept };
  const { error } = id
    ? await updateRule(ctx.db, id, values)
    : await addRule(ctx.db, { ledger_id: ctx.ledger.id, created_by: ctx.user.id, ...values });
  if (error) return { error: "규칙을 저장하지 못했어요" };
  refreshAll();
  redirect(str(formData, "back", 20) === "/inbox" ? "/inbox?done=rule" : "/settings/rules");
}

export async function deleteRuleAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db } = await getAppContext();
  const { error } = await deleteRule(db, id);
  if (error) redirect("/settings/rules?error=delete");
  refreshAll();
  redirect("/settings/rules");
}

/* ───────── 고정지출 ───────── */

export async function saveRecurringAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const name = str(formData, "name", 40);
  const keyword = str(formData, "keyword", 40) || name;
  const type = String(formData.get("type")) as TransactionType;
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const day = Number(formData.get("day"));
  if (!name) return { error: "이름을 입력해주세요" };
  if (!TYPES.includes(type)) return { error: "종류를 골라주세요" };
  if (!amount) return { error: "금액을 입력해주세요" };
  if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "날짜는 1~31일 사이로 정해주세요" };

  const ctx = await getAppContext();
  const values = {
    name,
    keyword,
    type,
    amount,
    day_of_month: day,
    category_id: type === "transfer" ? null : optionalId(formData, "categoryId"),
    payment_method_id: optionalId(formData, "paymentMethodId"),
    active: true,
  };
  const { error } = id ? await updateRecurring(ctx.db, id, values) : await addRecurring(ctx.db, { ledger_id: ctx.ledger.id, ...values });
  if (error) return { error: "저장하지 못했어요" };
  refreshAll();
  if (id) redirect("/recurring");
  return undefined;
}

export async function deleteRecurringAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db } = await getAppContext();
  const { error } = await deleteRecurring(db, id);
  if (error) redirect("/recurring?error=delete");
  refreshAll();
  redirect("/recurring");
}

/** 감지된 후보를 고정지출로 등록 */
export async function acceptSuggestionAction(formData: FormData) {
  const name = str(formData, "merchant", 40);
  const keyword = str(formData, "keyword", 40) || name;
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const day = Math.min(31, Math.max(1, Number(formData.get("day")) || 1));
  if (!name || !amount) redirect("/recurring?error=suggest");
  const { db, ledger } = await getAppContext();
  const { error } = await addRecurring(db, { ledger_id: ledger.id, name, keyword, type: "expense", amount, day_of_month: day });
  if (error) redirect("/recurring?error=suggest");
  refreshAll();
  redirect("/recurring");
}
