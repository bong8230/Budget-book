import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { getMyLedger, listMembers } from "@/lib/db/queries";
import type { Ledger } from "@/lib/db/types";

export type Member = { userId: string; role: "owner" | "member"; name: string };

/** 로그인한 사용자와 그 사용자의 가계부. 없으면 로그인·온보딩으로 보낸다 */
export const getAppContext = cache(async () => {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: ledger } = await getMyLedger(db);
  if (!ledger) redirect("/onboarding");

  const { data: memberRows } = await listMembers(db, ledger.id);
  const members: Member[] = (memberRows ?? []).map((m: { user_id: string; role: "owner" | "member"; display_name?: string | null }) => ({
    userId: m.user_id,
    role: m.role,
    name: m.display_name || (m.user_id === user.id ? (user.email?.split("@")[0] ?? "나") : "배우자"),
  }));

  return { db, user, ledger: ledger as Ledger, members };
});

export function memberName(members: Member[], userId: string, meId: string): string {
  if (userId === meId) return "나";
  return members.find((m) => m.userId === userId)?.name ?? "배우자";
}
