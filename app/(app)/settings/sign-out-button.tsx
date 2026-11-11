"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="mt-3 text-sm text-expense"
    >
      로그아웃
    </button>
  );
}
