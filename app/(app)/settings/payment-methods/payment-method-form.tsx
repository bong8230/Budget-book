"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PaymentMethod } from "@/lib/db/types";
import { Field, FormError, SubmitButton, inputClass, useGo } from "@/components/form-bits";
import { savePaymentMethodAction } from "../../actions";

export function PaymentMethodForm({ method, meId }: { method?: PaymentMethod; meId: string }) {
  const [state, action] = useActionState(savePaymentMethodAction, undefined);
  useGo(state);
  return (
    <form action={action} className="space-y-3">
      {method && <input type="hidden" name="id" value={method.id} />}
      <Field label="이름" htmlFor="pm-name">
        <input id="pm-name" name="name" required maxLength={40} defaultValue={method?.name} placeholder="예: 신한 체크카드" className={inputClass} />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-sm text-muted">종류</legend>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ["card", "카드"],
              ["account", "통장"],
              ["cash", "현금"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-line has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink">
              <input type="radio" name="kind" value={value} defaultChecked={(method?.kind ?? "card") === value} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="알림 키워드" htmlFor="pm-keywords" hint="쉼표로 구분. 알림 문자에 나오는 카드사 이름이나 끝 4자리를 넣으세요. 예: 신한, 1234">
        <input id="pm-keywords" name="keywords" maxLength={300} defaultValue={method?.keywords.join(", ")} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mine" defaultChecked={method ? method.owner_id === meId : true} className="size-4 accent-[var(--accent)]" />내 결제수단 (끄면 공용)
      </label>
      <FormError error={state?.error} />
      <SubmitButton>{method ? "수정 저장" : "추가"}</SubmitButton>
      {method && (
        <Link href="/settings/payment-methods" className="block text-center text-sm text-muted">
          취소
        </Link>
      )}
    </form>
  );
}
