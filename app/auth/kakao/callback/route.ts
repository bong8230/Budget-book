import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/server";
import { safeNext } from "@/app/_lib/safe-next";

const COOKIE = "kakao_oidc";

/** 카카오에서 돌아오면 code를 ID 토큰으로 바꾸고, 그 토큰으로 Supabase 세션을 만든다 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const fail = (reason: string) => {
    console.error("kakao login failed:", reason);
    const res = NextResponse.redirect(`${origin}/login?error=kakao`);
    res.cookies.delete({ name: COOKIE, path: "/auth/kakao" });
    return res;
  };

  let saved: { state?: string; nonce?: string; next?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(COOKIE)?.value ?? "{}");
  } catch {}

  const code = searchParams.get("code");
  if (searchParams.get("error")) return fail(`kakao error ${searchParams.get("error")}`);
  if (!code || !saved.state || saved.state !== searchParams.get("state") || !saved.nonce) return fail("state mismatch");

  const clientId = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("missing kakao env");

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
  if (!tokenRes.ok || !token.id_token) return fail(`token ${tokenRes.status} ${token.error_code ?? "no id_token"}`);

  const db = await createClient();
  const { error } = await db.auth.signInWithIdToken({ provider: "kakao", token: token.id_token, nonce: saved.nonce });
  if (error) return fail(`supabase ${error.message}`);

  const res = NextResponse.redirect(`${origin}${safeNext(saved.next)}`);
  res.cookies.delete({ name: COOKIE, path: "/auth/kakao" });
  return res;
}
