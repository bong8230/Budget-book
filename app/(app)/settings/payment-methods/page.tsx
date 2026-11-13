import { getAppContext, memberName } from "@/app/_lib/context";
import { listPaymentMethods } from "@/lib/db/queries";
import type { PaymentMethod } from "@/lib/db/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/form-bits";
import { archivePaymentMethodAction } from "../../actions";
import { PaymentMethodForm } from "./payment-method-form";
import Link from "next/link";

export const metadata = { title: "결제수단 · 우리집 가계부" };

const KIND_LABEL: Record<PaymentMethod["kind"], string> = { card: "카드", account: "통장", cash: "현금" };

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const { db, user, ledger, members } = await getAppContext();
  const { data } = await listPaymentMethods(db, ledger.id);
  const methods = ((data ?? []) as PaymentMethod[]).filter((m) => !m.archived_at);
  const editing = methods.find((m) => m.id === edit);

  return (
    <>
      <PageHeader title="결제수단" back="/settings" />
      <p className="mb-4 px-1 text-sm text-muted">
        거래에 어떤 카드·통장을 썼는지 표시해요. <b className="text-ink">알림 키워드</b>를 넣으면 가져온 알림에서 자동으로 알아봐요.
      </p>
      {error === "archive" && (
        <p role="alert" className="mb-3 rounded-xl bg-surface p-3 text-sm text-expense">
          삭제하지 못했어요. 다시 시도해주세요.
        </p>
      )}

      {methods.length > 0 && (
        <ul className="mb-6 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-muted">
                  {KIND_LABEL[m.kind]}
                  {m.owner_id ? ` · ${memberName(members, m.owner_id, user.id)}` : " · 공용"}
                  {m.keywords.length > 0 ? ` · 키워드 ${m.keywords.join(", ")}` : ""}
                </span>
              </span>
              <Link href={`/settings/payment-methods?edit=${m.id}`} className="text-sm text-accent">
                수정
              </Link>
              <form action={archivePaymentMethodAction}>
                <input type="hidden" name="id" value={m.id} />
                <ConfirmButton message={`‘${m.name}’을(를) 목록에서 지울까요? 기존 거래의 표시는 그대로 남아요.`}>삭제</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-3 font-semibold">{editing ? `‘${editing.name}’ 수정` : "결제수단 추가"}</h2>
        <PaymentMethodForm key={editing?.id ?? "new"} method={editing} meId={user.id} />
      </section>
    </>
  );
}
