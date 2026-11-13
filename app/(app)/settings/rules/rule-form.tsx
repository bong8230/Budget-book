"use client";

import { useActionState, useState } from "react";
import type { Rule } from "@/lib/db/types";
import type { CategoryOption, PaymentOption } from "@/components/transaction-form";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-bits";
import { saveRuleAction } from "../../actions";

type Props = {
  rule?: Rule;
  keyword?: string;
  back?: string;
  categories: CategoryOption[];
  paymentMethods: PaymentOption[];
  matchCount: number | null;
};

export function RuleForm({ rule, keyword, back, categories, paymentMethods, matchCount }: Props) {
  const [state, action] = useActionState(saveRuleAction, undefined);
  const [setType, setSetType] = useState<string>(rule?.set_type ?? "");
  const visible = setType === "transfer" ? [] : categories.filter((c) => !setType || c.type === setType);

  return (
    <form action={action} className="space-y-4">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <Field label="키워드" htmlFor="rule-keyword" hint="알림 원문이나 가맹점 이름에 이 글자가 들어 있으면 적용돼요.">
        <input id="rule-keyword" name="keyword" required minLength={2} maxLength={40} defaultValue={rule?.keyword ?? keyword} className={inputClass} />
      </Field>
      {matchCount != null && <p className="-mt-2 text-xs text-muted">최근 내역 중 {matchCount}건이 이 키워드와 맞아요.</p>}

      <Field label="종류 바꾸기" htmlFor="rule-type">
        <select id="rule-type" name="setType" value={setType} onChange={(e) => setSetType(e.target.value)} className={inputClass}>
          <option value="">그대로 두기</option>
          <option value="expense">지출</option>
          <option value="income">수입</option>
          <option value="transfer">이체 (지출 합계·예산에서 제외)</option>
        </select>
      </Field>

      {setType !== "transfer" && (
        <Field label="카테고리" htmlFor="rule-category">
          <select id="rule-category" name="categoryId" defaultValue={rule?.category_id ?? ""} className={inputClass}>
            <option value="">정하지 않음</option>
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.type === "income" ? "수입 · " : ""}
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {paymentMethods.length > 0 && (
        <Field label="결제수단" htmlFor="rule-pm">
          <select id="rule-pm" name="paymentMethodId" defaultValue={rule?.payment_method_id ?? ""} className={inputClass}>
            <option value="">정하지 않음</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
        <input type="checkbox" name="autoAccept" defaultChecked={rule?.auto_accept ?? false} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          확인 없이 바로 등록
          <span className="block text-xs text-muted">이미 입력한 내역과 겹쳐 보이면 이 설정과 상관없이 확인 대기함에 남겨요.</span>
        </span>
      </label>

      <FormError error={state?.error} />
      <SubmitButton>{rule ? "수정 저장" : "규칙 만들기"}</SubmitButton>
    </form>
  );
}
