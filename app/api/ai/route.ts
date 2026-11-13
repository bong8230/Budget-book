import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/server";
import {
  getAiUsageSummary,
  getMonthlyBudget,
  getMyLedger,
  listCategories,
  listPaymentMethods,
  listTransactions,
  reserveAiBudget,
  settleAiUsage,
} from "@/lib/db/queries";
import type { Category, PaymentMethod, Transaction } from "@/lib/db/types";
import { capKrw, costKrw } from "@/lib/ai/cost";
import { askAssistant, type ChatTurn, type Meter } from "@/lib/ai/assistant";
import { notifyLedger } from "@/lib/push/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000;

/** 본문을 끝까지 읽기 전에 크기를 제한한다 */
async function readJsonLimited(request: Request): Promise<unknown | "too_large" | "invalid"> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return "too_large";
  const reader = request.body?.getReader();
  if (!reader) return "invalid";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return "invalid";
  }
}

function seoulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // YYYY-MM-DD
}

async function loadContext() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: ledger } = await getMyLedger(db);
  if (!ledger) return { error: NextResponse.json({ error: "Ledger not found" }, { status: 404 }) } as const;

  const today = seoulToday();
  const month = today.slice(0, 7);
  const [{ data: budget }, { data: txs }, usage] = await Promise.all([
    getMonthlyBudget(db, ledger.id, `${month}-01`),
    listTransactions(db, ledger.id, month),
    getAiUsageSummary(db, ledger.id, month),
  ]);
  const expense = ((txs ?? []) as Transaction[]).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const cap = capKrw(budget ? Number(budget.amount) : null, expense);
  return {
    db,
    user,
    ledger,
    today,
    hasBudget: Boolean(budget),
    cap,
    spent: usage.spentKrw,
    reserved: usage.reservedKrw,
  } as const;
}

/** 이번 달 AI 사용 현황 */
export async function GET() {
  const ctx = await loadContext();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    {
      enabled: Boolean(process.env.ANTHROPIC_API_KEY),
      hasBudget: ctx.hasBudget,
      capKrw: ctx.cap,
      spentKrw: ctx.spent,
      remainingKrw: Math.max(0, ctx.cap - ctx.spent - ctx.reserved),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** 정산은 한 번 재시도하고, 그래도 실패하면 예외 */
async function settleOrThrow(run: () => PromiseLike<{ error: unknown }>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await run();
    if (!error) return;
    if (attempt === 1) throw error;
  }
}

function readHistory(body: unknown): ChatTurn[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const raw = (body as { messages: unknown[] }).messages.slice(-10);
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, text } = m as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || !text.trim()) return null;
    turns.push({ role, text: text.slice(0, 1000) });
  }
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  // 첫 메시지는 user 여야 한다
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI가 설정되지 않았어요" }, { status: 503 });
  const ctx = await loadContext();
  if ("error" in ctx) return ctx.error;

  const body = await readJsonLimited(request);
  if (body === "too_large") return NextResponse.json({ error: "Request too large" }, { status: 413 });
  if (body === "invalid") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const history = readHistory(body);
  if (!history) return NextResponse.json({ error: "Invalid messages" }, { status: 400 });

  if (!ctx.hasBudget) return NextResponse.json({ error: "no_budget", reply: "이번 달 예산을 먼저 정해주세요. AI는 남은 예산의 10% 안에서만 써요." }, { status: 402 });
  if (ctx.cap <= 0) return NextResponse.json({ error: "over_budget", reply: "이번 달 남은 예산이 없어서 AI를 쓸 수 없어요." }, { status: 402 });

  const [{ data: categories }, { data: methods }] = await Promise.all([listCategories(ctx.db, ctx.ledger.id), listPaymentMethods(ctx.db, ctx.ledger.id)]);

  // 예약·정산은 서비스 키로만 호출 가능 (DB가 상한을 다시 계산)
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const meter: Meter = {
    costKrw: (u) => costKrw(u),
    async reserve(estimate) {
      const { data, error } = await reserveAiBudget(admin, ctx.ledger.id, ctx.user.id, Math.max(1, estimate), ctx.cap);
      return error || typeof data !== "string" ? null : data;
    },
    async settle(id, u) {
      await settleOrThrow(() => settleAiUsage(admin, id, ctx.user.id, u.input + u.cacheCreation + u.cacheRead, u.output, costKrw(u)));
    },
    async settleKrw(id, krw) {
      await settleOrThrow(() => settleAiUsage(admin, id, ctx.user.id, 0, 0, krw));
    },
  };

  let result: Awaited<ReturnType<typeof askAssistant>>;
  try {
    result = await askAssistant(
    {
      db: ctx.db,
      ledgerId: ctx.ledger.id,
      userId: ctx.user.id,
      categories: (categories ?? []) as Category[],
      paymentMethods: (methods ?? []) as PaymentMethod[],
      today: ctx.today,
    },
    history,
    meter,
  );
  } catch (err) {
    // 정산을 기록하지 못하면 예약이 그대로 남아(만료 후에도 사용액으로 계산) 한도는 지켜진다
    console.error("ai settle failed", err);
    return NextResponse.json({ error: "settle_failed", reply: "사용량을 기록하지 못해 멈췄어요. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }

  if (result.added.length > 0) {
    const { data: me } = await ctx.db.from("ledger_members").select("display_name").eq("ledger_id", ctx.ledger.id).eq("user_id", ctx.user.id).maybeSingle();
    const name = (me?.display_name as string | undefined) || "배우자";
    const first = result.added[0];
    after(() =>
      notifyLedger(ctx.ledger.id, ctx.user.id, {
        title: `${name}님이 내역을 입력했어요`,
        body:
          result.added.length > 1
            ? `${result.added.length}건 추가`
            : `${first.type === "income" ? "+" : first.type === "expense" ? "-" : ""}${first.amount.toLocaleString("ko-KR")}원${first.memo ? ` · ${first.memo}` : ""}`,
        url: `/transactions?month=${first.occurredOn.slice(0, 7)}`,
      }).catch(() => {}),
    );
  }

  const usage = await getAiUsageSummary(ctx.db, ctx.ledger.id, ctx.today.slice(0, 7)).catch(() => ({ spentKrw: ctx.spent, reservedKrw: 0 }));
  return NextResponse.json(
    {
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
      reply: result.reply,
      added: result.added,
      drafts: result.drafts,
      usage: { capKrw: ctx.cap, spentKrw: usage.spentKrw },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
