import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requireEnv() {
  if (!url || !anon || !service) {
    throw new Error("E2E에는 .env.local 의 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다");
  }
  return { url, anon, service };
}

export function admin(): SupabaseClient {
  const env = requireEnv();
  return createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; password: string };

/** 테스트 전용 사용자. 이메일 확인 없이 바로 쓸 수 있게 만든다 */
export async function createTestUser(label: string): Promise<TestUser> {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-${label}-${run}@example.com`;
  const password = `E2e!${run}${run}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("사용자 생성 실패");
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  const db = admin();
  // 마지막 멤버로 남은 가계부도 함께 정리
  const { data: memberships } = await db.from("ledger_members").select("ledger_id").eq("user_id", user.id);
  for (const m of memberships ?? []) {
    const { count } = await db.from("ledger_members").select("*", { count: "exact", head: true }).eq("ledger_id", m.ledger_id);
    if ((count ?? 0) <= 1) await db.from("ledgers").delete().eq("id", m.ledger_id);
  }
  await db.auth.admin.deleteUser(user.id);
}

/**
 * @supabase/ssr 이 쓰는 형식 그대로 세션 쿠키를 만들어 브라우저에 넣는다.
 * (매직 링크 메일 없이 로그인 상태로 시작)
 */
export async function signIn(context: BrowserContext, user: TestUser, baseURL: string) {
  const env = requireEnv();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(env.url, env.anon, {
    cookies: {
      getAll: () => jar,
      setAll: (items) => {
        for (const { name, value } of items) {
          const i = jar.findIndex((c) => c.name === name);
          if (i >= 0) jar.splice(i, 1);
          if (value) jar.push({ name, value });
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  const host = new URL(baseURL).hostname;
  await context.addCookies(jar.map((c) => ({ ...c, domain: host, path: "/", sameSite: "Lax" as const })));
}

/** 서울 기준 오늘 날짜 */
export function today() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}
