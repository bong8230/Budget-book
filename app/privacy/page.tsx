import Link from "next/link";

export const metadata = { title: "개인정보 처리 안내 · 우리집 가계부" };

export default function PrivacyPage() {
  return (
    <main className="safe-top mx-auto max-w-md space-y-5 px-5 py-6 text-sm leading-relaxed">
      <Link href="/settings" className="text-muted">
        ‹ 설정
      </Link>
      <h1 className="text-xl font-bold">개인정보 처리 안내</h1>

      <section>
        <h2 className="font-semibold">무엇을 저장하나요</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
          <li>로그인 이메일, 가계부에서 쓰는 표시 이름</li>
          <li>직접 입력하거나 등록한 거래(금액, 날짜, 카테고리, 메모, 가맹점, 결제수단)</li>
          <li>자동 가져오기로 받은 입출금 알림 원문 (확인 대기함 처리용)</li>
          <li>웹 푸시 알림을 보내기 위한 브라우저 구독 정보, 기기 토큰의 해시값</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">알림 원문은 어떻게 다루나요</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
          <li>입금·출금·승인·결제 같은 키워드가 없는 알림은 저장하지 않고 버려요.</li>
          <li>원문은 가져온 본인만 볼 수 있어요. 배우자에게는 등록한 거래만 보여요.</li>
          <li>등록하거나 무시한 내역의 원문은 30일 뒤 지워요.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">누가 볼 수 있나요</h2>
        <p className="mt-1 text-muted">
          같은 가계부 멤버(부부)만 볼 수 있어요. 데이터베이스 수준의 접근 제어(RLS)로 다른 가계부의 데이터는 조회되지 않아요.
        </p>
      </section>

      <section>
        <h2 className="font-semibold">내보내기와 삭제</h2>
        <p className="mt-1 text-muted">
          설정 → 데이터에서 언제든 CSV로 내보낼 수 있고, 설정 → 계정에서 탈퇴하면 계정 정보가 바로 지워져요. 마지막 멤버가 탈퇴하면 가계부와 모든 거래도 함께 지워져요.
        </p>
      </section>

      <section>
        <h2 className="font-semibold">AI 도우미</h2>
        <p className="mt-1 text-muted">
          AI에게 묻기를 쓰면 질문과, 답에 필요한 거래 내역(날짜·금액·카테고리·메모)이 Anthropic의 Claude API로 전송돼요. 대화 내용은 앱에 저장하지 않아요. AI 비용은 그달 남은 예산의 10%를 넘지 않게 제한돼요.
        </p>
      </section>

      <section>
        <h2 className="font-semibold">처리 위탁</h2>
        <p className="mt-1 text-muted">데이터 저장과 로그인은 Supabase, 웹 서비스 호스팅은 Vercel, AI 응답은 Anthropic에서 처리해요.</p>
      </section>
    </main>
  );
}
