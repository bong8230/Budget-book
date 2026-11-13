import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { listCategories, listPaymentMethods, listRules } from "@/lib/db/queries";
import type { Rule } from "@/lib/db/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/form-bits";
import { deleteRuleAction } from "../../actions";

export const metadata = { title: "자동 분류 규칙 · 우리집 가계부" };

const TYPE_LABEL = { income: "수입", expense: "지출", transfer: "이체" } as const;

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { db, ledger } = await getAppContext();
  const [{ data }, { data: categories }, { data: methods }] = await Promise.all([
    listRules(db, ledger.id),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
  ]);
  const rules = (data ?? []) as Rule[];
  const cat = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const pm = new Map((methods ?? []).map((m) => [m.id, m.name]));

  return (
    <>
      <PageHeader title="자동 분류 규칙" back="/settings">
        <Link href="/settings/rules/new" className="text-sm font-semibold text-accent">
          추가
        </Link>
      </PageHeader>
      <p className="mb-4 px-1 text-sm text-muted">
        가져온 알림에 키워드가 들어 있으면 카테고리·종류·결제수단을 자동으로 정해요. 먼저 만든 규칙이 우선이에요.
      </p>
      {error === "delete" && (
        <p role="alert" className="mb-3 rounded-xl bg-surface p-3 text-sm text-expense">
          삭제하지 못했어요. 다시 시도해주세요.
        </p>
      )}

      {rules.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">
          <p>아직 규칙이 없어요.</p>
          <p className="mt-1">확인 대기함에서 ‘자동 분류 규칙 만들기’를 누르면 쉽게 만들 수 있어요.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {rules.map((r) => {
            const effects = [
              r.set_type && TYPE_LABEL[r.set_type],
              r.category_id && cat.get(r.category_id),
              r.payment_method_id && pm.get(r.payment_method_id),
            ].filter(Boolean);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/settings/rules/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate">
                    ‘<b>{r.keyword}</b>’ → {effects.join(" · ") || "변경 없음"}
                  </span>
                  {r.auto_accept && <span className="text-xs text-income">확인 없이 자동 등록</span>}
                </Link>
                <form action={deleteRuleAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton message={`‘${r.keyword}’ 규칙을 지울까요?`}>삭제</ConfirmButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
