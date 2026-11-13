# 우리집 가계부: 제품 명세

부부 두 사람이 함께 쓰는 공동 가계부 웹앱(PWA)입니다. 휴대폰 홈 화면에 추가해 앱처럼 씁니다.

## 확정된 요구사항 (2026-11-11)

| 항목 | 결정 |
|---|---|
| 사용자 | 부부 2명. 가계부를 만든 사람이 owner, 초대받은 사람이 member. 권한 차이는 초대·가계부 설정 정도 |
| 돈 구분 | 모든 수입·지출을 하나의 공동 가계부로 합산. 정산·분담 비율·개인 지출 구분 없음 |
| 자동 가져오기 | 아이폰·안드로이드 모두 지원. 은행·카드사별 규칙이 아니라 `입금`·`출금`(및 `승인`·`결제`·`취소`) 키워드가 든 알림·문자를 범용 파싱 |
| 가져온 내역 승인 | 각자 자기 기기에서 가져온 내역만 등록·무시·수정 후 등록 |
| 예산 | 가계부 전체 월 예산 1개 |
| 알림 | 상대방이 거래를 입력했을 때, 확인 대기 내역이 쌓였을 때 (웹 푸시) |
| 스택 | Next.js(App Router) + TypeScript + Tailwind, Supabase(Postgres·Auth·Realtime·RLS), Vercel |
| 저장소 | GitHub 공개 저장소. 시크릿은 커밋하지 않고 `.env.example`만 둔다 |

## MVP 기능

1. **로그인**: Supabase Auth 이메일 매직 링크
2. **가계부와 초대**: 가계부 생성, 초대 링크(`/join/<code>`, 7일 유효, 1회용)로 배우자 합류
3. **거래 CRUD**: 수입·지출·이체. 금액(원 단위 정수), 날짜, 카테고리, 메모, 작성자
4. **조회**: 월별 목록(날짜별 그룹), 월 합계(수입·지출), 카테고리별 합계
5. **월 예산**: 전체 예산 1개, 사용액·남은 금액·소진율
6. **확인 대기함**: 자동으로 가져온 내역을 등록·무시·수정 후 등록. 본인이 가져온 내역만 보이고 처리할 수 있음
7. **실시간 동기화**: 상대방이 입력하면 화면에 바로 반영
8. **웹 푸시**: 위 '알림' 두 가지 상황

## 자동 가져오기 흐름

```
[휴대폰 알림·문자]
   │  안드로이드: 알림 전달 앱 / 아이폰: 단축어 '메시지' 자동화
   ▼
POST /api/import  (Authorization: Bearer <기기 토큰>)
   │  키워드 필터 → 금액·입출금 방향·가맹점·시각 파싱 → 중복 검사
   ▼
imports 테이블 (status = pending, owner = 토큰 주인)
   │  확인 대기 푸시 알림
   ▼
확인 대기함 화면 ── 등록 → transactions 생성 (status = accepted)
                 └─ 무시 → status = ignored
```

### 웹훅 요청 형식 (클라이언트 기기 → 서버)

```http
POST /api/import
Authorization: Bearer <설정 화면에서 발급한 기기 토큰>
Content-Type: application/json

{ "text": "[Web발신] 신한카드(1234)승인 홍*동 12,300원 11/11 12:30 스타벅스", "source": "sms", "received_at": "2026-11-11T12:30:00+09:00" }
```

- `source`: `sms` | `notification` | `manual`
- `received_at`은 생략할 수 있으며, 생략하면 서버 수신 시각을 사용
- 응답: `201 { status: "pending" | "duplicate" | "skipped" }`. 키워드가 없으면 `skipped`

### 파싱 규칙 (범용)

- 방향: `입금` → 수입, `출금`·`승인`·`결제`·`사용` → 지출, `취소`가 함께 있으면 무시 후보로 표시
- 금액: `12,300원`처럼 `원` 앞의 숫자. `잔액` 뒤의 숫자는 제외
- 가맹점·메모: 금액·날짜·카드번호를 제거하고 남은 텍스트
- 중복: (owner, 금액, 방향, 분 단위 시각, 정규화한 텍스트)의 해시

## 화면 구성

| 경로 | 화면 |
|---|---|
| `/login` | 이메일 매직 링크 로그인 |
| `/` | 홈: 이번 달 예산 게이지, 수입·지출 합계, 확인 대기 건수, 최근 거래 |
| `/transactions` | 월별 내역 (월 이동, 날짜별 그룹, 카테고리 합계) |
| `/transactions/new` · `/transactions/[id]` | 빠른 입력·수정 (금액 키패드 우선) |
| `/inbox` | 확인 대기함 |
| `/settings` | 가계부 이름, 배우자 초대, 월 예산, 카테고리, 기기 토큰(가져오기), 푸시 알림 |
| `/onboarding` | 첫 로그인 시 가계부 만들기 |
| `/join/[code]` | 초대 수락 |

## 범위 밖 (나중에)

- 오픈뱅킹·마이데이터 연동 (사업자 인가 필요)
- CSV 업로드, 영수증 OCR, 고정 지출 자동 등록, 통계 차트, 다중 통화

## 작업 분담 (Claude ↔ Codex)

| 담당 | 파일 |
|---|---|
| Codex | `supabase/**`, `lib/db/**`, `lib/import/**`, `lib/budget.ts`, `app/api/**` |
| Claude | 루트 설정 파일, `docs/**`, `app/**`(api 제외), `components/**`, `public/**` |

---

# 2차 기능 (2026-11-13 확정)

참고: [we-promise/sure](https://github.com/we-promise/sure)의 기능 아이디어만 참고했습니다. Sure는 AGPL-3.0이므로 **코드는 복사하지 않고** 새로 작성합니다.

| # | 기능 | 요약 |
|---|---|---|
| 1 | 자동 분류 규칙 | 키워드(가맹점·원문 포함) → 카테고리·종류·결제수단 지정, 선택적으로 자동 등록 |
| 2 | 중복 병합 | 가져온 내역이 이미 입력된 거래와 같아 보이면 '합치기' 제안 |
| 3 | 이체 매칭 | 카드대금·내 계좌 간 이동은 지출이 아닌 이체로 분류해 이중 집계 방지 |
| 4 | 결제수단 표시 | 카드·통장·현금 목록. 거래마다 결제수단 표시 (잔액 관리 없음) |
| 5 | 고정지출 | 월세·통신비·구독 등록과 자동 감지, '이번 달 나갈 돈'과 처리 여부 |
| 7 | 리포트 | 최근 6개월 수입·지출 추이, 카테고리 비중, 전월 대비 |

## 데이터 모델 (추가)

```
payment_methods  id, ledger_id, name, kind('card'|'account'|'cash'), owner_id null, keywords text[], archived_at null, created_at
rules            id, ledger_id, keyword, category_id null, set_type null('income'|'expense'|'transfer'),
                 payment_method_id null, auto_accept bool, created_by, created_at
recurring_items  id, ledger_id, name, type('income'|'expense'|'transfer'), amount, day_of_month 1..31,
                 category_id null, payment_method_id null, keyword, active bool, created_at
transactions     + payment_method_id null, + merchant text null
imports          + category_id null, + payment_method_id null, + duplicate_of uuid null (transactions),
                 + rule_id null, type에 'transfer' 허용
```

## 처리 규칙

- **가져오기 파이프라인** (`/api/import`): 파싱 → 결제수단 매칭(`keywords` 중 하나가 원문에 포함) → 규칙 적용(먼저 만든 규칙 우선, 키워드가 원문 또는 가맹점에 포함) → 이체 판정 → 중복 판정 → `auto_accept` 규칙이고 중복 후보가 없으면 바로 거래 생성, 아니면 pending
- **이체 판정**: `카드대금|카드결제|결제대금|자동이체.*카드|내계좌|본인계좌` 키워드, 또는 규칙의 `set_type='transfer'`. 이체는 예산·지출 합계에서 제외
- **중복 판정**: 같은 가계부에서 금액과 종류가 같고 날짜가 ±1일 이내이며, 아직 어떤 import와도 연결되지 않은 거래가 있으면 `duplicate_of`로 지정
- **합치기**: import를 accepted로 바꾸고 `transaction_id = duplicate_of`. 거래에 결제수단·가맹점이 비어 있으면 import 값으로 채움
- **고정지출 상태** (월 단위): 해당 월에 `keyword`가 메모·가맹점에 포함되고 금액이 ±10% 이내인 거래가 있으면 '처리됨', 없으면 예정일과 함께 '예정'. 31일 같은 날짜는 그 달의 말일로 보정
- **고정지출 감지**: 최근 3개월 중 2개월 이상, 같은 가맹점(정규화)에서 금액 차이 ±10% 이내 지출 → 후보로 제안 (이미 등록된 키워드는 제외)
- **리포트**: 최근 6개월 월별 수입·지출(이체 제외), 이번 달 카테고리 비중, 전월 대비 카테고리별 증감

## 테스트 전략

1. 순수 로직 단위 테스트 (Vitest): 파서, 규칙 매칭, 이체·중복 판정, 고정지출 상태·감지, 리포트 집계
2. DB 테스트 (PGlite): 마이그레이션 적용, RLS(다른 가계부 접근 차단, 본인 import만), RPC(가져오기 처리, 합치기)
3. E2E (Playwright, 클라우드 Supabase 연결 후): 로그인 → 가계부 → 입력 → 가져오기 웹훅 → 확인 대기 → 규칙 → 리포트

## 작업 분담 (2차)

| 담당 | 범위 |
|---|---|
| Codex | 마이그레이션, `lib/db/**`(types·queries), `lib/import/**`(파이프라인·결제수단·이체·중복), `lib/rules/**`, `lib/recurring/**`(상태·감지), `lib/report/**`(집계), `app/api/**`, 로직·DB 테스트 |
| Claude | 화면 전체: 결제수단·규칙 설정, 고정지출 화면, 리포트 화면, 확인 대기함(중복·이체·규칙 만들기), 입력 폼·목록의 결제수단, 홈 '이번 달 나갈 돈', E2E 테스트(`e2e/**`, `playwright.config.ts`) |
