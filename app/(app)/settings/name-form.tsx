"use client";

import { useActionState } from "react";
import { setDisplayNameAction } from "../actions";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(setDisplayNameAction, undefined);
  return (
    <form action={action} className="mt-4 space-y-1">
      <label htmlFor="display-name" className="text-xs text-muted">
        내 이름 (배우자에게 보이는 이름)
      </label>
      <div className="flex gap-2">
        <input
          id="display-name"
          name="name"
          maxLength={30}
          defaultValue={current}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent"
        />
        <button type="submit" disabled={pending} className="h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">
          저장
        </button>
      </div>
      {state?.error && <p className="text-sm text-expense">{state.error}</p>}
    </form>
  );
}
