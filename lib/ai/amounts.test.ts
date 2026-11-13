import { describe, expect, it } from "vitest";
import { AmountBudget, amountCandidates, asksToRecord, isQuestion } from "./amounts";

describe("amountCandidates", () => {
  it.each([
    ["13일 3000원 마트에서 카드결제한거 추가해줘", [3000]],
    ["점심 12,300원", [12300]],
    ["커피 4천5백원", [4500]],
    ["3천500원 썼어", [3500]],
    ["월세 55만원", [550000]],
    ["가전 1.5만", [15000]],
    ["3만5천원", [35000]],
    ["12만 3000원", [123000]],
    ["택시 8500", [8500]],
  ])("%s → %j", (text, amounts) => {
    expect(amountCandidates(text)).toEqual(amounts);
  });

  it("날짜·시간·개수 숫자는 금액이 아니다", () => {
    expect(amountCandidates("11월 13일 12시 30분에 3개 샀어")).toEqual([]);
    expect(amountCandidates("2026년 11월")).toEqual([]);
  });

  it("단위 없는 작은 숫자는 금액으로 보지 않는다", () => {
    expect(amountCandidates("커피 2잔이랑 빵 3")).toEqual([]);
    expect(amountCandidates("커피 50원")).toEqual([50]);
  });

  it("같은 금액을 두 번 말하면 두 번 들어간다", () => {
    expect(amountCandidates("김밥 3000원, 라면 3000원 추가해줘")).toEqual([3000, 3000]);
  });

  it("단위 순서가 뒤집히면 금액으로 보지 않는다", () => {
    expect(amountCandidates("5천3만")).not.toContain(35000);
  });
});

describe("asksToRecord / isQuestion", () => {
  it.each(["추가해줘", "13일 3000원 마트에서 카드결제한거 추가해줘", "어제 편의점 4500원 썼어", "월급 들어왔어", "기록해"])("%s → 기록 요청", (t) =>
    expect(asksToRecord(t)).toBe(true),
  );
  it.each(["13일에 3000원 썼어?", "이번 달 식비 얼마야", "카페에 쓴 돈 알려줘", "어제 3000원 썼나", "마트에서 몇 번 썼어"])("%s → 기록 요청 아님", (t) =>
    expect(asksToRecord(t)).toBe(false),
  );
  it("물음표로 끝나면 질문", () => expect(isQuestion("3000원 추가했어?")).toBe(true));
});

describe("AmountBudget", () => {
  it("금액은 한 번씩만 쓸 수 있다", () => {
    const b = new AmountBudget([3000]);
    expect(b.take(3000)).toBe(true);
    expect(b.take(3000)).toBe(false);
    expect(b.take(13)).toBe(false);
  });
});
