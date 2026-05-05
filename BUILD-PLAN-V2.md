# Build Plan v2 — 반쪽 v2

> **방향**: 점진적 마이그레이션이 아니라 "새로 짓되, 기존 자산만 골라온다."
>
> **목적**: 1개월간 누적된 데이팅앱 톤 / 데드 코드 / 임시방편을 떼어내고, v2 컨셉(=주선자 중심, 다대다 매칭, 평판 게이트)에 맞는 깨끗한 빌드를 만든다.
>
> **참조**: `service-overview-v2.md`(컨셉/스펙), `TECHNICAL-SPEC.md`(v1 자산 인벤토리)

---

## 0. 빌드 접근 방식

### 0.1 디렉토리 옵션 (결정 필요)

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| (A) 같은 리포 + `v2/` 하위 폴더 | banjjok 리포 안에 v2 빌드 | v1과 비교/참조 쉬움. 단점: 호스팅 경로 분리 필요 |
| (B) 같은 리포 + 브랜치 | `v2` 브랜치에서 새로 시작 | 깔끔하게 분리. 단점: 이전 코드 참조하려면 git 명령 필요 |
| (C) 새 리포 | 완전 별도 프로젝트 | 가장 깨끗. 단점: GitHub Pages 도메인 새로 잡아야 함 |

**추천: (A)** — 자산을 골라오는 작업이라서 v1을 옆에 두고 하는 게 효율적. v2 안정화 후 v1을 deprecate.

### 0.2 Supabase 프로젝트 옵션 (결정 필요)

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| (A) 기존 프로젝트 재사용 | 같은 DB에 신규 테이블 추가, 기존 데이터 마이그레이션 | 사용자 유지. 단점: 스키마 충돌 위험, 정리가 끈끈해짐 |
| (B) 새 Supabase 프로젝트 | 깨끗한 DB로 시작 | 가장 깔끔. 단점: 기존 사용자 손실 |

**추천: (B)** — v1은 베타 단계로 테스트 계정 위주(`test-accounts.md` 참조). 새 프로젝트로 시작하고, 정말 필요한 사용자만 수동 이관.

---

## 1. 가져갈 자산 (재사용)

### 1.1 코드 — `common.js`

| 자산 | 가져옴 | 비고 |
|------|--------|------|
| Supabase client 초기화 패턴 | ✓ | URL/Key만 새 값으로 |
| `esc()`, `escJs()` | ✓ | 그대로 |
| `toast()` | ✓ | 그대로 |
| `calcAge()`, `heightInRange()` | ✓ | 그대로 |
| `MBTI_COMPAT` 매트릭스 | ✓ | 호환성 리포트의 핵심 데이터 |
| `JOB_SCORES` 매핑 | ✓ | 호환성 리포트의 항목 평가 |
| `calcMatchScore()` 내부 로직 | ✓ | 출력 단계만 점수 → 항목별 텍스트로 변환 |
| `checkIsAdmin()` | ✓ | 그대로 |

### 1.2 코드 — 기타 인프라

| 자산 | 가져옴 | 비고 |
|------|--------|------|
| Service Worker (`sw.js`) 구조 | ✓ | 캐시 버전을 v2-v1로 새로 시작 |
| 사진 Canvas 압축 로직 | ✓ | quality 0.7-0.75 그대로 |
| `applyWatermark()` | ✓ | 모든 화면 균일 적용 (정보 보호 정책) |
| Web Push 클라이언트 코드 | ✓ | 그대로 |
| 회원가입 폼 골격 (이메일/비번, 사진 업로드) | ✓ | 흐름은 동일, 평판 게이트만 추가 |

### 1.3 데이터 / 스키마

| 테이블 | 가져옴 | 비고 |
|--------|--------|------|
| `applicants` | ✓ (수정) | `role`/`look_score`/`boost_until`/`matched_with`/`matchmaker_tier` 제거. `is_participant`, `is_matchmaker` 추가 |
| `reputations` | ✓ | 그대로. 트리거만 코드 레벨에서 변경 |
| `introductions` | ✓ (수정) | `matchmaker_id` → `primary_matchmaker_id` + `referred_by_matchmaker_id` |
| `chat_messages` | ✓ | 그대로 |
| `notifications` | ✓ (수정) | `type` 종류 정리 (favorite/mutual 등 폐기) |
| `inquiries` | ✓ | 그대로 |
| `admin_users` | ✓ | 그대로 |
| `push_subscriptions` | ✓ | 그대로 |
| `event_logs` | ✓ | 그대로 (이벤트 type만 정리) |
| `reports`, `blocks` | ✓ | 그대로 (UI는 v2에서 새로 만듦) |

### 1.4 디자인 자산

| 자산 | 가져옴 | 비고 |
|------|--------|------|
| Pretendard 폰트 시스템 | ✓ | 단일 폰트, 그대로 |
| spacing scale (8px base) | ✓ | 그대로 |
| radius 토큰 (sm/md/lg/pill) | ✓ | 그대로 |
| 색상 토큰 (Primary, Surface, Muted, Border) | ✓ | 그대로 |
| **"소개장" UI 패턴** | ✓ (확장) | v2의 메인 컴포넌트로 격상 |
| 평판 태그 컴포넌트 | ✓ | 그대로 |
| 토스트, 모달 컴포넌트 | ✓ | 그대로 |
| pill 버튼 스타일 | ◯ (조건부) | 디자인 방향에 따라 |

### 1.5 인프라

| 자산 | 가져옴 | 비고 |
|------|--------|------|
| GitHub Pages 호스팅 | ✓ | 경로만 분리 (`/banjjok/v2/` 또는 새 리포) |
| 앱 아이콘 (`icons/`) | ◯ (조건부) | 디자인 방향에 따라 재제작 가능 |
| `manifest.json` 골격 | ✓ | name/description만 수정 |
| `og-image.svg` | ◯ | 디자인 변경에 따라 재제작 |

---

## 2. 버릴 자산 (가져가지 않음)

### 2.1 코드

| 자산 | 위치 | 폐기 사유 |
|------|------|-----------|
| 추천 카드 (`loadDiscoverMatches`, `renderDiscoverCard`) | dashboard.js | 자율 매칭 동선 |
| 찜 토글 (`toggleFavorite`) | dashboard.js | 자율 매칭 동선 |
| 상호 찜 처리 (`proposeMutualMatch`, `acceptMatch`, `declineMatch`) | dashboard.js | 자율 매칭 동선 |
| `calcMatchProbability` (인기도 팩터) | common.js | 데이팅앱 톤 |
| `calcProfileQuality` 의 look_score 부분 | common.js | 외모 점수 폐기 |
| 부스트 시스템 (`apply_referral_bonus` 호출 부분) | index.js | 부스트 폐기 |
| 프로필 방문자 추적 호출 | dashboard.js | 데이팅앱 톤 |
| 일일 한도 / tier UI | matchmaker.js, index.js | tier 시스템 폐기 |
| `index.js` 신청자 카드의 외모 점수 부여 UI | index.js | look_score 폐기 |

### 2.2 RPC (Supabase 함수)

| RPC | 폐기 사유 |
|-----|-----------|
| `auto_match_if_mutual` | 상호 찜 자동 매칭 폐기 |
| `get_who_liked_me` | 자율 매칭 동선 |
| `get_my_popularity` | 인기도 노출 폐기 |
| `get_favorite_counts` | 자율 매칭 동선 |
| `get_my_view_count` | 방문자 추적 폐기 |
| `get_my_profile_viewers` | 방문자 추적 폐기 |
| `apply_referral_bonus` | 부스트 폐기 |

### 2.3 화면

| 화면 | 폐기 사유 |
|------|-----------|
| `dashboard.html` 추천(discover) 탭 전체 | 자율 매칭 동선 |
| `dashboard.html` 관심(interest) 탭의 "찜한 사람 / 나를 찜한 사람 / 방문자" 섹션 | 자율 매칭 동선 |
| `matchmaker.html` 파일 자체 | dashboard에 통합 |
| 관리자의 외모 점수 부여 화면 | look_score 폐기 |
| `clear-cache.html` | 디버그 유틸. v2에선 빌드 경로가 다르니 불필요 |

### 2.4 테이블 / 컬럼

| 자산 | 폐기 사유 |
|------|-----------|
| `favorites` 테이블 전체 | 자율 매칭 동선 |
| `profile_views` 테이블 전체 | 방문자 추적 폐기 |
| `match_requests` 테이블 전체 | 자율 매칭 동선 |
| `applicants.role` | `is_participant`/`is_matchmaker`로 대체 |
| `applicants.look_score` | 외모 점수 폐기 |
| `applicants.boost_until` | 부스트 폐기 |
| `applicants.matched_with` | 다대다 매칭으로 변경 |
| `applicants.matchmaker_tier` | tier 시스템 폐기 |

### 2.5 라이브러리/유틸

| 자산 | 폐기 사유 |
|------|-----------|
| `node_modules/pg*` | 직접 Postgres 연결 코드는 빌드에 안 쓰임. 빌드 시 정리 |

---

## 3. 새로 만들 것

### 3.1 코드 — 신규 함수/모듈

| 신규 자산 | 설명 |
|-----------|------|
| `compatibilityReport(a, b)` | 두 사람의 호환성을 항목별 텍스트로 반환 (점수 X) |
| `roleSwitcher` 컴포넌트 | 1인 2역 사용자의 모드 토글 |
| `IntroductionRequest` 모듈 | broadcast/직접 지목 요청 작성·발송 |
| `IntroductionRequestInbox` 모듈 | 다른 주선자 요청 받아 응답 |
| `MatchListView` 모듈 | 다대다 매칭의 채팅방 목록 |
| `ReputationGate` 클라이언트 검사 | 가입 흐름의 평판 단계 표시 |

### 3.2 RPC (Supabase 신규 함수)

| RPC | 입력 | 반환 | 설명 |
|-----|------|------|------|
| `create_introduction_request` | requester_id, target_applicant_id, request_type, criteria, responder_id? | UUID | 주선자 → 주선자 요청 생성 |
| `respond_to_introduction_request` | request_id, responder_id, proposed_applicant_id | UUID | 요청에 응답 (Y 추천) |
| `accept_request_response` | response_id, requester_id | void | 요청자가 추천된 Y를 수락 → 정식 소개 단계로 |
| `propose_introduction_v2` | primary_matchmaker_id, referred_by_id?, person_a, person_b, note | UUID | A·B 공동 소개 가능, 일일 한도 없음 |
| `respond_to_introduction_v2` | intro_id, applicant_id, accept | TEXT | 양쪽 yes 시 `matches` 테이블에 INSERT |
| `end_match` | match_id, ended_by | void | 매칭 종료 |
| `check_reputation_gate` | applicant_id | TEXT (status) | 평판 작성 여부 확인 |
| `escalate_pending_reputation` | (cron) | void | 7일 경과 시 관리자 큐로 이동 |

### 3.3 테이블 (신규)

| 테이블 | 설명 |
|--------|------|
| `introduction_requests` | 주선자 → 주선자 요청 |
| `introduction_request_responses` | 위 요청에 대한 응답 |
| `matches` | 다대다 매칭 (한 사람이 여러 매칭에 동시 존재 가능) |

스키마 상세는 `service-overview-v2.md` 7장 참조.

### 3.4 화면 (신규)

| 화면 | 설명 |
|------|------|
| 참가자 모드 — 소개 탭 | 받은 소개 목록 (대기/응답완료/만료) |
| 참가자 모드 — 대화 탭 | 다대다 채팅방 목록 |
| 참가자 모드 — MY 탭 | 프로필, 내 평판 보기, 푸시 설정 |
| 주선자 모드 — 내 사람들 | 내 추천 코드로 가입한 사람 목록 |
| 주선자 모드 — 소개하기 | X 선택 → 자기 풀 검색 / 다른 주선자에게 요청 |
| 주선자 모드 — 요청함 | broadcast 요청 받아 응답 |
| 주선자 모드 — 이력 | 진행한 소개의 상태 |
| 호환성 리포트 모달 | 항목별 텍스트 형식 |
| broadcast 요청 작성 | 조건 입력 폼 |
| 모드 토글 헤더 | 1인 2역의 모드 전환 |
| 약관 동의 화면 (가입 시) | 4종 명시 동의 |

### 3.5 약관 / 정책 문서

| 문서 | 설명 |
|------|------|
| `TERMS.md` | 이용약관 (스크린샷 금지, 워터마크 동의, 다대다 매칭 안내, 평판 의무) |
| `PRIVACY.md` | 개인정보 처리방침 |

---

## 4. 디자인 방향 변경

### 4.1 v1 디자인 평가

DESIGN.md를 다시 보면 두 갈래로 평가됩니다.

**유지할 만한 부분**
- 흑백 + 단일 악센트의 절제된 색상 체계
- "소개장" UI 패턴 (주선자 메모 + 평판 태그를 카드 상단에 배치) — v2의 메인 컴포넌트로 격상 가능
- Pretendard 단일 폰트
- pill 버튼, 카드 둥근 모서리

**v2 컨셉과 충돌하는 부분**
- DESIGN.md의 "Space/industry" 정의: "데이팅 앱 (Amanda, Noondate, GLAM과 경쟁)" — v2는 데이팅앱과 거리를 두는 방향
- 코랄 악센트(`#FF6B6B`) — "좋아요 버튼"을 의식한 색. v2엔 좋아요 버튼이 없음
- "Electric" 무드 — 활기/자극 톤. v2의 차분한 지인 소개 컨셉과 살짝 어긋남

### 4.2 v2 디자인 방향 옵션

**(A) 톤 다운만** — 색상 토큰 유지, 악센트만 차분한 색으로 교체
- 코랄(#FF6B6B) → 더 차분한 색 (예: 짙은 와인 #8B3A3A, 무난한 네이비 #2C3E50, 차분한 그린 #4A6741 등)
- 나머지 그대로 유지
- 장점: 변경량 최소. 단점: 큰 정체성 변화 없음

**(B) 편지/소개장 메타포로 전환** — 시각적으로도 "지인이 보낸 편지"
- 종이 텍스처, 부드러운 베이지 톤 추가
- 손글씨 느낌의 보조 폰트 (예: Galmuri11 등 – 이전 결정에서 한 번 거부됨)
- "소개장" UI를 진짜 편지처럼 (봉투 → 펼침 애니메이션)
- 장점: 컨셉과 시각이 강하게 결합. 단점: 작업량 큼, 이전에 한 번 거부된 톤
- DESIGN.md "Decisions Log"에 "Pivot: Cool Mono + Electric (warm 톤 거부)" 기록이 있어 신중해야 함

**(C) 절제된 모노톤 (Mono Trust)** — 따뜻하지도, 차갑지도 않게
- 무채색 베이스 + 매우 채도 낮은 단일 악센트 (먹색·짙은 회색·아주 옅은 블루그린 등)
- 강조는 색이 아니라 typography weight와 spacing으로
- "은행/신탁" 같은 신뢰 톤. 좋게 말하면 묵직함, 나쁘게 말하면 심심함
- 장점: 데이팅앱과 가장 멀어짐. 단점: 너무 사무적으로 보일 위험

**(D) "Quiet" 방향** — 일본·북유럽 감성의 조용한 미니멀
- 오프화이트 베이스, 옅은 채도, 여백 많음
- 글자가 주인공, 색은 보조
- 장점: 컨셉(=조용히 친구가 연결해주는 느낌)과 강한 일치
- 단점: 자칫 노년층/명상앱처럼 보일 수도

### 4.3 디자인 결정 필요 포인트

1. 위 A/B/C/D 중 하나 (또는 다른 방향)
2. 로고를 다시 만들지 (`반쪽` 그대로? 새 이름?)
3. 앱 아이콘 재제작 여부
4. 약관/온보딩 카피 톤 (격식 / 반말 / 친근체)

이 4개는 한 번에 결정하기 어려우므로, 빌드 시작 전에 **디자인 시안을 1-2개 만들어보고 결정**하는 게 안전.

---

## 5. 단계별 빌드 순서

```
Phase 0 — 사전 결정
  · 디렉토리 옵션 (A/B/C)
  · Supabase 프로젝트 옵션 (A/B)
  · 디자인 방향 (A/B/C/D 또는 다른 방향)
  · 새 Supabase 키 발급 / VAPID 키 새로 생성

Phase 1 — 인프라 / 골격
  · 빈 프로젝트 골격 (index.html, css 토큰, common.js 가져옴)
  · 새 manifest.json, sw.js (캐시 v2-1로 시작)
  · Supabase 새 프로젝트 + 신규 스키마 (전체 SQL 통합)
  · GitHub Pages 배포 라인

Phase 2 — 인증 / 가입 / 평판 게이트
  · 회원가입 폼 (역할 토글 포함: 1인 2역)
  · 추천 코드 검증
  · 평판 게이트 흐름 (B에게 알림 → 작성 → status 진행)
  · 평판 작성 폼

Phase 3 — 주선자 동선 (메인)
  · 내 사람들 탭
  · 소개하기 탭 (자기 풀 검색 → 호환성 리포트 표시)
  · broadcast / 직접 지목 요청 작성
  · 요청함 탭 (응답)
  · 정식 소개 발송 흐름

Phase 4 — 참가자 동선
  · 소개 탭 (받은 소개 목록 + yes/no)
  · 다대다 매칭 처리

Phase 5 — 채팅
  · 매칭당 채팅방 (다대다)
  · 푸시 알림

Phase 6 — 관리자
  · 가입 승인 / 평판 에스컬레이션 큐
  · 매칭 모니터링
  · 신고 / 차단 / 문의

Phase 7 — 정보 보호
  · 워터마크 적용
  · 약관 / 개인정보 처리방침 / 가입 시 명시 동의

Phase 8 — 폴리싱
  · 빈 상태 / 에러 / 로딩 디자인
  · 온보딩 / 약관 카피
  · 접근성 / 모바일 디테일
```

---

## 6. 결정해야 할 것 정리

빌드 시작 전 답이 필요한 항목:

1. **디렉토리**: A(`v2/` 하위) / B(브랜치) / C(새 리포)
2. **Supabase**: A(기존 재사용) / B(새 프로젝트)
3. **디자인 방향**: A(톤다운) / B(편지 메타포) / C(Mono Trust) / D(Quiet) / 기타
4. **로고/이름**: 그대로 "반쪽" / 새 이름
5. **앱 아이콘**: 그대로 / 재제작
6. **카피 톤**: 격식 / 친근 / 중간

`service-overview-v2.md` 12장의 미해결 항목(평판 익명성, 주선자 자격 제한 등)은 Phase 2~4 진행 중 결정 가능.

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail (/autoplan 2026-05-05)

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|---------------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P1+P2 | Greenfield rebuild with validated direction | EXPANSION (premature), HOLD (too conservative) |
| 2 | CEO | Approach: same repo v2/ + new Supabase | Mechanical | P6 | Plan's own recommendation; low-risk, reversible | New repo (unnecessary complexity) |
| 3 | CEO | Add pg_cron for reputation escalation + broadcast expiry | Mechanical | P1 | No scheduler specified for time-dependent operations | Manual operation |
| 4 | CEO | Add RLS policy section to plan | Mechanical | P1 | Pool isolation is the security foundation; not specified | UI-only enforcement |
| 5 | CEO | Add Realtime subscription spec | Mechanical | P1 | Multi-tab + mode toggle needs explicit channel management | Ad-hoc implementation |
| 6 | Design | Mode toggle = header pill (참가자/주선자) | Mechanical | P5 | Tab bar conflicts with content tabs; drawer hides critical state | Tab bar, drawer |
| 7 | Design | Update DESIGN.md product context line | Mechanical | P5 | "Amanda/Noondate 경쟁" is factually wrong for v2 direction | Leave as-is |
| 8 | Design | Empty states per-phase, not final phase | Mechanical | P1 | Users with 5 matchmakers see empty states constantly | Defer to Phase 8 |
| 9 | Design | Design reputation wait screen explicitly | Mechanical | P1 | Highest churn moment; "명확한 안내" is not a design | Generic "loading" |
| 10 | Design | Design direction (A/B/C/D) | TASTE | — | Subagent recommends D (Quiet) with muted teal accent | — |
| 11 | Eng | Add AppState singleton for subscription lifecycle | Mechanical | P1 | Vanilla JS + dual-role + Realtime = subscription leak class | Global variables |
| 12 | Eng | RLS gate on intro_request_responses (status check) | Mechanical | P1 | Y's identity leaks to A before acceptance without this | UI-only gate |
| 13 | Eng | Self-dealing guard in propose_introduction_v2 | Mechanical | P1 | Matchmaker can introduce themselves without server check | Client-only check |
| 14 | Eng | Remove look_score from calcMatchScore | Mechanical | P5 | Column removed but function still reads it → silent 50 fallback | Leave as dead code |
| 15 | Eng | DB-level broadcast response cap (3) enforcement | Mechanical | P1 | Application-level check has race condition | App-only check |
| 16 | Eng | Vanilla JS viability vs lightweight framework | TASTE | — | Subagent says AppState sufficient; question is scale trajectory | — |

---

## Cross-Phase Themes

**Theme: Pool isolation is under-specified everywhere** — flagged in CEO (Section 3), Design (matchmaker sees only own people), and Eng (RLS leak). High-confidence signal: this is the #1 architectural risk.

**Theme: Empty/new-user experience ignored** — flagged in CEO (5-matchmaker reality), Design (empty states deferred), and Eng (no test for 0-person pool). With ~5 matchmakers at launch, the empty state IS the default experience.

**Theme: Mode toggle complexity underestimated** — flagged in Design (no pattern chosen), Eng (state management needed). A single unresolved UX decision cascades into subscription management, RPC design, and test coverage.
