"use client";

import { useFormStatus } from "react-dom";

export const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent disabled:opacity-50";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingText = "저장 중…" }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 w-full rounded-xl bg-accent font-bold text-accent-ink disabled:opacity-50">
      {pending ? pendingText : children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-expense">
      {error}
    </p>
  );
}

/** 위험한 작업(삭제 등) 확인 후 제출 */
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={className ?? "text-sm text-expense disabled:opacity-50"}
    >
      {children}
    </button>
  );
}
