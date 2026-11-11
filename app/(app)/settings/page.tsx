import { getAppContext } from "@/app/_lib/context";
import { getMonthlyBudget, listDeviceTokens } from "@/lib/db/queries";
import { monthKey, monthLabel } from "@/components/format";
import { InviteButton } from "./invite-button";
import { BudgetForm } from "./budget-form";
import { DeviceTokens, type DeviceRow } from "./device-tokens";
import { PushToggle } from "./push-toggle";
import { SignOutButton } from "./sign-out-button";
import { NameForm } from "./name-form";

export const metadata = { title: "설정 · 우리집 가계부" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { db, user, ledger, members } = await getAppContext();
  const month = monthKey();
  const [{ data: budget }, { data: devices }] = await Promise.all([
    getMonthlyBudget(db, ledger.id, `${month}-01`),
    listDeviceTokens(db, ledger.id),
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
        {members.length < 2 && <InviteButton />}
      </Section>

      <Section title={`${monthLabel(month)} 예산`} id="budget">
        <BudgetForm month={month} current={budget ? Number(budget.amount) : null} />
      </Section>

      <Section title="알림" id="push">
        <PushToggle ledgerId={ledger.id} />
      </Section>

      <Section title="자동 가져오기" id="import">
        <p className="text-sm text-muted">
          은행·카드의 입출금 알림을 이 가계부로 보내면 확인 대기함에 쌓여요. 폰마다 토큰을 하나씩 만드세요.
        </p>
        <DeviceTokens ledgerId={ledger.id} initial={(devices ?? []) as DeviceRow[]} />
      </Section>

      <Section title="계정">
        <p className="text-sm text-muted">{user.email}</p>
        <SignOutButton />
      </Section>
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
