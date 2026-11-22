import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/server";
import { safeNext } from "@/app/_lib/safe-next";

const COOKIE = "kakao_oidc";

/** 카카오에서 돌아오면 code를 ID 토큰으로 바꾸고, 그 토큰으로 Supabase 세션을 만든다 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  let saved: { state?: string; nonce?: string; next?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(COOKIE)?.value ?? "{}");
  } catch {}
  // 다른 탭에서 시작한 로그인의 쿠키는 건드리지 않는다
  const stateOk = !!saved.state && saved.state === searchParams.get("state");
  const next = stateOk ? safeNext(saved.next) : "/";

  const done = (path: string) => {
    const res = NextResponse.redirect(`${origin}${path}`);
    if (stateOk) res.cookies.delete({ name: COOKIE, path: "/auth/kakao" });
    return res;
  };
  const fail = (code: string) => {
    console.error("kakao login failed:", code);
    return done(`/login?error=kakao${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`);
  };

  if (searchParams.get("error")) return fail("kakao_denied");
  const code = searchParams.get("code");
  if (!stateOk || !code || !saved.nonce) return fail("state_mismatch");

  const clientId = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("missing_env");

  let idToken: string | undefined;
  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/auth/kakao/callback`,
        code,
      }),
      cache: "no-store",
    });
    const token = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error_code?: string };
    if (!tokenRes.ok) return fail(`token_${tokenRes.status}_${token.error_code ?? "unknown"}`);
    idToken = token.id_token;
  } catch {
    return fail("token_network");
  }
  if (!idToken) return fail("no_id_token");

  const db = await createClient();
  const { error } = await db.auth.signInWithIdToken({ provider: "kakao", token: idToken, nonce: saved.nonce });
  if (error) return fail(`supabase_${error.code ?? error.status ?? "error"}`);

  return done(next);
}
