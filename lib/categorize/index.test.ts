import { describe, expect, it } from "vitest";
import type { Category, Rule } from "@/lib/db/types";
import { suggestCategory } from ".";
import { normalizeMerchant } from "./dictionary";

const cat = (id: string, name: string, type: Category["type"] = "expense") => ({ id, ledger_id: "L", name, type }) as Category;
const categories = [cat("food", "식비"), cat("cafe", "카페·간식"), cat("shop", "쇼핑"), cat("move", "교통"), cat("pay", "급여", "income")];
const base = { categories, rules: [] as Rule[], methods: [] };

describe("suggestCategory", () => {
  it("규칙 → 지난 기록 → 사전 순서", () => {
    const rules = [{ id: "r", ledger_id: "L", keyword: "스타벅스", category_id: "food", set_type: null, payment_method_id: null, auto_accept: false, created_by: "u", created_at: "2026-01-01" }] as Rule[];
    const history = new Map([[normalizeMerchant("스타벅스"), "shop"]]);
    expect(suggestCategory({ ...base, rules, history, text: "스타벅스 4500원", merchant: "스타벅스", type: "expense" }).source).toBe("rule");
    expect(suggestCategory({ ...base, history, text: "스타벅스 4500원", merchant: "스타벅스", type: "expense" })).toMatchObject({ categoryId: "shop", source: "history" });
    expect(suggestCategory({ ...base, text: "스타벅스 4500원", merchant: "스타벅스", type: "expense" })).toMatchObject({ categoryId: "cafe", source: "dictionary" });
  });
  it("긴 이름이 우선: 쿠팡이츠는 식비, 쿠팡은 쇼핑", () => {
    expect(suggestCategory({ ...base, text: "쿠팡이츠 18000원", merchant: "쿠팡이츠", type: "expense" }).categoryId).toBe("food");
    expect(suggestCategory({ ...base, text: "쿠팡 32000원", merchant: "쿠팡", type: "expense" }).categoryId).toBe("shop");
    expect(suggestCategory({ ...base, text: "카카오T 택시 9800원", merchant: "카카오T", type: "expense" }).categoryId).toBe("move");
  });
  it("모르는 가게·이체는 미분류", () => {
    expect(suggestCategory({ ...base, text: "동네가게 5000원", merchant: "동네가게", type: "expense" }).categoryId).toBeNull();
    expect(suggestCategory({ ...base, text: "카드대금 출금", merchant: null, type: "transfer" }).categoryId).toBeNull();
  });
  it("이름을 바꾼 카테고리는 사전에 안 걸린다", () => {
    expect(suggestCategory({ ...base, categories: [cat("x", "밥값")], text: "이마트 30000원", merchant: "이마트", type: "expense" }).categoryId).toBeNull();
  });
});
