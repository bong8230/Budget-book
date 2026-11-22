import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/app/_lib/safe-next";

/**
 * 카카오 로그인을 직접 시작한다(OpenID Connect).
 * Supabase 기본 카카오 연동은 이메일 동의항목을 항상 요청해 비즈 앱이 필요하므로,
 * 닉네임·프로필 사진만 요청하고 ID 토큰을 받아 Supabase에 넘긴다.
 */
const COOKIE = "kakao_oidc";

export function GET(request: NextRequest) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  const { origin, searchParams } = request.nextUrl;
  if (!clientId) return NextResponse.redirect(`${origin}/login?error=kakao`);

  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const next = safeNext(searchParams.get("next"));

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/auth/kakao/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid,profile_nickname,profile_image");
  url.searchParams.set("state", state);
  // Supabase는 원래 nonce의 SHA-256(hex)이 토큰에 들어 있는지 확인한다
  url.searchParams.set("nonce", createHash("sha256").update(nonce).digest("hex"));

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/kakao",
    maxAge: 600,
  });
  return res;
}
