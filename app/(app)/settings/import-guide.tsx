"use client";

import { useEffect, useState } from "react";
import { CopyField } from "./device-tokens";

type Platform = "ios" | "android";

const SMS_BODY = '{"text": "<단축어 입력>", "source": "sms"}';
const ANDROID_BODY = '{"text": "%제목% %본문%", "source": "notification", "app": "%패키지명%"}';

/** 폰 종류별 자동 가져오기 설정 안내 */
export function ImportGuide() {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (/android/i.test(navigator.userAgent)) setPlatform("android");
  }, []);

  const webhook = `${origin}/api/import`;
  const tab = "h-9 flex-1 rounded-full text-sm";

  return (
    <div id="import-guide" className="mt-4 scroll-mt-4 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">설정 방법</h3>
      <div role="tablist" aria-label="폰 종류" className="mt-2 flex rounded-full bg-surface-2 p-0.5">
        {(
          [
            ["ios", "아이폰"],
            ["android", "안드로이드"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={platform === key}
            onClick={() => setPlatform(key)}
            className={`${tab} ${platform === key ? "bg-accent font-semibold text-accent-ink" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-3 space-y-3 text-sm">
        {platform === "ios" ? (
          <>
            <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed">
              아이폰은 다른 앱의 <b>푸시 알림</b>을 어떤 앱도 읽을 수 없게 막혀 있어요. 그래서 <b>문자</b>로 오는 알림만 가져올 수 있어요.
              카드사·은행 앱에서 승인·입출금 알림을 <b>문자(SMS)</b>로 받도록 신청하세요. 카드사에 따라 월 몇백 원이 붙을 수 있어요.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>위에서 이 폰의 토큰을 만들고 <b>헤더 Authorization</b> 값을 복사해 두세요.</li>
              <li>
                <b>단축어</b> 앱 → 아래 <b>자동화</b> → <b>+</b> → <b>메시지</b>
              </li>
              <li>
                <b>메시지 포함</b>에 <code>원</code> 입력 → <b>즉시 실행</b> 선택 (알림 끄기 권장)
              </li>
              <li>
                <b>새로운 빈 자동화</b> → 동작 <b>URL 콘텐츠 가져오기</b> 추가
              </li>
              <li>
                URL에 웹훅 주소를 넣고, 펼쳐서 다음처럼 정하세요.
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                  <li>방법: POST</li>
                  <li>헤더: 키 Authorization, 값 = 복사한 Bearer 값</li>
                  <li>본문 요청: JSON — text = 단축어 입력(메시지), source = sms</li>
                </ul>
              </li>
              <li>카드로 결제해 보고 위 기기 목록의 <b>마지막 수신</b> 시각이 바뀌면 성공이에요.</li>
            </ol>
            <CopyField label="웹훅 주소" value={webhook} />
            <CopyField label="본문 형식 (참고)" value={SMS_BODY} />
          </>
        ) : (
          <>
            <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed">
              안드로이드는 카드·은행 <b>앱 푸시 알림</b>과 <b>문자</b>를 모두 가져올 수 있어요. 알림을 웹훅으로 전달하는 앱이 필요해요.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>위에서 이 폰의 토큰을 만들고 <b>헤더 Authorization</b> 값을 복사해 두세요.</li>
              <li>
                Play 스토어에서 알림을 <b>웹훅(HTTP)</b>으로 전달하는 앱을 설치하세요. ‘알림 전달 웹훅’, ‘notification forwarder’로 검색하면 나와요.
              </li>
              <li>
                그 앱에 <b>알림 접근 권한</b>을 주고, 전달할 앱으로 카드·은행 앱(신한, 삼성카드, KB국민 등)과 <b>메시지</b> 앱을 고르세요.
              </li>
              <li>
                전달 방식을 다음처럼 정하세요.
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                  <li>방법: POST, 형식: JSON</li>
                  <li>URL: 웹훅 주소</li>
                  <li>헤더: Authorization = 복사한 Bearer 값</li>
                  <li>본문: 아래 형식. %제목%·%본문%·%패키지명% 자리에 그 앱이 주는 변수를 넣으세요 (app은 없어도 돼요)</li>
                </ul>
              </li>
              <li>
                휴대폰 설정 → 배터리에서 그 앱을 <b>최적화 제외(제한 없음)</b>로 바꿔야 화면이 꺼져 있어도 전달돼요.
              </li>
              <li>카드로 결제해 보고 위 기기 목록의 <b>마지막 수신</b> 시각이 바뀌면 성공이에요.</li>
            </ol>
            <CopyField label="웹훅 주소" value={webhook} />
            <CopyField label="본문 형식" value={ANDROID_BODY} />
            <p className="text-xs text-muted">
              같은 결제가 문자와 앱 알림으로 두 번 와도 괜찮아요. 금액이 같고 10분 안에 온 알림은 하나로 합쳐요.
            </p>
          </>
        )}
        <p className="text-xs text-muted">
          입금·출금·승인·결제가 들어간 알림만 저장하고 나머지는 버려요. 가져온 내역은 바로 등록되지 않고 확인 대기함에 쌓여요.
        </p>
      </div>
    </div>
  );
}
