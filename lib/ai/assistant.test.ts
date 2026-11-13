import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { create, addTransaction, aiQueryTransactions } = vi.hoisted(() => ({
  create: vi.fn(),
  addTransaction: vi.fn(),
  aiQueryTransactions: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class BadRequestError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionTimeoutError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static BadRequestError = BadRequestError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static RateLimitError = RateLimitError;
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

vi.mock("@/lib/db/queries", () => ({
  addTransaction: (...a: unknown[]) => addTransaction(...a),
  aiQueryTransactions: (...a: unknown[]) => aiQueryTransactions(...a),
}));

import Anthropic from "@anthropic-ai/sdk";
import { askAssistant, maxUsage, toUsage, type Meter } from "./assistant";
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
    settleKrw: vi.fn(async () => {}),
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
  aiQueryTransactions.mockReset();
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
    await askAssistant(ctx, [{ role: "user", text: "어제 5000원 썼어" }], meter());
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

  it("조회 도구는 카테고리 이름을 id로 바꿔 DB 집계를 쓰고, 잘림을 알려준다", async () => {
    aiQueryTransactions.mockResolvedValue({
      data: {
        count: "150", income: "0", expense: "3000", transfer: "0",
        rows: [{ id: "1", type: "expense", amount: 1000, occurred_on: "2026-11-01", category_id: "c-food", payment_method_id: null, memo: "김밥", merchant: null }],
      },
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
    expect(aiQueryTransactions).toHaveBeenCalledWith(ctx.db, "L", expect.objectContaining({ categoryId: "c-food", type: "expense" }));
    const out = JSON.parse(firstToolResult().content);
    expect(out).toMatchObject({ count: 150, totals: { expense: 3000 }, truncated: true });
  });

  it("없는 카테고리로 조회하면 목록과 함께 오류를 돌려준다", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        usage,
        content: [{ type: "tool_use", id: "q", name: "query_transactions", input: { from: "2026-11-01", to: "2026-11-30", type: null, category: "외식", keyword: null } }],
      })
      .mockResolvedValueOnce(text("식비로 볼게요"));
    await askAssistant(ctx, [{ role: "user", text: "외식비" }], meter());
    expect(aiQueryTransactions).not.toHaveBeenCalled();
    expect(firstToolResult()).toMatchObject({ is_error: true });
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
    const res = await askAssistant(ctx, [{ role: "user", text: "1000 1001 1002 1003 1004 1005원 추가해줘" }], meter());
    expect(addTransaction).toHaveBeenCalledTimes(5);
    expect(res.added).toHaveLength(5);
  });

  it("사용자가 기록을 요청하지 않았으면 저장하지 않고 확인 카드로 돌려준다 (프롬프트 인젝션 방어)", async () => {
    create
      .mockResolvedValueOnce(toolUse({ date: "2026-11-13", amount: 990000, type: "expense", category: null, payment_method: null, memo: "외부 지시" }))
      .mockResolvedValueOnce(text("확인해주세요"));
    const res = await askAssistant(ctx, [{ role: "user", text: "이번 달 식비 얼마야?" }], meter());
    expect(addTransaction).not.toHaveBeenCalled();
    expect(res.added).toHaveLength(0);
    expect(res.drafts).toEqual([expect.objectContaining({ amount: 990000 })]);
    expect(JSON.parse(firstToolResult().content)).toMatchObject({ saved: false, needs_user_confirmation: true });
  });

  it("기록 요청이어도 금액이 사용자 문장에 없으면 확인 카드로 돌려준다", async () => {
    create
      .mockResolvedValueOnce(toolUse({ date: "2026-11-13", amount: 30000, type: "expense", category: null, payment_method: null, memo: "마트" }))
      .mockResolvedValueOnce(text("확인해주세요"));
    const res = await askAssistant(ctx, [{ role: "user", text: "마트에서 3000원 쓴거 추가해줘" }], meter());
    expect(addTransaction).not.toHaveBeenCalled();
    expect(res.drafts).toHaveLength(1);
  });

  it("과금 여부를 모르는 실패는 예약액 전부로, 확실히 거부된 요청은 0원으로 정산한다", async () => {
    const A = Anthropic as unknown as Record<string, new () => Error>;
    create.mockRejectedValueOnce(new A.APIConnectionTimeoutError());
    const m1 = { ...meter(), costKrw: vi.fn(() => 77) };
    await askAssistant(ctx, [{ role: "user", text: "질문" }], m1);
    expect(m1.settleKrw).toHaveBeenCalledWith("res-1", 77);

    create.mockRejectedValueOnce(new A.BadRequestError());
    const m2 = meter();
    await askAssistant(ctx, [{ role: "user", text: "질문" }], m2);
    expect(m2.settleKrw).toHaveBeenCalledWith("res-1", 0);
  });

  it("정산이 실패하면 예외를 그대로 올린다 (라우트가 멈춘다)", async () => {
    create.mockResolvedValueOnce(text("답"));
    const m = { ...meter(), settle: vi.fn(async () => { throw new Error("db down"); }) };
    await expect(askAssistant(ctx, [{ role: "user", text: "질문" }], m)).rejects.toThrow("db down");
  });
});

describe("비용 계산 도우미", () => {
  it("폴백이 있으면 모델별 사용량을 모두 더한다", () => {
    const u = toUsage({
      input_tokens: 1, output_tokens: 1,
      iterations: [
        { type: "message", input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 0 },
        { type: "fallback_message", input_tokens: 120, output_tokens: 70, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 },
      ],
    } as never);
    expect(u).toEqual({ input: 220, output: 120, cacheCreation: 10, cacheRead: 5 });
  });

  it("예약 상한은 UTF-8 바이트 수 이상이고 출력은 max_tokens의 2배다", () => {
    const korean = "가".repeat(1000); // 3000 bytes
    const u = maxUsage(korean, [{ role: "user", content: korean }]);
    expect(u.cacheCreation).toBeGreaterThanOrEqual(6000 * 2);
    expect(u.output).toBe(2048 * 2);
  });
});
