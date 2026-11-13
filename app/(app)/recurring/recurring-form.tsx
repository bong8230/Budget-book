"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { RecurringItem } from "@/lib/db/types";
import type { CategoryOption, PaymentOption } from "@/components/transaction-form";
import { Field, FormError, SubmitButton, inputClass, useGo } from "@/components/form-bits";
import { saveRecurringAction } from "../actions";
import { todayIso } from "@/components/format";

const fmt = new Intl.NumberFormat("ko-KR");

type Props = { item?: RecurringItem; categories: CategoryOption[]; paymentMethods: PaymentOption[] };

export function RecurringForm({ item, categories, paymentMethods }: Props) {
  const [state, action] = useActionState(saveRecurringAction, undefined);
  useGo(state);
  const [type, setType] = useState<string>(item?.type ?? "expense");
  const [amount, setAmount] = useState(item ? fmt.format(Number(item.amount)) : "");
  const [endMode, setEndMode] = useState(item?.end_date ? "date" : item?.max_count ? "count" : "none");
  const visible = type === "transfer" ? [] : categories.filter((c) => c.type === type);

  return (
    <form action={action} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="이름" htmlFor="rc-name">
        <input id="rc-name" name="name" required maxLength={40} defaultValue={item?.name} placeholder="예: 월세, 넷플릭스" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="금액" htmlFor="rc-amount">
          <input
            id="rc-amount"
            name="amount"
            required
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const d = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
              setAmount(d ? fmt.format(Number(d)) : "");
            }}
            className={`${inputClass} tabular text-right`}
          />
        </Field>
        <Field label="주기" htmlFor="rc-frequency">
          <select id="rc-frequency" name="frequency" defaultValue={item?.frequency ?? "monthly"} className={inputClass}>
            <option value="weekly">매주</option>
            <option value="monthly">매달</option>
            <option value="yearly">매년</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일" htmlFor="rc-start">
          <input id="rc-start" name="startDate" type="date" required defaultValue={item?.start_date ?? todayIso()} className={inputClass} />
        </Field>
        <Field label="끝" htmlFor="rc-end-mode">
          <select id="rc-end-mode" name="endMode" value={endMode} onChange={(e) => setEndMode(e.target.value)} className={inputClass}>
            <option value="none">계속</option>
            <option value="date">날짜까지</option>
            <option value="count">횟수만큼</option>
          </select>
        </Field>
      </div>
      {endMode === "date" && (
        <Field label="끝나는 날" htmlFor="rc-end-date">
          <input id="rc-end-date" name="endDate" type="date" required defaultValue={item?.end_date ?? ""} className={inputClass} />
        </Field>
      )}
      {endMode === "count" && (
        <Field label="횟수" htmlFor="rc-max-count">
          <input id="rc-max-count" name="maxCount" type="number" inputMode="numeric" min={1} max={600} required defaultValue={item?.max_count ?? 12} className={inputClass} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoCreate" defaultChecked={item ? item.auto_create : true} className="size-4 accent-[var(--accent)]" />
        날짜가 되면 내역에 자동으로 등록
      </label>
      <Field label="종류" htmlFor="rc-type">
        <select id="rc-type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="expense">지출</option>
          <option value="income">수입 (월급 등)</option>
          <option value="transfer">이체 (적금·카드대금)</option>
        </select>
      </Field>
      {visible.length > 0 && (
        <Field label="카테고리" htmlFor="rc-category">
          <select id="rc-category" name="categoryId" defaultValue={item?.category_id ?? ""} className={inputClass}>
            <option value="">정하지 않음</option>
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {paymentMethods.length > 0 && (
        <Field label="결제수단" htmlFor="rc-pm">
          <select id="rc-pm" name="paymentMethodId" defaultValue={item?.payment_method_id ?? ""} className={inputClass}>
            <option value="">정하지 않음</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="알아볼 키워드" htmlFor="rc-keyword" hint="거래 메모나 가맹점에 이 글자가 있으면 처리된 것으로 봐요. 비우면 이름을 써요.">
        <input id="rc-keyword" name="keyword" maxLength={40} defaultValue={item?.keyword} className={inputClass} />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton>{item ? "수정 저장" : "추가"}</SubmitButton>
      {item && (
        <Link href="/recurring" className="block text-center text-sm text-muted">
          취소
        </Link>
      )}
    </form>
  );
}
