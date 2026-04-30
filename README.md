# Banjjok

초대 코드와 지인 평판을 기반으로 참가자를 검증하고, 관리자가 최종 매칭을 운영하는 소개팅 PWA입니다.

## 서비스 개요

- 참가자는 초대/추천 코드를 통해 가입하고 프로필, 사진, 이상형 정보를 제출합니다.
- 추천인과 지인이 평판을 남기면 신청 상태가 관리자 심사 대상으로 전환됩니다.
- 승인된 참가자는 추천 카드, 관심 표시, 상호 관심, 채팅, 푸시 알림을 사용할 수 있습니다.
- 관리자는 신청자 심사, 매칭 승인/취소, 문의 답변, 공지 발송, 신고 확인을 처리합니다.

## 기술 스택

- Frontend: Vanilla HTML, CSS, JavaScript
- Backend: Supabase Auth, Postgres, Storage, Realtime, Edge Functions
- Hosting: GitHub Pages
- PWA: Web App Manifest, Service Worker, Web Push
- UI Assets: Font Awesome, Pretendard

## 주요 파일

```text
banjjok/
├── index.html                  # 랜딩, 로그인, 가입, 관리자 화면
├── dashboard.html              # 참가자 대시보드
├── js/
│   ├── common.js               # Supabase client, 공통 유틸, 매칭 점수 계산
│   ├── index.js                # 가입, 관리자, 매칭 운영 로직
│   └── dashboard.js            # 참가자 대시보드, 추천, 채팅, 평판 로직
├── css/
│   ├── index.css
│   └── dashboard.css
├── sw.js                       # PWA 캐시, 푸시 알림 처리
├── manifest.json
├── supabase-storage-setup.sql  # Storage bucket/policy 초기 설정
└── supabase-invite-codes-setup.sql
```

## 로컬 실행

```bash
npx http-server . -p 8080 -c-1
```

브라우저에서 `http://localhost:8080`으로 접속합니다.

## 빌드

```bash
bash build.sh
```

`build.sh`는 `js/*.js`를 `js/*.min.js`로 압축하고, `css/*.css`를 `css/*.min.css`로 생성합니다. 현재 HTML은 원본 파일을 참조하므로 프로덕션에서 minified 파일을 쓰려면 HTML의 script/link 경로를 함께 바꿔야 합니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase-storage-setup.sql`을 실행합니다.
3. SQL Editor에서 `supabase-invite-codes-setup.sql`을 실행합니다.
4. `applicants`, `favorites`, `reputations`, `notifications`, `chat_messages`, `admin_users`, `settings`, `reports`, `inquiries`, `push_subscriptions`, `event_logs`, `blocks`, `profile_views`, `match_requests` 테이블과 RLS 정책이 실제 운영 정책에 맞는지 확인합니다.
5. Edge Function `send-push`를 배포하고 VAPID public/private key를 Supabase secrets로 설정합니다.

## 보안 원칙

- Supabase anon key는 브라우저에 공개되는 값입니다. 민감 데이터 보호는 반드시 RLS와 RPC에서 처리해야 합니다.
- service role key, VAPID private key, 관리자 비밀번호, DB dump, `.env*` 파일은 커밋하지 않습니다.
- 관리자 권한 판단은 클라이언트 localStorage가 아니라 `admin_users` 테이블과 RLS/RPC 정책으로 강제합니다.
- 매칭 승인, 상태 변경, 연락처 공개, 채팅 전송은 클라이언트 PATCH/INSERT가 아니라 SECURITY DEFINER RPC로 원자적으로 처리하는 것을 권장합니다.

## 배포 전 체크

```bash
git status --short
bash build.sh
```

브라우저에서 아래 플로우를 확인합니다.

- 신규 가입: 추천 코드 입력, 사진 업로드, 필수값 검증, 중복 제출 방지
- 참가자: 승인 전 제한 UX, 승인 후 추천/관심/채팅/문의
- 주선자: 추천 코드 공유, 평판 작성, 추천자 표시
- 관리자: 신청자 승인/거절, 매칭 승인/취소, 공지/문의/신고 처리
- 모바일: iOS Safari, Android Chrome, 카카오톡 인앱 브라우저

## 권장 리팩토링 방향

현재는 빠른 배포를 위해 정적 파일 구조를 유지하고 있습니다. 정식 런칭 전후로 아래 구조로 점진적으로 분리합니다.

```text
src/
├── config/
│   └── app-config.js
├── services/
│   ├── supabase-client.js
│   ├── applicants.service.js
│   ├── admin.service.js
│   ├── matching.service.js
│   ├── notifications.service.js
│   └── storage.service.js
├── utils/
│   ├── escape.js
│   ├── validation.js
│   ├── matching-score.js
│   └── date.js
├── components/
│   ├── profile-card.js
│   ├── admin-applicant-card.js
│   └── toast.js
├── pages/
│   ├── index-page.js
│   └── dashboard-page.js
└── styles/
    ├── index.css
    └── dashboard.css
supabase/
└── migrations/
```
