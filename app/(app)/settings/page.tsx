import { getAppContext } from "@/app/_lib/context";
import { getMonthlyBudget, listDeviceTokens, listJoinRequests } from "@/lib/db/queries";
import { approveJoinAction, rejectJoinAction } from "../actions";
import { ConfirmButton } from "@/components/form-bits";
import { monthKey, monthLabel } from "@/components/format";
import { InviteButton } from "./invite-button";
import { BudgetForm } from "./budget-form";
import { DeviceTokens, type DeviceRow } from "./device-tokens";
import { PushToggle } from "./push-toggle";
import { ImportGuide } from "./import-guide";
import { SignOutButton } from "./sign-out-button";
import { NameForm } from "./name-form";
import { DeleteAccount } from "./delete-account";
import Link from "next/link";

export const metadata = { title: "설정 · 우리집 가계부" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { db, user, ledger, members } = await getAppContext();
  const month = monthKey();
  const isOwner = members.find((m) => m.userId === user.id)?.role === "owner";
  const [{ data: budget }, { data: devices }, requests] = await Promise.all([
    getMonthlyBudget(db, ledger.id, `${month}-01`),
    listDeviceTokens(db, ledger.id),
    isOwner ? listJoinRequests(db, ledger.id).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="px-1 text-lg font-bold">설정</h1>

      {welcome && (
        <p className="rounded-2xl bg-accent p-4 text-sm text-accent-ink">
          가계부를 만들었어요! 아래에서 배우자를 초대하고 월 예산을 정해보세요.
        </p>
      )}

      <Section title="가계부" id="members">
        <p className="font-semibold">{ledger.name}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex justify-between">
              <span>{m.userId === user.id ? `${m.name} (나)` : m.name}</span>
              <span className="text-muted">{m.role === "owner" ? "만든 사람" : "멤버"}</span>
            </li>
          ))}
        </ul>
        <NameForm current={members.find((m) => m.userId === user.id)?.name ?? ""} />
        {requests.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="참여 요청">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-accent p-3 text-sm">
                <p>
                  <b>{r.displayName}</b>님이 가계부 참여를 요청했어요
                </p>
                <div className="mt-2 flex gap-2">
                  <form action={approveJoinAction} className="flex-1">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="h-10 w-full rounded-xl bg-accent font-semibold text-accent-ink">
                      승인
                    </button>
                  </form>
                  <form action={rejectJoinAction} className="flex-1">
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton message={`${r.displayName}님의 참여 요청을 거절할까요?`} className="h-10 w-full rounded-xl border border-line font-semibold">
                      거절
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {members.length < 2 && requests.length === 0 && <InviteButton />}
      </Section>

      <Section title={`${monthLabel(month)} 예산`} id="budget">
        <BudgetForm month={month} current={budget ? Number(budget.amount) : null} />
      </Section>

      <Section title="가계부 관리">
        <nav className="-my-1 divide-y divide-line">
          {[
            ["/settings/categories", "카테고리", "지출·수입 카테고리 추가, 이름 바꾸기, 삭제"],
            ["/settings/payment-methods", "결제수단", "카드·통장 목록과 알림 키워드"],
            ["/settings/rules", "자동 분류 규칙", "가져온 내역을 카테고리로 자동 분류"],
            ["/recurring", "반복·할부", "반복 결제 자동 등록, 진행 중인 할부"],
          ].map(([href, title, desc]) => (
            <Link key={href} href={href} className="flex items-center justify-between py-3">
              <span>
                <span className="block">{title}</span>
                <span className="block text-xs text-muted">{desc}</span>
              </span>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          ))}
        </nav>
      </Section>

      <Section title="알림" id="push">
        <PushToggle ledgerId={ledger.id} />
      </Section>

      <Section title="자동 가져오기" id="import">
        <p className="text-sm text-muted">
          은행·카드의 입출금 알림을 이 가계부로 보내면 확인 대기함에 쌓여요. 폰마다 토큰을 하나씩 만드세요.
        </p>
        <DeviceTokens ledgerId={ledger.id} initial={(devices ?? []) as DeviceRow[]} />
        <ImportGuide />
      </Section>

      <Section title="데이터" id="data">
        <p className="text-sm text-muted">가계부의 모든 거래를 엑셀에서 열 수 있는 CSV 파일로 받아요.</p>
        <a href="/api/export?format=csv" download className="mt-3 grid h-11 place-items-center rounded-xl border border-line font-semibold">
          CSV 내보내기
        </a>
      </Section>

      <Section title="계정">
        <p className="text-sm text-muted">{user.email}</p>
        <SignOutButton />
        <DeleteAccount lastMember={members.length <= 1} />
      </Section>

      <p className="px-1 pb-2 text-center text-xs text-muted">
        <Link href="/privacy" className="underline">
          개인정보 처리 안내
        </Link>
      </p>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{title}</h2>
      <div className="rounded-2xl bg-surface p-4">{children}</div>
    </section>
  );
}
