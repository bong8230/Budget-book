"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { recordVoiceAction, type VoiceState } from "@/app/(app)/actions";

/* 브라우저 음성 인식(Web Speech API) 최소 타입 */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용하거나, 키보드의 마이크 버튼으로 말해주세요.",
  "service-not-allowed": "이 화면에서는 음성 인식을 쓸 수 없어요. 키보드의 마이크 버튼으로 말해주세요.",
  "no-speech": "말소리가 들리지 않았어요. 다시 눌러 말해주세요.",
  network: "음성 인식 서버에 연결하지 못했어요. 키보드의 마이크 버튼으로 말해주세요.",
};

/**
 * 말로 내역 추가. 무료 규칙 기반 해석(AI 미사용).
 * 마이크 버튼은 브라우저가 음성 인식을 지원할 때만 보이고, 아니면 키보드 받아쓰기로 입력한다.
 */
export function VoiceAdd({ autoStart = false, large = false }: { autoStart?: boolean; large?: boolean }) {
  const [state, action] = useActionState<VoiceState, FormData>(recordVoiceAction, undefined);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(getRecognition() !== null);
  }, []);

  // 저장되면 입력칸 비우기
  useEffect(() => {
    if (state?.ok) setText("");
  }, [state]);

  function listen() {
    const Ctor = getRecognition();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    setMicError(null);
    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText((finalText || interim).trim());
    };
    rec.onerror = (e) => setMicError(MIC_ERRORS[e.error] ?? "음성 인식에 실패했어요. 다시 시도해주세요.");
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) {
        setText(finalText.trim());
        // 상태 반영 뒤 제출
        setTimeout(() => formRef.current?.requestSubmit(), 0);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setMicError("음성 인식을 시작하지 못했어요. 다시 눌러주세요.");
    }
  }

  useEffect(() => {
    if (autoStart && getRecognition()) listen();
    return () => recRef.current?.stop();
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={large ? "space-y-4" : "space-y-2"}>
      <form ref={formRef} action={action} className="flex items-center gap-2">
        <label htmlFor="voice-text" className="sr-only">
          말로 내역 추가
        </label>
        <input
          id="voice-text"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={listening ? "듣고 있어요…" : "예: 마트에서 3천원 결제했어"}
          className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent ${large ? "h-14" : "h-12"}`}
        />
        {supported && (
          <button
            type="button"
            onClick={listen}
            aria-label={listening ? "듣기 멈추기" : "말해서 입력"}
            aria-pressed={listening}
            className={`grid shrink-0 place-items-center rounded-xl ${large ? "size-14" : "size-12"} ${listening ? "animate-pulse bg-expense text-white" : "bg-accent text-accent-ink"}`}
          >
            <MicIcon />
          </button>
        )}
        <SendButton disabled={!text.trim() || listening} large={large} />
      </form>
      {micError && (
        <p role="alert" className="text-sm text-expense">
          {micError}
        </p>
      )}
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-accent" : "text-expense"}`}>
          {state.message}
          {state.ok && state.id && (
            <>
              {" "}
              <Link href={`/transactions/${state.id}`} className="underline">
                수정
              </Link>
            </>
          )}
        </p>
      )}
      {!supported && (
        <p className="text-xs text-muted">키보드의 🎤 버튼을 누르고 말하면 글자로 들어가요.</p>
      )}
    </div>
  );
}

function SendButton({ disabled, large }: { disabled: boolean; large: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`shrink-0 rounded-xl border border-line px-4 font-semibold disabled:opacity-40 ${large ? "h-14" : "h-12"}`}
    >
      {pending ? "추가 중…" : "추가"}
    </button>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}
