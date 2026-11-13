"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Category } from "@/lib/db/types";
import { Field, FormError, SubmitButton, inputClass, useGo } from "@/components/form-bits";
import { saveCategoryAction } from "../../actions";

export function CategoryForm({ category, type }: { category?: Category; type: Category["type"] }) {
  const [state, action] = useActionState(saveCategoryAction, undefined);
  useGo(state);
  return (
    <form action={action} className="space-y-3">
      {category ? <input type="hidden" name="id" value={category.id} /> : <input type="hidden" name="type" value={type} />}
      <Field label="이름" htmlFor="category-name">
        <input
          id="category-name"
          name="name"
          required
          maxLength={30}
          defaultValue={category?.name}
          placeholder={type === "income" ? "예: 부수입" : "예: 반려동물"}
          className={inputClass}
        />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton>{category ? "수정 저장" : "추가"}</SubmitButton>
      {category && (
        <Link href={`/settings/categories?type=${category.type}`} className="block text-center text-sm text-muted">
          취소
        </Link>
      )}
    </form>
  );
}
