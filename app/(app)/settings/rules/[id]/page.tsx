import { notFound } from "next/navigation";
import { getAppContext } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { listCategories, listPaymentMethods, previewRule } from "@/lib/db/queries";
import type { Rule } from "@/lib/db/types";
import { PageHeader } from "@/components/page-header";
import { RuleForm } from "../rule-form";

export const metadata = { title: "규칙 · 우리집 가계부" };

/** /settings/rules/new 와 /settings/rules/<id> 를 함께 처리 */
export default async function RuleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ keyword?: string; back?: string }>;
}) {
  const { id } = await params;
  const { keyword, back } = await searchParams;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { db, ledger } = await getAppContext();
  const [{ data: categories }, { data: methods }, ruleRes] = await Promise.all([
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
    isNew ? Promise.resolve({ data: null }) : db.from("rules").select("*").eq("id", id).eq("ledger_id", ledger.id).maybeSingle<Rule>(),
  ]);
  const rule = ruleRes.data ?? undefined;
  if (!isNew && !rule) notFound();

  const kw = (rule?.keyword ?? keyword ?? "").slice(0, 40);
  let matchCount: number | null = null;
  if (kw.length >= 2) {
    const { data } = await previewRule(db, ledger.id, kw);
    matchCount = typeof data === "number" ? data : Array.isArray(data) ? data.length : null;
  }
  const safeBack = back === "/inbox" ? "/inbox" : undefined;

  return (
    <>
      <PageHeader title={isNew ? "규칙 만들기" : "규칙 수정"} back={safeBack ?? "/settings/rules"} />
      <div className="rounded-2xl bg-surface p-4">
        <RuleForm
          rule={rule}
          keyword={keyword?.slice(0, 40)}
          back={safeBack}
          categories={toOptions(categories ?? [])}
          paymentMethods={toPaymentOptions(methods ?? [])}
          matchCount={matchCount}
        />
      </div>
    </>
  );
}
