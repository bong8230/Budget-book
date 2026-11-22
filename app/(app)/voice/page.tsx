import { VoiceAdd } from "@/components/voice-add";

export const metadata = { title: "말로 추가 · 우리집 가계부" };

/** 홈 화면 아이콘을 길게 눌러 바로 들어오는 음성 입력 화면 */
export default function VoicePage() {
  return (
    <div className="space-y-6 pt-4">
      <header className="px-1">
        <h1 className="text-lg font-bold">말로 추가</h1>
        <p className="mt-1 text-sm text-muted">“마트에서 3천원 결제했어”, “어제 월급 300만원 들어왔어”처럼 말하거나 입력하면 바로 추가돼요.</p>
      </header>
      <VoiceAdd autoStart large />
      <ul className="space-y-1 rounded-2xl bg-surface p-4 text-sm text-muted">
        <li>· 금액은 꼭 넣어주세요 (3천원, 12,000원, 3만5천원)</li>
        <li>· 날짜를 빼면 오늘, “어제”, “15일”도 알아들어요</li>
        <li>· 카테고리는 가게 이름과 자동 분류 규칙으로 정해요. 틀리면 ‘수정’을 누르세요</li>
      </ul>
    </div>
  );
}
