# 우리집 가계부

부부가 함께 쓰는 공동 가계부 웹앱입니다. 휴대폰 홈 화면에 추가하면 앱처럼 쓸 수 있습니다(PWA).

- 둘이 입력한 수입·지출을 하나의 가계부로 합산하고 실시간으로 동기화
- 전체 월 예산과 남은 금액
- 은행·카드의 입출금 알림을 자동으로 가져와 **확인 대기함**에서 등록하거나 무시
- 상대방 입력과 확인 대기 내역을 웹 푸시로 알림

자세한 명세는 [docs/SPEC.md](docs/SPEC.md), 알림 가져오기 설정은 [docs/IMPORT_SETUP.md](docs/IMPORT_SETUP.md)를 보세요.

## 기술 스택

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime, RLS) · Vercel

## 로컬 실행

```sh
npm install
cp .env.example .env.local   # Supabase 키 등을 채운다
npm run dev
```

### Supabase 준비

1. [Supabase](https://supabase.com)에서 프로젝트를 만듭니다.
2. `supabase/migrations/`의 SQL을 순서대로 실행합니다. SQL Editor에 붙여 넣거나 `supabase db push`를 씁니다.
3. Authentication → URL Configuration에 사이트 주소와 `/auth/callback`을 추가합니다.
4. 프로젝트 URL과 키를 `.env.local`에 넣습니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint |
| `npm test` | 단위 테스트 (Vitest) |

## 보안

공개 저장소입니다. `.env*` 파일은 `.gitignore`로 제외되며, 키는 Vercel 환경변수로만 설정합니다.
