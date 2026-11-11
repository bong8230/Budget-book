/** 로그인 뒤 이동할 경로. 외부 주소로의 오픈 리다이렉트를 막는다 */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
