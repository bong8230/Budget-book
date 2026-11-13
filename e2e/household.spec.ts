import { expect, test, type Page } from "@playwright/test";
import { admin, createTestUser, deleteTestUser, signIn, today, type TestUser } from "./helpers";

/**
 * 부부 두 명(alice, bob)과 남(carol)으로 실제 사용 흐름을 끝까지 검증한다.
 * 클라우드 Supabase 에 테스트 계정을 만들고 마지막에 모두 지운다.
 */
test.describe.configure({ mode: "serial" });

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let token = "";
const t = today();
const md = `${String(t.m).padStart(2, "0")}/${String(t.d).padStart(2, "0")}`;

test.beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createTestUser("alice"), createTestUser("bob"), createTestUser("carol")]);
});

test.afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob), deleteTestUser(carol)]);
});

async function typeAmount(page: Page, digits: string) {
  for (const ch of digits) await page.getByRole("button", { name: ch, exact: true }).click();
}

async function sendImport(page: Page, text: string) {
  const res = await page.request.post("/api/import", {
    headers: { Authorization: `Bearer ${token}` },
    data: { text, source: "sms" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { status: string };
}

test("로그인 안 하면 로그인 화면으로 보낸다", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login\?next=%2Ftransactions/);
  await expect(page.getByRole("button", { name: "로그인 링크 받기" })).toBeVisible();
});

test("가계부를 만들고 이름·예산·결제수단을 정한다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("가계부 이름").fill("E2E 우리집");
  await page.getByRole("button", { name: "만들기" }).click();
  await expect(page).toHaveURL(/\/settings\?welcome=1/);

  await page.getByLabel("내 이름 (배우자에게 보이는 이름)").fill("앨리스");
  await page.getByRole("button", { name: "저장" }).first().click();

  await page.getByLabel("월 예산").fill("1000000");
  await page.locator("#budget-amount").press("Enter");
  await expect(page.getByText("저장했어요")).toBeVisible();

  await page.getByRole("link", { name: /결제수단/ }).click();
  await expect(page).toHaveURL(/\/settings\/payment-methods/);
  await page.getByLabel("이름").fill("신한카드");
  await page.getByLabel("알림 키워드").fill("신한, 1234");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByText("신한카드", { exact: true })).toBeVisible();
});

test("직접 입력한 지출이 내역·홈·예산에 반영된다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/transactions/new");
  await typeAmount(page, "12300");
  await expect(page.getByText("12,300원")).toBeVisible();
  await page.getByRole("button", { name: "식비" }).click();
  await page.getByLabel("결제수단").selectOption({ label: "신한카드" });
  await page.getByLabel("메모").fill("점심");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page).toHaveURL(/\/transactions\?month=/);
  const row = page.getByRole("link", { name: /점심/ });
  await expect(row).toContainText("-12,300원");
  await expect(row).toContainText("신한카드");

  await page.goto("/");
  await expect(page.getByText("이번 달 남은 예산")).toBeVisible();
  await expect(page.getByText("987,700원")).toBeVisible();
});

test("달력 보기: 날짜별 합계와 그날 내역, 그날로 바로 입력", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/transactions");
  await page.getByRole("navigation", { name: "보기 방식" }).getByRole("link", { name: "달력" }).click();
  await expect(page).toHaveURL(/view=calendar/);

  const iso = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const cell = page.getByRole("link", { name: new RegExp(`^${t.d}일, .*지출 12300원`) });
  await expect(cell).toHaveAttribute("aria-current", "date"); // 이번 달은 오늘이 기본 선택
  await expect(cell).toContainText("-1.2만");
  await expect(page.getByRole("link", { name: /점심/ })).toContainText("-12,300원");

  // 달을 넘겨도 달력 보기가 유지된다
  const prev = t.m === 1 ? `${t.y - 1}-12` : `${t.y}-${String(t.m - 1).padStart(2, "0")}`;
  await page.getByRole("link", { name: "이전 달" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${prev}&view=calendar`));
  await expect(page.getByRole("link", { name: "+ 이 날 추가" })).toHaveCount(0); // 다른 달은 선택 없음
  await page.getByRole("link", { name: "다음 달" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${iso.slice(0, 7)}&view=calendar`));

  await page.getByRole("link", { name: "+ 이 날 추가" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions/new\\?date=${iso}`));
  await expect(page.locator("#occurredOn")).toHaveValue(iso);
});

test("기기 토큰을 만들고 잘못된 토큰은 거부한다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/settings#import");
  await page.getByLabel("기기 이름").fill("E2E 폰");
  await page.getByRole("button", { name: "토큰 만들기" }).click();
  const bearer = await page.getByRole("button", { name: /^Bearer / }).textContent();
  token = /Bearer ([a-f0-9]{64})/.exec(bearer ?? "")?.[1] ?? "";
  expect(token).toHaveLength(64);

  const bad = await page.request.post("/api/import", {
    headers: { Authorization: `Bearer ${"0".repeat(64)}` },
    data: { text: "출금 1,000원", source: "sms" },
  });
  expect(bad.status()).toBe(401);
  expect((await sendImport(page, "광고) 이번 주 특가 안내")).status).toBe("skipped");

  // 폰 종류별 설정 안내
  await page.getByRole("tab", { name: "안드로이드" }).click();
  await expect(page.getByText("앱 푸시 알림").first()).toBeVisible();
  await page.getByRole("tab", { name: "아이폰" }).click();
  await expect(page.getByRole("button", { name: /api\/import/ }).first()).toBeVisible();
});

test("가져온 알림: 결제수단 자동 인식 → 규칙 만들기 → 등록", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  expect((await sendImport(page, `[Web발신] 신한카드(1234) 승인 8,500원 ${md} 12:30 김밥천국`)).status).toBe("pending");
  // 같은 문자가 두 번 오면 중복으로 처리
  expect((await sendImport(page, `[Web발신] 신한카드(1234) 승인 8,500원 ${md} 12:30 김밥천국`)).status).toBe("duplicate");

  await page.goto("/inbox");
  const card = page.getByRole("listitem").filter({ hasText: "김밥천국" });
  await expect(card).toContainText("-8,500원");
  await expect(card).toContainText("신한카드");

  await card.getByRole("link", { name: /자동 분류 규칙 만들기/ }).click();
  await expect(page).toHaveURL(/\/settings\/rules\/new/);
  await expect(page.getByLabel("키워드")).toHaveValue("김밥천국");
  await page.getByLabel("카테고리").selectOption({ label: "식비" });
  await page.getByRole("button", { name: "규칙 만들기" }).click();
  await expect(page).toHaveURL(/\/inbox\?done=rule/);

  await page.getByRole("listitem").filter({ hasText: "김밥천국" }).getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByText("확인할 내역이 없어요.")).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: /김밥천국/ })).toContainText("-8,500원");
});

test("규칙이 다음 알림에 자동 적용된다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await sendImport(page, `신한카드 승인 9,000원 ${md} 19:10 김밥천국 역삼점`);
  await page.goto("/inbox");
  const card = page.getByRole("listitem").filter({ hasText: "9,000원" });
  await expect(card).toContainText("식비");
  await expect(card).toContainText("규칙 적용");
  await card.getByRole("button", { name: "무시" }).click();
  await expect(page.getByText("확인할 내역이 없어요.")).toBeVisible();
});

test("이미 입력한 거래와 같은 알림은 합치기를 제안한다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await sendImport(page, `신한카드 승인 12,300원 ${md} 12:05 한식당`);
  await page.goto("/inbox");
  const card = page.getByRole("listitem").filter({ hasText: "12,300원" });
  await expect(card.getByText("이미 입력한 내역과 같아 보여요")).toBeVisible();
  await card.getByRole("button", { name: /합치기/ }).click();
  await expect(page.getByText("기존 거래와 합쳤어요.")).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: /-12,300원/ })).toHaveCount(1);
});

test("카드대금은 이체로 분류돼 지출·예산에서 빠진다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await sendImport(page, `KB국민 출금 500,000원 ${md} 신한카드대금`);
  await page.goto("/inbox");
  const card = page.getByRole("listitem").filter({ hasText: "500,000원" });
  await expect(card).toContainText("이체");
  await card.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByText("확인할 내역이 없어요.")).toBeVisible();

  await page.goto("/");
  // 12,300 + 8,500 = 20,800 만 지출
  await expect(page.getByText("979,200원")).toBeVisible();
});

test("고정지출을 등록하면 홈에 '이번 달 나갈 돈'으로 보인다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/recurring");
  await page.getByLabel("이름").fill("넷플릭스");
  await page.getByLabel("금액").fill("17000");
  await page.getByLabel("매달 며칠").selectOption("28");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("link", { name: "넷플릭스" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("이번 달 나갈 돈")).toBeVisible();
  await expect(page.getByText(/넷플릭스/)).toBeVisible();
});

test("리포트가 차트와 표로 보인다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/reports");
  await expect(page.getByRole("img", { name: "최근 월별 수입과 지출 막대 차트" })).toBeVisible();
  await page.getByText("표로 보기").click();
  await expect(page.getByRole("table")).toContainText("20,800원");
  await expect(page.getByLabel("카테고리별 지출")).toContainText("식비");
});

test("배우자가 초대로 합류하면 거래는 보이고 남의 확인 대기함은 안 보인다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await sendImport(page, `신한카드 승인 3,300원 ${md} 편의점`); // alice 의 대기 내역
  await page.goto("/settings");
  await page.getByRole("button", { name: "배우자 초대 링크 만들기" }).click();
  const link = await page.locator("p", { hasText: "/join/" }).textContent();
  const path = new URL(link!.trim()).pathname;

  await context.clearCookies();
  await signIn(context, bob, baseURL!);
  await page.goto(path);
  await page.getByRole("button", { name: "참여하기" }).click();
  await expect(page).toHaveURL(new RegExp(`${baseURL}/?$`));

  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: /점심/ })).toContainText("앨리스");
  await page.goto("/inbox");
  await expect(page.getByText("확인할 내역이 없어요.")).toBeVisible();

  // 초대 링크는 한 번만 쓸 수 있다
  await context.clearCookies();
  await signIn(context, carol, baseURL!);
  await page.goto(path);
  await page.getByRole("button", { name: "참여하기" }).click();
  await expect(page.getByText("초대 링크가 만료됐거나 이미 사용됐어요")).toBeVisible();
});

test("다른 가계부 사람은 데이터에 접근할 수 없다 (RLS)", async () => {
  const db = admin();
  const { data: ledger } = await db.from("ledger_members").select("ledger_id").eq("user_id", alice.id).single();
  const { createClient } = await import("@supabase/supabase-js");
  const asCarol = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await asCarol.auth.signInWithPassword({ email: carol.email, password: carol.password });
  for (const table of ["transactions", "imports", "rules", "payment_methods", "recurring_items", "monthly_budgets", "device_tokens"]) {
    const { data } = await asCarol.from(table).select("*").eq("ledger_id", ledger!.ledger_id);
    expect(data ?? [], table).toHaveLength(0);
  }
  const { error } = await asCarol.from("transactions").insert({
    ledger_id: ledger!.ledger_id,
    type: "expense",
    amount: 1,
    occurred_on: "2026-11-01",
    created_by: carol.id,
  });
  expect(error).not.toBeNull();
});

test("CSV 내보내기는 엑셀 호환 형식이다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  const res = await page.request.get("/api/export?format=csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.body();
  expect(body.subarray(0, 3).toString("hex")).toBe("efbbbf"); // UTF-8 BOM
  expect(body.toString("utf8")).toContain("김밥천국");
});

test("내역을 수정하고 삭제할 수 있다", async ({ page, context, baseURL }) => {
  await signIn(context, alice, baseURL!);
  await page.goto("/transactions");
  await page.getByRole("link", { name: /점심/ }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]+/);
  await page.getByLabel("메모").fill("점심 회식");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("link", { name: /점심 회식/ })).toBeVisible();

  await page.getByRole("link", { name: /점심 회식/ }).click();
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByRole("link", { name: /점심 회식/ })).toHaveCount(0);
});

test("같은 결제가 문자와 앱 알림으로 오면 하나로 합친다", async ({ page }) => {
  const sms = await sendImport(page, "[Web발신] 삼성카드 승인 7,777원 일시불 E2E중복가게");
  expect(sms.status).toBe("pending");
  const res = await page.request.post("/api/import", {
    headers: { Authorization: `Bearer ${token}` },
    data: { text: "삼성카드\n7,777원 승인 일시불 E2E중복가게", source: "notification", app: "kr.co.samsungcard.mpocket" },
  });
  expect(res.status(), await res.text()).toBe(201);
  expect(((await res.json()) as { status: string }).status).toBe("duplicate");
});

test("탈퇴하면 로그인 화면으로 가고 계정이 지워진다", async ({ page, context, baseURL }) => {
  await signIn(context, carol, baseURL!);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/onboarding/); // carol 은 가계부가 없음
  await page.getByRole("button", { name: "만들기" }).click();
  await page.getByRole("button", { name: "회원 탈퇴" }).click();
  await page.getByLabel(/탈퇴/).fill("탈퇴");
  await page.getByRole("button", { name: "탈퇴하기" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  const { data } = await admin().auth.admin.getUserById(carol.id);
  expect(data.user).toBeNull();
  carol = undefined as unknown as TestUser;
});
