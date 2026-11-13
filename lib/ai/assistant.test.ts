import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { create, addTransaction, listTransactionsRange } = vi.hoisted(() => ({
  create: vi.fn(),
  addTransaction: vi.fn(),
  listTransactionsRange: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

vi.mock("@/lib/db/queries", () => ({
  addTransaction: (...a: unknown[]) => addTransaction(...a),
  listTransactionsRange: (...a: unknown[]) => listTransactionsRange(...a),
}));

import { askAssistant, type Meter } from "./assistant";
import type { Category, PaymentMethod } from "@/lib/db/types";

const categories = [
  { id: "c-food", ledger_id: "L", name: "식비", type: "expense" },
  { id: "c-life", ledger_id: "L", name: "생활", type: "expense" },
  { id: "c-pay", ledger_id: "L", name: "급여", type: "income" },
] as Category[];
const paymentMethods = [
  { id: "pm-card", ledger_id: "L", name: "신한카드", kind: "card", owner_id: null, keywords: [], archived_at: null, created_at: "" },
] as PaymentMethod[];
const ctx = { db: {} as never, ledgerId: "L", userId: "U", categories, paymentMethods, today: "2026-11-13" };

function meter(allow = true) {
  return {
    reserve: vi.fn(async () => (allow ? "res-1" : null)),
    settle: vi.fn(async () => {}),
    costKrw: vi.fn(() => 10),
  } satisfies Meter;
}

const usage = { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const toolUse = (input: object) => ({
  stop_reason: "tool_use",
  usage,
  content: [{ type: "tool_use", id: "tu1", name: "add_transaction", input }],
});
/** 대화에서 첫 tool_result 블록 (mock 은 같은 배열을 참조하므로 위치 대신 찾아본다) */
function firstToolResult(): { content: string; is_error?: boolean } {
  const msgs = create.mock.calls.at(-1)![0].messages as { role: string; content: unknown }[];
  for (const m of msgs) {
    if (Array.isArray(m.content)) {
      const r = m.content.find((b: { type?: string }) => b.type === "tool_result");
      if (r) return r;
    }
  }
  throw new Error("tool_result 없음");
}
const text = (t: string) => ({ stop_reason: "end_turn", usage, content: [{ type: "text", text: t }] });

beforeEach(() => {
  create.mockReset();
  addTransaction.mockReset();
  listTransactionsRange.mockReset();
});

describe("askAssistant", () => {
  it("말로 요청한 거래를 카테고리·결제수단을 맞춰 추가한다", async () => {
    create
      .mockResolvedValueOnce(toolUse({ date: "2026-11-13", amount: 3000, type: "expense", category: "생활", payment_method: "신한카드", memo: "마트" }))
      .mockResolvedValueOnce(text("11월 13일 마트 3,000원을 신한카드로 추가했어요."));
    addTransaction.mockResolvedValue({ data: { id: "tx-1" }, error: null });
    const m = meter();

    const res = await askAssistant(ctx, [{ role: "user", text: "13일 3000원 마트에서 카드결제한거 추가해줘" }], m);

    expect(res.ok).toBe(true);
    expect(addTransaction).toHaveBeenCalledWith(ctx.db, expect.objectContaining({
      ledger_id: "L", type: "expense", amount: 3000, occurred_on: "2026-11-13",
      category_id: "c-life", payment_method_id: "pm-card", memo: "마트", created_by: "U",
    }));
    expect(res.added).toEqual([expect.objectContaining({ id: "tx-1", categoryName: "생활", paymentMethodName: "신한카드" })]);
    // 호출마다 예약하고 정산한다
    expect(m.reserve).toHaveBeenCalledTimes(2);
    expect(m.settle).toHaveBeenCalledTimes(2);
    // 오늘 날짜를 모델에 알려준다
    const firstCall = create.mock.calls[0][0];
    expect(JSON.stringify(firstCall.messages)).toContain("오늘: 2026-11-13");
    expect(firstCall.model).toBe("claude-opus-5-5");
  });

  it("목록에 없는 카테고리·결제수단은 비워서 저장한다", async () => {
    create
      .mockResolvedValueOnce(toolUse({ date: "2026-11-12", amount: 5000, type: "expense", category: "없는카테고리", payment_method: "없는카드", memo: null }))
      .mockResolvedValueOnce(text("추가했어요"));
    addTransaction.mockResolvedValue({ data: { id: "tx-2" }, error: null });
    await askAssistant(ctx, [{ role: "user", text: "어제 5000원" }], meter());
    expect(addTransaction).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ category_id: null, payment_method_id: null, memo: "" }));
  });

  it("잘못된 날짜·금액은 저장하지 않고 오류를 모델에 돌려준다", async () => {
    create
      .mockResolvedValueOnce(toolUse({ date: "2026-02-31", amount: -1, type: "expense", category: null, payment_method: null, memo: null }))
      .mockResolvedValueOnce(text("날짜를 다시 알려주세요"));
    const res = await askAssistant(ctx, [{ role: "user", text: "2월 31일" }], meter());
    expect(addTransaction).not.toHaveBeenCalled();
    expect(firstToolResult().is_error).toBe(true);
    expect(res.added).toHaveLength(0);
  });

  it("AI 한도를 넘으면 API를 부르지 않는다", async () => {
    const res = await askAssistant(ctx, [{ role: "user", text: "이번 달 식비?" }], meter(false));
    expect(create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, reason: "over_budget" });
  });

  it("거절 응답을 처리한다", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", usage, content: [] });
    const res = await askAssistant(ctx, [{ role: "user", text: "..." }], meter());
    expect(res).toMatchObject({ ok: false, reason: "refused" });
  });

  it("조회 도구는 기간·종류·키워드로 걸러 합계를 돌려준다", async () => {
    listTransactionsRange.mockResolvedValue({
      data: [
        { id: "1", type: "expense", amount: 1000, occurred_on: "2026-11-01", category_id: "c-food", payment_method_id: null, memo: "김밥", merchant: null },
        { id: "2", type: "expense", amount: 2000, occurred_on: "2026-11-10", category_id: "c-food", payment_method_id: null, memo: "", merchant: "스타벅스" },
        { id: "3", type: "transfer", amount: 50000, occurred_on: "2026-11-10", category_id: null, payment_method_id: null, memo: "카드대금", merchant: null },
        { id: "4", type: "expense", amount: 9000, occurred_on: "2026-10-31", category_id: "c-food", payment_method_id: null, memo: "", merchant: null },
      ],
      error: null,
    });
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        usage,
        content: [{ type: "tool_use", id: "q", name: "query_transactions", input: { from: "2026-11-01", to: "2026-11-30", type: "expense", category: "식비", keyword: null } }],
      })
      .mockResolvedValueOnce(text("3,000원"));
    await askAssistant(ctx, [{ role: "user", text: "이번 달 식비" }], meter());
    const out = JSON.parse(firstToolResult().content);
    expect(out).toMatchObject({ count: 2, totals: { expense: 3000, transfer: 0 } });
  });

  it("한 번에 5건까지만 추가한다", async () => {
    const many = {
      stop_reason: "tool_use",
      usage,
      content: Array.from({ length: 6 }, (_, i) => ({
        type: "tool_use", id: `t${i}`, name: "add_transaction",
        input: { date: "2026-11-13", amount: 1000 + i, type: "expense", category: null, payment_method: null, memo: null },
      })),
    };
    create.mockResolvedValueOnce(many).mockResolvedValueOnce(text("5건 추가"));
    addTransaction.mockImplementation(async () => ({ data: { id: crypto.randomUUID() }, error: null }));
    const res = await askAssistant(ctx, [{ role: "user", text: "여러 건" }], meter());
    expect(addTransaction).toHaveBeenCalledTimes(5);
    expect(res.added).toHaveLength(5);
  });
});
