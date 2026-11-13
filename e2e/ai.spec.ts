import { expect, test } from "@playwright/test";
import { admin, createTestUser, deleteTestUser, signIn, today, type TestUser } from "./helpers";

/** 실제 Claude API 를 부르므로 ANTHROPIC_API_KEY 가 있을 때만 실행 (1회 수십 원) */
test.skip(!process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY 없음");
test.describe.configure({ mode: "serial" });

let user: TestUser;
test.beforeAll(async () => {
  user = await createTestUser("ai");
});
test.afterAll(async () => {
  await deleteTestUser(user);
});

test("예산이 없으면 AI를 쓸 수 없다", async ({ page, context, baseURL }) => {
  await signIn(context, user, baseURL!);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "만들기" }).click();
  await page.goto("/ai");
  await expect(page.getByText("이번 달 예산을 정하면 쓸 수 있어요.")).toBeVisible();
  await expect(page.getByLabel("질문 또는 기록")).toBeDisabled();
});

test("말로 요청하면 거래를 추가하고 되돌릴 수 있다", async ({ page, context, baseURL }) => {
  await signIn(context, user, baseURL!);
  await page.goto("/settings#budget");
  await page.getByLabel("월 예산").fill("1000000");
  await page.locator("#budget").press("Enter");
  await expect(page.getByText("저장했어요")).toBeVisible();

  const t = today();
  await page.goto("/ai");
  await expect(page.getByText(/이번 달 AI 한도 100,000원/)).toBeVisible();
  await page.getByLabel("질문 또는 기록").fill(`${t.d}일 마트에서 3000원 쓴 거 추가해줘`);
  await page.getByRole("button", { name: "보내기" }).click();

  const card = page.getByRole("button", { name: "되돌리기" }).locator("..");
  await expect(card).toContainText("-3,000원", { timeout: 60_000 });

  // DB 에 실제로 들어갔는지
  const db = admin();
  const { data: m } = await db.from("ledger_members").select("ledger_id").eq("user_id", user.id).single();
  const { data: rows } = await db.from("transactions").select("amount,type,memo").eq("ledger_id", m!.ledger_id);
  expect(rows).toEqual([expect.objectContaining({ amount: 3000, type: "expense" })]);

  // 사용 비용이 기록된다
  const { data: usage } = await db.from("ai_usage").select("status,cost_krw").eq("ledger_id", m!.ledger_id);
  expect(usage!.length).toBeGreaterThan(0);
  expect(usage!.every((u) => u.status === "settled")).toBe(true);

  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByText("되돌림")).toBeVisible();
  const { data: after } = await db.from("transactions").select("id").eq("ledger_id", m!.ledger_id);
  expect(after).toHaveLength(0);
});

test("가계부 데이터를 조회해 답한다", async ({ page, context, baseURL }) => {
  await signIn(context, user, baseURL!);
  await page.goto("/transactions/new");
  for (const ch of "12000") await page.getByRole("button", { name: ch, exact: true }).click();
  await page.getByRole("button", { name: "식비" }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/transactions\?month=/);

  await page.goto("/ai");
  await page.getByLabel("질문 또는 기록").fill("이번 달 식비 얼마 썼어?");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText(/12,000원/)).toBeVisible({ timeout: 60_000 });
});
