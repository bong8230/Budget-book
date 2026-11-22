"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyLedger } from "@/lib/push/notify";
import { formatSigned, todayIso } from "@/components/format";
import { getAppContext } from "@/app/_lib/context";
import {
  acceptImport,
  approveJoin,
  addCategory,
  addPaymentMethod,
  addRecurring,
  addRule,
  addTransaction,
  archivePaymentMethod,
  createInstallment,
  createInvite,
  deleteCategory,
  deleteInstallment,
  deleteRecurring,
  deleteRule,
  deleteTransaction,
  generateDueRecurring,
  ignoreImport,
  listCategories,
  listPaymentMethods,
  listRules,
  merchantCategoryHistory,
  mergeImport,
  rejectJoin,
  renameCategory,
  setDisplayName,
  setMonthlyBudget,
  updatePaymentMethod,
  updateRecurring,
  updateRule,
  updateTransaction,
} from "@/lib/db/queries";
import type { PaymentMethod, RecurringItem, TransactionType } from "@/lib/db/types";
import { dueDates } from "@/lib/recurring";
import { parseVoice } from "@/lib/voice/parse";
import { guessCategory } from "@/lib/voice/category";
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

type TxValue = { type: TransactionType; amount: number; occurredOn: string; categoryId: string | null; paymentMethodId: string | null; memo: string };

async function createInstallmentPlan(ctx: AppContext, v: TxValue, formData: FormData): Promise<FormState> {
  const months = Number(formData.get("months"));
  if (v.type !== "expense") return { error: "할부는 지출에만 쓸 수 있어요" };
  if (!Number.isInteger(months) || months < 2 || months > 36) return { error: "할부 개월은 2~36개월로 골라주세요" };
  if (v.amount < months) return { error: "금액이 할부 개월 수보다 커야 해요" };
  const { error } = await createInstallment(ctx.db, {
    ledgerId: ctx.ledger.id,
    userId: ctx.user.id,
    total: v.amount,
    months,
    firstDate: v.occurredOn,
    categoryId: v.categoryId,
    paymentMethodId: v.paymentMethodId,
    memo: v.memo,
  });
  if (error) return { error: "저장하지 못했어요. 다시 시도해주세요" };
  notifyAdded(ctx, { ...v, memo: `${v.memo ? `${v.memo} · ` : ""}${months}개월 할부` });
  refreshAll();
  redirect("/recurring?saved=installment");
}

async function createRepeat(ctx: AppContext, v: TxValue, formData: FormData): Promise<FormState> {
  const frequency = String(formData.get("frequency"));
  if (frequency !== "weekly" && frequency !== "monthly" && frequency !== "yearly") return { error: "반복 주기를 골라주세요" };
  const endMode = String(formData.get("endMode") ?? "none");
  const endDate = endMode === "date" ? String(formData.get("endDate") ?? "") : null;
  const maxCount = endMode === "count" ? Number(formData.get("maxCount")) : null;
  if (endDate !== null && (!isRealDate(endDate) || endDate < v.occurredOn)) return { error: "끝나는 날은 시작일 뒤로 정해주세요" };
  if (maxCount !== null && (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > 600)) return { error: "횟수는 1~600 사이로 정해주세요" };
  const category = v.categoryId ? (await listCategories(ctx.db, ctx.ledger.id)).data?.find((c) => c.id === v.categoryId)?.name : null;
  const name = (v.memo || category || (v.type === "income" ? "반복 수입" : "반복 지출")).slice(0, 40);
  const { error } = await addRecurring(ctx.db, {
    ledger_id: ctx.ledger.id,
    name,
    keyword: name,
    type: v.type,
    amount: v.amount,
    day_of_month: Number(v.occurredOn.slice(8)),
    category_id: v.categoryId,
    payment_method_id: v.paymentMethodId,
    active: true,
    frequency,
    start_date: v.occurredOn,
    end_date: endDate,
    max_count: maxCount,
    auto_create: true,
  });
  if (error) return { error: "저장하지 못했어요. 다시 시도해주세요" };
  // 시작일이 오늘 이전이면 지난 회차를 바로 만든다
  const { data: created } = await generateDueRecurring(ctx.db, ctx.ledger.id);
  if (created && created.length > 0) notifyAdded(ctx, v);
  refreshAll();
  redirect("/recurring?saved=repeat");
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
  const plan = String(formData.get("plan") ?? "once");
  if (plan === "installment") return createInstallmentPlan(ctx, v, formData);
  if (plan === "repeat") return createRepeat(ctx, v, formData);
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
  const back = str(formData, "back", 20);
  if (back === "/recurring") redirect("/recurring");
  if (back === "calendar") redirect(`/transactions?view=calendar&month=${v.occurredOn.slice(0, 7)}&day=${v.occurredOn}`);
  redirect(`/transactions?month=${v.occurredOn.slice(0, 7)}`);
}

export async function updateTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const parsed = readTransaction(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!id) return { error: "잘못된 요청이에요" };
  const ctx = await getAppContext();
  const { db } = ctx;
  const v = parsed.value;
  const { data: before } = await db
    .from("transactions")
    .select("category_id,merchant,memo")
    .eq("id", id)
    .maybeSingle<{ category_id: string | null; merchant: string | null; memo: string | null }>();
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
  const suggest = before ? await ruleSuggestQuery(ctx, ruleKeyword(before.merchant, v.memo), v.categoryId, before.category_id) : "";
  redirect(`/transactions?month=${v.occurredOn.slice(0, 7)}${suggest ? `&${suggest}` : ""}`);
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
  const { data: before } = await ctx.db
    .from("imports")
    .select("category_id,merchant")
    .eq("id", importId)
    .maybeSingle<{ category_id: string | null; merchant: string | null }>();
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
  const suggest = await ruleSuggestQuery(ctx, ruleKeyword(str(formData, "merchant") || before?.merchant, v.memo), v.categoryId, before?.category_id ?? null);
  redirect(suggest ? `/inbox?${suggest}` : "/inbox");
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
  if (id) return { go: "/settings/payment-methods" };
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

export async function deleteInstallmentAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db, ledger } = await getAppContext();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { error } = await deleteInstallment(db, ledger.id, id, today);
  if (error) redirect("/recurring?error=installment");
  refreshAll();
  redirect("/recurring");
}

/* ───────── 참여 요청 ───────── */

export async function approveJoinAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db } = await getAppContext();
  // 같은 화면으로 redirect 하면 가끔 멈춰서, 다시 그리기만 한다
  const { error } = await approveJoin(db, id);
  if (error) throw new Error("참여 요청을 승인하지 못했어요");
  refreshAll();
}

export async function rejectJoinAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const { db } = await getAppContext();
  await rejectJoin(db, id);
  refreshAll();
}

/* ───────── 카테고리 ───────── */

export async function saveCategoryAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = optionalId(formData, "id");
  const name = str(formData, "name", 30);
  if (!name) return { error: "이름을 입력해주세요" };
  const ctx = await getAppContext();
  let type = String(formData.get("type"));
  if (id) {
    const { data, error } = await renameCategory(ctx.db, ctx.ledger.id, id, name);
    if (error) return { error: error.code === "23505" ? "같은 이름의 카테고리가 이미 있어요" : "저장하지 못했어요" };
    type = (data as { type?: string } | null)?.type ?? type;
  } else {
    if (type !== "income" && type !== "expense") return { error: "종류를 골라주세요" };
    const { error } = await addCategory(ctx.db, { ledger_id: ctx.ledger.id, name, type });
    if (error) return { error: error.code === "23505" ? "같은 이름의 카테고리가 이미 있어요" : "저장하지 못했어요" };
  }
  refreshAll();
  // 추가는 같은 화면에 머문다. 수정은 ?edit= 에서 목록으로
  if (id) return { go: `/settings/categories?type=${type === "income" ? "income" : "expense"}` };
  return undefined;
}

export async function deleteCategoryAction(formData: FormData) {
  const id = requiredId(formData, "id");
  const type = formData.get("type") === "income" ? "income" : "expense";
  const { db, ledger } = await getAppContext();
  // 이 카테고리로 자동 등록하던 규칙은 카테고리가 비면 엉뚱하게 자동 저장될 수 있어 자동 등록을 끈다
  await db.from("rules").update({ auto_accept: false }).eq("ledger_id", ledger.id).eq("category_id", id).eq("auto_accept", true);
  const { error } = await deleteCategory(db, ledger.id, id);
  if (error) redirect(`/settings/categories?type=${type}&error=delete`);
  refreshAll();
  redirect(`/settings/categories?type=${type}`);
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
  const frequency = String(formData.get("frequency") ?? "monthly");
  const startDate = String(formData.get("startDate") ?? "");
  const endMode = String(formData.get("endMode") ?? "none");
  const endDate = endMode === "date" ? String(formData.get("endDate") ?? "") : null;
  const maxCount = endMode === "count" ? Number(formData.get("maxCount")) : null;
  const autoCreate = formData.get("autoCreate") === "on";
  if (!name) return { error: "이름을 입력해주세요" };
  if (!TYPES.includes(type)) return { error: "종류를 골라주세요" };
  if (!amount) return { error: "금액을 입력해주세요" };
  if (frequency !== "weekly" && frequency !== "monthly" && frequency !== "yearly") return { error: "주기를 골라주세요" };
  if (!isRealDate(startDate)) return { error: "시작일을 확인해주세요" };
  if (endDate !== null && (!isRealDate(endDate) || endDate < startDate)) return { error: "끝나는 날은 시작일 뒤로 정해주세요" };
  if (maxCount !== null && (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > 600)) return { error: "횟수는 1~600 사이로 정해주세요" };

  const ctx = await getAppContext();
  // 수동이던 항목에 자동 등록을 새로 켜면, 이미 손으로 넣었을 지난 회차를 다시 만들지 않도록 오늘부터 시작한다
  let start = startDate;
  let count = maxCount;
  if (id && autoCreate && startDate < todayIso()) {
    const { data: before } = await ctx.db.from("recurring_items").select("auto_create").eq("id", id).maybeSingle<{ auto_create: boolean }>();
    if (before && !before.auto_create) {
      const schedule = { frequency, start_date: startDate, day_of_month: Number(startDate.slice(8)), end_date: endDate, max_count: null } as RecurringItem;
      const today = todayIso();
      const yesterday = new Date(`${today}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const past = dueDates(schedule, startDate, yesterday.toISOString().slice(0, 10)).length;
      const next = dueDates(schedule, today, `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`)[0];
      if (next) start = next;
      if (count !== null) count = Math.max(1, count - past);
    }
  }
  const values = {
    name,
    keyword,
    type,
    amount,
    day_of_month: Number(startDate.slice(8)),
    category_id: type === "transfer" ? null : optionalId(formData, "categoryId"),
    payment_method_id: optionalId(formData, "paymentMethodId"),
    active: true,
    frequency: frequency as "weekly" | "monthly" | "yearly",
    start_date: start,
    end_date: endDate,
    max_count: count,
    auto_create: autoCreate,
  };
  const { error } = id ? await updateRecurring(ctx.db, id, values) : await addRecurring(ctx.db, { ledger_id: ctx.ledger.id, ...values });
  if (error) return { error: "저장하지 못했어요" };
  if (autoCreate) await generateDueRecurring(ctx.db, ctx.ledger.id);
  refreshAll();
  if (id) return { go: "/recurring" };
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

export type VoiceState = { ok: boolean; message: string; id?: string } | undefined;

/** "마트에서 3천원 결제했어" 같은 문장을 규칙으로 해석해 바로 추가한다 (AI 미사용, 무료) */
export async function recordVoiceAction(_prev: VoiceState, formData: FormData): Promise<VoiceState> {
  const text = str(formData, "text", 200);
  if (!text) return { ok: false, message: "추가할 내용을 말하거나 입력해주세요." };
  const parsed = parseVoice(text, todayIso());
  if (!parsed) return { ok: false, message: "금액을 알아듣지 못했어요. 예: 마트에서 3천원 결제했어" };
  const ctx = await getAppContext();
  const [{ data: categories }, { data: rules }, { data: methods }, history] = await Promise.all([
    listCategories(ctx.db, ctx.ledger.id),
    listRules(ctx.db, ctx.ledger.id),
    listPaymentMethods(ctx.db, ctx.ledger.id),
    parsed.merchant ? merchantCategoryHistory(ctx.db, ctx.ledger.id).catch(() => null) : undefined,
  ]);
  // 분류에 필요한 정보를 못 읽었으면 엉뚱한 분류로 저장하지 않는다
  if (!categories || !rules || history === null) return { ok: false, message: "잠시 연결이 불안정해요. 다시 시도해주세요." };
  const guess = guessCategory(text, parsed.merchant, parsed.type, categories ?? [], rules ?? [], methods ?? [], history);
  const { data, error } = await addTransaction(ctx.db, {
    ledger_id: ctx.ledger.id,
    type: parsed.type,
    amount: parsed.amount,
    occurred_on: parsed.occurredOn,
    category_id: guess.categoryId,
    payment_method_id: guess.paymentMethodId,
    merchant: parsed.merchant,
    memo: parsed.memo,
    created_by: ctx.user.id,
  });
  if (error || !data) return { ok: false, message: "저장하지 못했어요. 다시 시도해주세요." };
  notifyAdded(ctx, { type: parsed.type, amount: parsed.amount, occurredOn: parsed.occurredOn, memo: parsed.memo });
  refreshAll();
  const category = (categories ?? []).find((c) => c.id === guess.categoryId)?.name ?? "미분류";
  const day = parsed.occurredOn === todayIso() ? "" : ` (${Number(parsed.occurredOn.slice(5, 7))}/${Number(parsed.occurredOn.slice(8))})`;
  return { ok: true, id: (data as { id: string }).id, message: `${parsed.memo} ${formatSigned(parsed.amount, parsed.type)} · ${category}${day} 추가했어요.` };
}

/* ───────── 분류 규칙 제안 ───────── */

/** 규칙 키워드로 쓸 이름: 가게 이름, 없으면 숫자 없는 짧은 메모 */
function ruleKeyword(merchant: string | null | undefined, memo: string | null | undefined): string | null {
  const m = (merchant ?? "").trim();
  if (m.length >= 2 && m.length <= 40) return m;
  const t = (memo ?? "").trim();
  if (t.length >= 2 && t.length <= 20 && !/\d/.test(t)) return t;
  return null;
}

/** 카테고리를 바꿨고 그 가게에 맞는 규칙이 아직 없으면 제안용 쿼리 문자열 */
async function ruleSuggestQuery(ctx: AppContext, keyword: string | null, categoryId: string | null, before: string | null): Promise<string> {
  if (!keyword || !categoryId || categoryId === before) return "";
  const { data: rules } = await listRules(ctx.db, ctx.ledger.id);
  const k = keyword.normalize("NFKC").toLowerCase();
  if ((rules ?? []).some((r) => r.keyword.trim() && k.includes(r.keyword.trim().normalize("NFKC").toLowerCase()))) return "";
  return `suggest=${encodeURIComponent(keyword)}&cat=${categoryId}`;
}

export async function createRuleFromSuggestionAction(keyword: string, categoryId: string, autoAccept: boolean): Promise<{ ok: boolean; error?: string }> {
  const k = String(keyword ?? "").trim().slice(0, 40);
  if (k.length < 2 || !UUID.test(categoryId)) return { ok: false, error: "잘못된 요청이에요" };
  const ctx = await getAppContext();
  // 그사이 같은 가게 규칙이 생겼으면(배우자가 먼저 저장 등) 겹쳐 만들지 않는다
  const { data: rules } = await listRules(ctx.db, ctx.ledger.id);
  const nk = k.normalize("NFKC").toLowerCase();
  if ((rules ?? []).some((r) => r.keyword.trim() && nk.includes(r.keyword.trim().normalize("NFKC").toLowerCase())))
    return { ok: false, error: "이미 이 가게에 맞는 규칙이 있어요. 설정 › 자동 분류 규칙에서 확인해주세요" };
  const { error } = await addRule(ctx.db, {
    ledger_id: ctx.ledger.id,
    created_by: ctx.user.id,
    keyword: k,
    set_type: null,
    category_id: categoryId,
    payment_method_id: null,
    auto_accept: autoAccept === true,
  });
  if (error) return { ok: false, error: "규칙을 만들지 못했어요" };
  refreshAll();
  return { ok: true };
}
