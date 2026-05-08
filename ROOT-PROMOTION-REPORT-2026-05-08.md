# Root Promotion Report — 2026-05-08

## 요약

`v2` 앱을 GitHub Pages 루트 서비스로 승격했다.

- 기존 접속 주소: `https://kyhwow-rgb.github.io/banjjok/v2/`
- 새 메인 접속 주소: `https://kyhwow-rgb.github.io/banjjok/`
- 적용 브랜치: `v2`
- 최종 푸시 커밋: `867d860 feat: promote v2 app to GitHub Pages root`

## 백업 위치

기존 루트 서비스 파일은 아래 디렉터리에 백업했다.

```text
legacy-root-2026-05-08/
```

백업에 포함된 주요 파일/디렉터리:

```text
legacy-root-2026-05-08/index.html
legacy-root-2026-05-08/manifest.json
legacy-root-2026-05-08/sw.js
legacy-root-2026-05-08/css/
legacy-root-2026-05-08/js/
legacy-root-2026-05-08/icons/
legacy-root-2026-05-08/dashboard.html
legacy-root-2026-05-08/matchmaker.html
legacy-root-2026-05-08/clear-cache.html
legacy-root-2026-05-08/og-image.svg
```

## 루트 승격 작업

`v2` 정적 앱 파일을 루트로 복사했다.

복사/승격된 주요 항목:

```text
v2/index.html      -> index.html
v2/css/            -> css/
v2/js/             -> js/
v2/icons/          -> icons/
v2/manifest.json   -> manifest.json
v2/sw.js           -> sw.js
```

루트에 있던 기존 `css`, `js`, `icons` 파일은 백업 디렉터리로 이동/보존했고, 현재 루트 앱은 v2 파일 기준으로 동작한다.

## 경로 수정

루트에서 앱이 동작하도록 `/banjjok/v2/` 기준 경로를 `/banjjok/` 기준으로 수정했다.

수정 내용:

- `manifest.json`
  - `start_url`: `/banjjok/`
  - `scope`: `/banjjok/`
- `sw.js`
  - 캐시 대상 경로를 `/banjjok/...`로 변경
  - push notification icon/badge/data 기본 경로를 `/banjjok/...`로 변경
  - cache key를 `banjjok-main-v2-1`로 변경
- `js/matchmaker.js`
  - 초대 공유 링크를 `https://kyhwow-rgb.github.io/banjjok/`로 변경

검증:

```bash
rg -n "banjjok/v2|/v2/|v2/" index.html manifest.json sw.js js css
```

루트 앱 기준으로 `/v2/` 하드코딩이 남지 않은 것을 확인했다.

## Broadcast 응답 수락 플로우 보강

루트 승격 전에 아래 커밋으로 Broadcast 요청 응답 수락 플로우를 추가했다.

```text
e44933c feat(v2): complete broadcast response acceptance flow
```

변경 파일:

```text
v2/js/matchmaker.js
v2/css/style.css
v2/supabase-r7-fix-2026-05-08.sql
```

기능:

- `요청함` 탭에 `내 요청에 온 추천` 섹션 추가
- 추천 후보 수락 시 `resolve_request_response` RPC 호출
- 수락된 추천을 `introductions` row로 전환
- 다른 pending 응답 정리
- 참가자와 추천 주선자에게 알림 발송

## DB 적용

아래 SQL을 원격 Supabase linked DB에 적용했다.

```text
v2/supabase-r7-fix-2026-05-08.sql
```

실행 명령:

```bash
supabase db query --linked -f v2/supabase-r7-fix-2026-05-08.sql
```

대상 프로젝트:

```text
name: banjjok-v2
ref: nhayianbkdjtxjndhsnz
```

적용 후 원격 DB에서 아래 RPC 존재를 확인했다.

```text
create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb)
resolve_request_response(p_response_id uuid, p_accept boolean)
```

참고: 추가 RLS policy 조회 확인 중 Supabase CLI 임시 접속 role 인증 오류가 있었지만, SQL 실행 자체와 핵심 RPC 존재 확인은 완료했다.

## 검증한 항목

문법 검증:

```bash
node --check js/matchmaker.js
node --check js/app.js
node --check js/notifications.js
```

경로 검증:

```bash
rg -n "banjjok/v2|/v2/|v2/" index.html manifest.json sw.js js css
```

GitHub push:

```text
e44933c..867d860  v2 -> v2
```

## 현재 상태

현재 메인 서비스는 아래 주소에서 접근한다.

```text
https://kyhwow-rgb.github.io/banjjok/
```

기존 v2 주소도 저장소에 `v2/` 디렉터리가 남아 있으므로 당분간 접근 가능하다.

```text
https://kyhwow-rgb.github.io/banjjok/v2/
```

단, 메인 초대 공유 링크와 PWA scope는 루트 주소 기준이다.

## 롤백 방법

루트 서비스를 기존 버전으로 되돌리려면 `legacy-root-2026-05-08/` 내용을 루트로 복원하면 된다.

개념적으로는 아래 항목을 되돌린다.

```text
legacy-root-2026-05-08/index.html      -> index.html
legacy-root-2026-05-08/manifest.json   -> manifest.json
legacy-root-2026-05-08/sw.js           -> sw.js
legacy-root-2026-05-08/css/            -> css/
legacy-root-2026-05-08/js/             -> js/
legacy-root-2026-05-08/icons/          -> icons/
```

Git 기준으로는 아래 커밋을 revert하는 것도 가능하다.

```text
867d860 feat: promote v2 app to GitHub Pages root
```

## 남은 주의사항

- GitHub Pages 반영에는 약간의 시간이 걸릴 수 있다.
- 기존 service worker 캐시가 남아 있으면 브라우저에서 강력 새로고침 또는 캐시 삭제가 필요할 수 있다.
- 로컬에는 `service-overview.md`가 untracked 상태로 남아 있었고, 이번 배포/커밋에는 포함하지 않았다.
