import { describe, expect, it } from "vitest";
import { amountsInText, asksToRecord } from "./amounts";

describe("amountsInText", () => {
  it.each([
    ["13일 3000원 마트에서 카드결제한거 추가해줘", 3000],
    ["점심 12,300원", 12300],
    ["커피 4천5백원", 4500],
    ["3천500원 썼어", 3500],
    ["월세 55만원", 550000],
    ["가전 1.5만", 15000],
    ["3만5천원", 35000],
    ["12만 3000원", 123000],
  ])("%s → %d", (text, amount) => {
    expect(amountsInText(text).has(amount)).toBe(true);
  });

  it("관계없는 금액은 들어가지 않는다", () => {
    const set = amountsInText("13일 3000원 마트");
    expect(set.has(30000)).toBe(false);
    expect(set.has(999)).toBe(false);
  });

  it("단위 순서가 뒤집히면 한 금액으로 보지 않는다", () => {
    expect(amountsInText("5천3만").has(35000)).toBe(false);
  });
});

describe("asksToRecord", () => {
  it.each(["추가해줘", "기록해", "어제 편의점 4500원 썼어", "월급 들어왔어"])("%s → true", (t) => expect(asksToRecord(t)).toBe(true));
  it.each(["이번 달 식비 얼마야?", "카페에 쓴 돈 알려줘"])("%s → false", (t) => expect(asksToRecord(t)).toBe(false));
});
