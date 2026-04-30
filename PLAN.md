# Plan: 주선자 인센티브 시스템 + 남은 작업

## 배경
반쪽 소개팅 PWA의 주선자(matchmaker) 시스템을 대폭 개선했다. 소개 탭 UX 재설계, tier 인센티브, 크로스 네트워크 소개를 구현 완료. 남은 작업을 정리하고 전체 리뷰 후 v56 릴리스.

## 구현 완료 항목

### 1. 소개 탭 UX 재설계 (matchmaker.html, js/matchmaker.js)
- 드롭다운 2개 직접 선택 -> 1명 선택 후 궁합 상위 N명 카드 추천
- calcMatchScore() 기반 궁합 점수 계산 + 상위 후보 표시
- 추천 카드 UI (사진, 나이, 직업, 궁합%, 소개하기 버튼)
- 소개 메모(선택) 기능

### 2. Tier 인센티브 시스템
- DB 컬럼: intro_success_count, matchmaker_tier, intro_daily_limit, intro_rec_count
- 3단계 tier: beginner(1회), skilled(3회), golden(5회+)
- Tier별 보상:
  - beginner: 인당 2회/일, 배지
  - skilled: 추천 후보 5명, 보라색 배지, 성공률 표시
  - golden: 추천 후보 7명, 금색 배지+VIP, 인당 3회/일
- MY탭에 tier 배지, 성공률, 다음 tier 진행도 표시

### 3. 크로스 네트워크 소개
- 전체 이성 참가자 열람 가능 (최소 1명은 자기 풀 필수)
- propose_introduction RPC에서 검증

### 4. 참가자 제한
- 인당 일일 소개 제한 (tier별 1~3회/일)
- 드롭다운에서 오늘 한도 초과 시 disabled 표시

### 5. 소개 현황 + 통계 (history 탭)
- 성사/대기/불발/성공률 통계 카드
- 소개별 양쪽 응답 상태 표시 (체크/X/대기)

### 6. 소개 경유 매칭 크레딧 (dashboard.js)
- 매칭 결과에 "OOO님의 소개로 만났어요" 표시
- 골든 주선자일 경우 왕관 아이콘
- 소개 카드에 주선자 tier 배지 + 성사 횟수 표시

### 7. CSS 분리 (FINDING-001)
- 추천 카드 인라인 스타일 -> css/matchmaker.css 클래스로 분리

## 남은 작업

### P0: 보안
- [ ] Supabase service_role key 재발급 (JWT secret rotation)
- [ ] DB password 재설정 완료
- [ ] Supabase access token 재발급 (dashboard에서 수동)

### P1: 릴리스 준비
- [ ] SW 버전 업데이트 (v55 -> v56)
- [ ] Service Worker 캐시 버전 업데이트

### P2: 버그 수정
- [ ] 현황 탭 통계 카드가 CDN 캐시로 안 보이는 이슈 확인
- [ ] 승인 온보딩 반복 표시 버그 (LOW)

### P3: 데이터 정리
- [ ] QATEST 데이터 cleanup (테스트 유저 삭제)

## 미결 사항 (Open Questions)
1. 성공률이 낮아지면 tier를 내릴 것인가?
2. 골든 주선자에게 참가자 상세 프로필도 열어줄 것인가?
3. 주선자 리더보드를 admin에 만들 것인가?
4. respond_to_introduction RPC에서 양쪽 yes 시 주선자 보상 로직이 서버사이드에 있는지 확인 필요

## 영향 범위
- matchmaker.html, css/matchmaker.css, js/matchmaker.js (주선자 대시보드)
- js/dashboard.js (참가자 대시보드 - 소개 카드, 매칭 결과)
- js/index.js (관리자 활동 피드)
- Supabase: applicants 테이블, introductions 테이블, propose_introduction RPC, respond_to_introduction RPC
