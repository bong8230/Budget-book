import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { countCategoryUsage, listCategories } from "@/lib/db/queries";
import type { Category } from "@/lib/db/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/form-bits";
import { deleteCategoryAction } from "../../actions";
import { CategoryForm } from "./category-form";

export const metadata = { title: "카테고리 · 우리집 가계부" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ type?: string; edit?: string; error?: string }> }) {
  const { type: rawType, edit, error } = await searchParams;
  const { db, ledger } = await getAppContext();
  const [{ data }, usage] = await Promise.all([listCategories(db, ledger.id), countCategoryUsage(db, ledger.id).catch(() => new Map<string, number>())]);
  const all = (data ?? []) as Category[];
  const editing = all.find((c) => c.id === edit);
  const type: Category["type"] = editing?.type ?? (rawType === "income" ? "income" : "expense");
  const items = all.filter((c) => c.type === type);
  const tab = "grid h-9 flex-1 place-items-center rounded-full text-sm";

  return (
    <>
      <PageHeader title="카테고리" back="/settings" />
      <p className="mb-4 px-1 text-sm text-muted">이름을 바꾸면 지난 내역에도 바뀐 이름으로 보여요.</p>

      {error === "delete" && (
        <p role="alert" className="mb-3 rounded-xl bg-surface p-3 text-sm text-expense">
          삭제하지 못했어요. 다시 시도해주세요.
        </p>
      )}

      <nav aria-label="카테고리 종류" className="mb-3 flex rounded-full bg-surface p-0.5">
        {(
          [
            ["expense", "지출"],
            ["income", "수입"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/settings/categories?type=${key}`}
            replace
            aria-current={type === key ? "page" : undefined}
            className={`${tab} ${type === key ? "bg-accent font-semibold text-accent-ink" : "text-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="mb-6 rounded-2xl bg-surface p-6 text-center text-sm text-muted">카테고리가 없어요. 아래에서 추가하세요.</p>
      ) : (
        <ul className="mb-6 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {items.map((c) => {
            const used = usage.get(c.id) ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted">{used > 0 ? `내역 ${used}건` : "쓴 내역 없음"}</span>
                </span>
                <Link href={`/settings/categories?edit=${c.id}#category-form`} className="text-sm text-accent" aria-label={`${c.name} 수정`}>
                  수정
                </Link>
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="type" value={c.type} />
                  <ConfirmButton
                    message={
                      used > 0
                        ? `‘${c.name}’을(를) 지울까요? 이 카테고리의 내역 ${used}건은 ‘미분류’가 돼요.`
                        : `‘${c.name}’을(를) 지울까요?`
                    }
                  >
                    삭제
                  </ConfirmButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <section id="category-form" className="scroll-mt-4 rounded-2xl bg-surface p-4">
        <h2 className="mb-3 font-semibold">{editing ? `‘${editing.name}’ 이름 바꾸기` : `${type === "income" ? "수입" : "지출"} 카테고리 추가`}</h2>
        <CategoryForm key={editing?.id ?? `new-${type}`} category={editing} type={type} />
      </section>
    </>
  );
}
