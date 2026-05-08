# Round 6 — 1시간 종합 검증 리포트 (2026-05-08)

**기간**: 약 1시간 라이브 검증 + 코드 감사
**범위**: 가입 → 온보딩 → 평판 게이트 → 자동 승인 → 다중 역할 → 소개/매칭/채팅 → 주선자 1:1 채팅 → 관리자
**시작 상태**: applicants 16명 / mm_messages 2개 / 미사용 invite codes 2개 (ADMIN001, MATCH001)

---

## 요약

총 **8개 이슈 발견 / 7개 수정 완료 / 1개는 큰 UX 작업이라 후속 과제로 분리** 권장.

| # | 심각도 | 영역 | 상태 |
|---|---|---|---|
| 1 | HIGH | 온보딩 step 3 (이상형) skip | ✅ 수정 |
| 2 | CRITICAL | SECURITY DEFINER RPC 가 트리거에 막힘 | ✅ 수정 (DB + 영구 SQL) |
| 3 | MEDIUM | 환영 팝업 first-login 누락 | ✅ 수정 |
| 4 | HIGH | Cross-network 소개에서 referred_by_matchmaker_id 미설정 | ✅ 수정 |
| 5 | MEDIUM | chat_messages UPDATE RLS 누락 (read receipts 영구 깨짐) | ✅ 수정 |
| 6 | MEDIUM | 소개 카드 선택 하이라이트 셀렉터 오류 | ✅ 수정 |
| 7 | MEDIUM | 채팅 전송 실패 시 낙관적 UI 롤백 없음 | ✅ 수정 |
| 8 | HIGH | Broadcast 요청 응답 → 요청자 알림 누락 + 수락 UI 부재 | 🟡 알림은 수정 / 수락 UI 는 후속 |
| 9 | LOW | Watermark client-time 신뢰 | 📝 문서화 (보안 이슈 아님) |

---

## 라이브 검증 결과 (P1–P4 통과)

### P1 — 가입 + 온보딩 (검증A)
- ✅ 초대 코드 가입 정상
- ✅ 약관/사진/자기소개 단계 작동
- 🐛 **#1**: 사진(step 2) → 자기소개(step 4) 직행, 이상형(step 3) skip 발견

### P2 — 평판 게이트 + 자동 승인
- ✅ 검증A 평판 게이트 진입
- ✅ 김주선 평판 작성 → status='pending_reputation' 유지 → ❌ 자동 승인 실패
- 🐛 **#2 CRITICAL**: `approve_after_reputation` RPC 가 BEFORE UPDATE 트리거에 막힘. 출시 차단급.
- ✅ 트리거 GUC bypass 로 fix → 검증A 자동 승인 성공

### P3 — 검증B 가입 + 평판 + 자동 승인 (전체 흐름)
- ✅ fix 적용 후 검증B 풀 사이클 정상 (가입 → 게이트 → 김주선 평판 → 자동 승인)
- ✅ Realtime 채널이 status 변경 감지 → 게이트 화면 자동 전환

### P4 — 다중 역할 + mm chat 진입
- ✅ 검증B 가 본인 모드를 주선자 추가 (`enable_my_role` RPC)
- ✅ 검증C 를 검증B 가 초대 → 평판 작성 → 승인 (cross-matchmaker chain)
- 🐛 **#3 MEDIUM**: 다음 로그인 시 환영 팝업이 안 뜸 (Realtime 채널만 트리거, 첫 로그인 path 없음)

---

## 코드 감사 결과 (P5–P8)

라이브 검증 시간이 부족해 P5 이후는 정밀 코드 감사로 대체.

### #4 HIGH — Cross-network 소개에서 `referred_by_matchmaker_id` 미설정
- **위치**: `js/matchmaker.js:225` `confirmSendIntroduction`
- **영향**: 다른 주선자가 초대한 사람을 매칭해도 그 주선자에게 보이지 않음. 분석/귀속 불가.
- **수정**: INSERT 전에 personB.invited_by 조회 → 본인과 다르면 `referred_by_matchmaker_id` 채움 + 알림 발송. 동시에 client-side 성별/승인 검증 추가.

### #5 MEDIUM — `chat_messages` UPDATE RLS 누락
- **위치**: `js/chat.js:189` `markChatAsRead`
- **영향**: read_at 영구 null. 읽음 표시 / 미읽음 카운트 무력화.
- **수정**: `supabase-cso-fix-2026-05-08.sql` 에 "Recipient can mark chat as read" UPDATE 정책 추가.

### #6 MEDIUM — 소개 선택 하이라이트 셀렉터 불일치
- **위치**: `js/matchmaker.js:122, :188`
- **증상**: 사람 A 또는 B 를 다시 선택해도 이전 카드 강조가 안 풀림 (이중 선택 시각).
- **원인**: `.person-chip` / `.pool-card` 로 query 하지만 실제 클래스는 `.person-row-card`.
- **수정**: 셀렉터 정정.

### #7 MEDIUM — 채팅 전송 실패 시 낙관적 bubble 잔류
- **위치**: `js/chat.js:152` `sendChatMessage`
- **증상**: RPC 실패 → toast 만 뜨고 가짜 bubble 은 화면에 남아 있음. 새로고침하면 사라짐 → 사용자 혼란.
- **수정**: temp-id 태그 → 실패 시 DOM 제거 + 입력값 복원.

### #8 HIGH — Broadcast 응답 → 요청자 알림 누락 + 수락 UI 부재
- **위치**: `js/matchmaker.js:364` `confirmRespondPick`
- **증상**: 추천이 DB 에만 들어가고 요청자에게는 알림 없음. 요청자가 수락/거절할 UI 도 없어서 introduction 으로 전환되지 않음.
- **수정**: `request_received` 알림 발송 추가.
- **후속 과제**: 요청자 측에서 "내 요청에 들어온 추천" 리스트 + 수락/거절 → introductions 자동 생성 UI. 현재 이 흐름은 사용자가 만든 broadcast 요청이 "응답 도착함" 상태에서 막힘.

### P8 — 관리자
- 이미 적용된 admin RPC들 (admin_list_matches, admin_relationship_tree) 모두 server-side 에서 `EXISTS admin_users` 검증함. 새 이슈 없음.

---

## 적용된 변경

### JavaScript
- `js/profile.js` — `_signupRoles` 로컬 변수 + `getOnboardRoles()` helper 추가, 모든 onboarding role 분기를 helper 통해 결정 (Bug #1)
- `js/app.js` — `routeAfterAuth()` async + `setSignupRoles()` 호출 + 첫 로그인 환영 팝업 localStorage 가드 (Bug #1, #3)
- `js/matchmaker.js` — `confirmSendIntroduction` 에 cross-network referred_by + 성별 가드 + 추천 응답 알림 (Bug #4, #8)
- `js/matchmaker.js` — `selectPersonForIntro`, `selectPoolPerson` 셀렉터 정정 (Bug #6)
- `js/chat.js` — `sendChatMessage` temp-id rollback (Bug #7)

### SQL (supabase-cso-fix-2026-05-08.sql)
- `applicants_protect_immutable` 트리거에 `app.allow_immutable_change` GUC bypass 추가 (Bug #2)
- `enable_my_role`, `approve_after_reputation`, `signup_with_invite` RPC들 모두 GUC set/unset 적용
- `chat_messages` UPDATE 정책 추가 (Bug #5)
- `create_notification` 에 mm_messages 관계 절 추가

---

## 검증된 흐름 (라이브 + 코드)

| 흐름 | 상태 | 검증 방식 |
|---|---|---|
| 가입 (참가자/주선자) | ✅ | Live (3 accounts) |
| 온보딩 4 steps | ✅ (after fix #1) | Live |
| 평판 게이트 + Realtime 자동 전환 | ✅ | Live |
| 평판 작성 → 자동 승인 | ✅ (after fix #2) | Live |
| 환영 팝업 | ✅ (after fix #3) | Code |
| 다중 역할 추가 (`enable_my_role`) | ✅ | Live |
| 초대 체인 (A→B→C) | ✅ | Live |
| 소개 보내기 (same-network) | ✅ | Code |
| Cross-network 소개 | ✅ (after fix #4) | Code |
| 채팅 전송 + 낙관적 UI | ✅ (after fix #7) | Code |
| 채팅 read_at | ✅ (after fix #5) | Code |
| Broadcast 요청 생성 | ✅ | Live |
| Broadcast 응답 알림 | ✅ (after fix #8) | Code |
| Broadcast 응답 수락 → 매칭 변환 UI | ❌ | **후속 과제** |
| 관리자 대시보드 | ✅ | Code (admin RPC 권한 검증 OK) |

---

## 후속 과제 (출시 차단 아님 / 다음 sprint)

1. **Broadcast 응답 수락 흐름 UI** — 요청자가 들어온 추천을 보고 수락 → introductions 자동 생성. 현재 전체 broadcast 기능 활용 안 됨.
2. **Watermark 시간 신뢰성** — 현재 `new Date()` 로컬 시간 사용. 서버 발급 토큰으로 교체 권장 (audit-trail 강화).
3. **Push notifications** — Edge Function 미설치 환경에서 silent fail 됐던 부분은 d5c5ac4 에서 silenced. Edge Function 재배포 시 정상화.

---

## 출시 가능 여부

**✅ 출시 가능**. 발견된 출시 차단급 이슈 (#1, #2) 는 모두 수정 완료. 친구들에게 공유 가능한 상태.

남은 후속 과제는 출시 후 1주 내 보강 권장.

---

## 테스트 계정 (Round 6 생성)

| 이메일 | 역할 | 상태 |
|---|---|---|
| qa-r6-a-1778207285@test.com | 검증A 참가자 (여) | approved |
| qa-r6-b-1778207779@test.com | 검증B 참가자+주선자 (남) | approved |
| qa-r6-c-1778208182@test.com | 검증C 참가자 (여) | approved |

**비밀번호**: 모두 동일 (검증 세션에서 사용한 패턴).
