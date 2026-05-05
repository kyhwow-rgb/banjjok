# Technical Specification: 반쪽 (Banjjok)

> **목적**: 이 문서는 반쪽 코드베이스의 기술적 구현을 상세히 기술합니다. 다른 개발자 또는 AI 에이전트가 이 문서만으로 코드베이스의 목적, 아키텍처, 데이터 흐름, 주요 함수를 이해할 수 있도록 작성되었습니다.
>
> **최종 업데이트**: 2026-05-05 / SW v57

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | 반쪽 (Banjjok) |
| 한줄 설명 | 지인 초대 코드 기반 소개팅 매칭 PWA |
| 배포 URL | https://kyhwow-rgb.github.io/banjjok/ |
| GitHub | https://github.com/kyhwow-rgb/banjjok |
| 개발 시작 | 2026-04-09 |
| 기술 스택 | Vanilla HTML/CSS/JS + Supabase + PWA |
| 호스팅 | GitHub Pages (정적 배포) |
| 대상 유저 | 20-30대 한국 싱글 |

### 1.1 핵심 컨셉

"친구가 소개해주는 소개팅" -- 아무나 가입할 수 없고, 기존 회원(주선자)의 초대 코드가 있어야 가입 가능합니다. 주선자는 지인을 추천하고, 참가자끼리 매칭되는 구조입니다.

### 1.2 사용자 역할 3종

| 역할 | 설명 | 진입 경로 |
|------|------|-----------|
| **참가자** (participant) | 소개팅 대상자. 프로필 작성, 추천 카드 열람, 찜, 채팅 | 주선자의 초대 코드로 가입 |
| **주선자** (matchmaker) | 지인을 소개하는 중개자. 소개장 작성, 소개 제안 | 슈퍼코드로 가입 후 자신의 코드 배포 |
| **관리자** (admin) | 전체 시스템 관리. 승인, 매칭, 공지, 모니터링 | admin_users 테이블에 등록된 계정 |

---

## 2. 디렉토리 구조

```
banjjok/
├── index.html                          # 메인 앱 (로그인, 회원가입, 관리자 대시보드)
├── dashboard.html                      # 참가자 대시보드 (추천, 관심, 대화, MY)
├── matchmaker.html                     # 주선자 대시보드 (추천현황, 소개, 현황)
├── manifest.json                       # PWA 매니페스트
├── sw.js                               # Service Worker (캐시 + 웹 푸시)
├── clear-cache.html                    # 캐시 초기화 유틸리티
├── og-image.svg                        # 카카오톡/SNS 미리보기 이미지
│
├── js/
│   ├── common.js                       # Supabase 초기화, 공통 유틸 (매칭 알고리즘 포함)
│   ├── index.js                        # 메인 앱 로직 (~3500줄)
│   ├── dashboard.js                    # 참가자 대시보드 로직 (~2900줄)
│   ├── matchmaker.js                   # 주선자 대시보드 로직 (~300줄)
│   ├── *.min.js                        # 압축 버전
│
├── css/
│   ├── index.css                       # 메인 앱 + 관리자 스타일
│   ├── dashboard.css                   # 참가자 대시보드 스타일
│   ├── matchmaker.css                  # 주선자 대시보드 스타일
│   ├── *.min.css                       # 압축 버전
│
├── icons/                              # PWA 아이콘 (192px, 512px, SVG, Apple Touch)
│
├── supabase-launch-hardening.sql       # 핵심 RPC (관리자 매칭, 상호 매칭)
├── supabase-matchmaker-setup.sql       # 소개 시스템 RPC + 스키마
├── supabase-invite-codes-setup.sql     # 초대 코드 시스템
├── supabase-storage-setup.sql          # 스토리지 버킷 정책
├── seed-test-data.sql                  # 테스트 데이터
│
├── DESIGN.md                           # 디자인 시스템 명세
├── CLAUDE.md                           # AI 에이전트 지침
├── PLAN.md                             # 프로젝트 계획
├── test-accounts.md                    # 테스트 계정 목록
├── build.sh                            # JS/CSS 압축 빌드
└── preview.sh                          # 로컬 프리뷰 서버
```

---

## 3. 아키텍처

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────┐
│                    GitHub Pages                      │
│  index.html ─── dashboard.html ─── matchmaker.html  │
│       │               │                │             │
│    index.js      dashboard.js    matchmaker.js       │
│       └──────── common.js ─────────┘                 │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS (Supabase JS Client)
                        ▼
┌─────────────────────────────────────────────────────┐
│               Supabase (ap-northeast-2)              │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐            │
│  │  Auth    │  │ Database │  │ Storage │            │
│  │ (Email)  │  │ (Postgres)│ │ (Photos)│            │
│  └─────────┘  └──────────┘  └─────────┘            │
│                     │                                │
│           ┌─────────┴──────────┐                     │
│           │   RPC Functions    │                      │
│           │ (SECURITY DEFINER) │                      │
│           └────────────────────┘                     │
└─────────────────────────────────────────────────────┘
```

### 3.2 페이지별 역할

| 페이지 | 진입 조건 | 주요 기능 |
|--------|-----------|-----------|
| `index.html` | 없음 | 로그인, 회원가입, 홈, 관리자 대시보드 |
| `dashboard.html` | 로그인 + 참가자 | 추천 카드, 관심, 채팅, 프로필 관리 |
| `matchmaker.html` | 로그인 + 주선자 | 참가자 현황, 소개 제안, 소개 이력 |

### 3.3 인증 흐름

```
[미로그인] ──→ index.html (로그인 화면)
     │
     ├──→ 회원가입: 초대코드 검증 → Supabase Auth signUp → 프로필 폼
     │
     └──→ 로그인: Supabase Auth signInWithPassword
              │
              ├── 관리자 여부 확인 (admin_users 테이블)
              │     ├── YES → index.html 관리자 탭
              │     └── NO ──┐
              │              │
              ├── 역할 확인 (applicants.role)
              │     ├── matchmaker → matchmaker.html
              │     └── participant → dashboard.html
              │
              └── 프로필 미작성 → index.html 프로필 폼
```

**세션 관리**: Supabase Auth는 localStorage에 세션 저장 (쿠키 아님). `autoRefreshToken: true`로 자동 갱신.

---

## 4. Supabase 데이터베이스 스키마

### 4.1 테이블 목록

#### applicants (핵심 테이블)

참가자/주선자 프로필 데이터. 모든 사용자 정보의 중심.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT PK | 랜덤 생성 ID |
| `user_id` | TEXT UNIQUE | Supabase auth.users.id |
| `role` | TEXT | `participant` / `matchmaker` |
| `status` | TEXT | `pending_reputation` → `pending` → `approved` → `matched` (또는 `rejected`, `inactive`) |
| `gender` | TEXT | `male` / `female` |
| `name` | TEXT | 실명 |
| `birth` | TEXT | YYYY-MM-DD |
| `job_category` | TEXT | 9개 카테고리 중 1 |
| `job_title` | TEXT | 직함 (선택) |
| `company` | TEXT | 회사명 (선택) |
| `height` | INT | cm (140-220) |
| `location` | TEXT | 거주지 |
| `mbti` | TEXT | 4글자 |
| `kakao` | TEXT | 카카오톡 ID (관리자만 열람) |
| `contact` | TEXT | 전화번호 (관리자만 열람) |
| `smoking` | TEXT | 흡연 여부 |
| `drinking` | TEXT | 음주 빈도 |
| `religion` | TEXT | 종교 |
| `intro` | TEXT | 자기소개 (max 200자) |
| `hobby` | TEXT | 취미 |
| `education` | TEXT | 학력 |
| `referral_code` | TEXT UNIQUE | 본인에게 부여된 추천 코드 |
| `referred_by` | TEXT FK | 가입 시 사용한 추천 코드 |
| `photos` | TEXT[] | Supabase Storage URL 배열 (최대 3장) |
| `ideal` | TEXT (JSON) | 이상형 선호도 (키, 나이, 지역, MBTI 등) |
| `ideal_weights` | TEXT (JSON) | 매칭 점수 가중치 (6항목) |
| `look_score` | INT | 외모 점수 (0-100, 관리자 평가) |
| `matched_with` | TEXT FK | 매칭된 상대 applicant.id |
| `last_seen_at` | TIMESTAMPTZ | 마지막 접속 |
| `boost_until` | TIMESTAMPTZ | 추천 부스트 만료 |
| `matchmaker_tier` | TEXT | `bronze` / `silver` / `gold` |
| `created_at` | TIMESTAMPTZ | 가입일 |

#### favorites (찜)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `user_id` | UUID FK | 찜한 사람의 auth.users.id |
| `applicant_id` | TEXT FK | 찜 받은 사람의 applicants.id |
| `created_at` | TIMESTAMPTZ | |

#### notifications

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `user_id` | UUID FK | 수신자 |
| `from_applicant_id` | TEXT FK | 발신자 (선택) |
| `type` | TEXT | `favorite`, `mutual`, `introduction`, `intro_response`, `matched`, `message`, `inquiry_response`, `broadcast`, `match_proposal`, `match_accepted`, `match_declined` |
| `title` | TEXT | |
| `body` | TEXT | |
| `is_read` | BOOLEAN | |
| `metadata` | TEXT (JSON) | 추가 데이터 |
| `created_at` | TIMESTAMPTZ | |

#### chat_messages

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `sender_id` | TEXT FK | applicants.id |
| `receiver_id` | TEXT FK | applicants.id |
| `message` | TEXT | 메시지 본문 |
| `created_at` | TIMESTAMPTZ | |

#### introductions (주선자 소개)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `matchmaker_id` | TEXT FK NOT NULL | 소개한 주선자 |
| `person_a_id` | TEXT FK | 소개 대상 A |
| `person_b_id` | TEXT FK | 소개 대상 B |
| `status` | TEXT | `proposed` → `matched` / `declined` / `expired` |
| `a_response` | TEXT | `yes` / `no` |
| `b_response` | TEXT | `yes` / `no` |
| `matchmaker_note` | TEXT | 주선자 메모 (max 200) |
| `expires_at` | TIMESTAMPTZ | 7일 후 만료 |
| `created_at` | TIMESTAMPTZ | |

#### reputations (평판)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `target_applicant_id` | TEXT FK | 평판 대상 |
| `writer_applicant_id` | TEXT FK | 작성자 |
| `writer_user_id` | UUID FK | 작성자 auth ID |
| `content` | TEXT | 평판 내용 (max 500) |
| `is_referrer` | BOOLEAN | 추천인이 작성했는지 |
| `created_at` | TIMESTAMPTZ | |

#### inquiries (문의)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `user_id` | UUID FK | 문의자 |
| `user_name` | TEXT | 표시 이름 |
| `message` | TEXT | 문의 내용 (max 500) |
| `admin_response` | TEXT | 관리자 답변 |
| `admin_read` | BOOLEAN | |
| `user_read` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

#### 기타 테이블

| 테이블 | 용도 |
|--------|------|
| `admin_users` | 관리자 계정 등록 (user_id) |
| `push_subscriptions` | 웹 푸시 구독 (endpoint, auth, p256dh) |
| `event_logs` | 분석용 이벤트 로그 (event_type, metadata JSON) |
| `profile_views` | 프로필 조회 기록 |
| `blocks` | 차단 목록 |
| `reports` | 신고 목록 |
| `match_requests` | 매칭 요청 (from, to, status) |

---

## 5. Supabase RPC 함수

모든 중요한 데이터 변경은 `SECURITY DEFINER` RPC를 통해 수행됩니다 (클라이언트가 직접 테이블을 수정하는 대신).

### 5.1 매칭 관련

| 함수 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `admin_match_applicants` | `p_male_id`, `p_female_id` | void | 관리자 수동 매칭. 양쪽 status=matched, matched_with 설정. 기존 match_requests 거절 처리 |
| `auto_match_if_mutual` | `p_target_applicant_id` | boolean | 상호 찜 시 자동 매칭. FOR UPDATE 잠금. 양쪽 approved + 이성 확인 |
| `propose_introduction` | `p_person_a_id`, `p_person_b_id`, `p_note` | UUID | 주선자 소개 제안. 일일 한도(tier 기반), 네트워크 범위 확인, 중복 방지 |
| `respond_to_introduction` | `p_intro_id`, `p_accept` | TEXT | 소개 수락/거절. 양쪽 모두 수락 시 자동 매칭 |

### 5.2 조회 관련

| 함수 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `get_who_liked_me` | `my_applicant_id` | applicant_id[] | 나를 찜한 사람 목록 |
| `get_mutual_favorites` | `my_user_id` | applicant_id[] | 상호 찜 목록 |
| `get_my_popularity` | `my_applicant_id` | INT | 내가 받은 찜 수 |
| `get_favorite_counts` | `ids TEXT[]` | {id: INT}[] | 여러 명의 찜 수 일괄 조회 |
| `get_my_view_count` | `my_applicant_id` | INT | 프로필 조회 수 |
| `get_my_profile_viewers` | `my_applicant_id` | applicant_id[] | 프로필 방문자 |

### 5.3 기타

| 함수 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `send_chat_message` | `sender_id`, `receiver_id`, `message`, `created_at` | UUID | 메시지 발송 + 알림 생성 |
| `apply_referral_bonus` | `referrer_code`, `boost_ts` | void | 추천인 부스트 적용 |

---

## 6. common.js -- 공통 유틸리티 & 매칭 알고리즘

**파일**: `js/common.js` (259줄)

### 6.1 Supabase 초기화

```javascript
const SUPABASE_URL = 'https://gwthsweeocjovfcbcvpa.supabase.co';
const SUPABASE_KEY = 'eyJhbGc...'; // anon key (RLS로 보호)
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
```

### 6.2 매칭 점수 알고리즘 (`calcMatchScore`)

**가중치 기본값 (커스터마이징 가능)**:
```
키(height): 20% | 외모(looks): 20% | 직업(job): 15%
지역(location): 15% | 나이(age): 15% | MBTI: 15%
```

**점수 계산 로직**:
1. **키 (20%)**: 이상형 선호 범위에 맞으면 95, 아니면 30, 선호 없으면 70
2. **외모 (20%)**: 관리자 부여 `look_score` (0-100)
3. **직업 (15%)**: 카테고리별 고정 점수 (전문직 95 ~ 기타 30)
4. **지역 (15%)**: 일치 80, 선호 일치 95, 불일치 30-60
5. **나이 (15%)**: 선호 범위 일치 95, 범위 밖이면 연당 -12점
6. **MBTI (15%)**: 16x16 호환성 매트릭스 (최대 95, 기본 50)
7. **종교 보너스**: 일치 +5, 불일치 -5

**최종 점수**: 가중 평균 + 종교 보너스, 0-100 클램프

### 6.3 매칭 확률 예측 (`calcMatchProbability`)

양방향 매칭 점수의 평균에 활동도 팩터와 인기도 팩터를 곱합니다.

```
bidir = (순방향 점수 + 역방향 점수) / 2
activity = 최근 접속 여부 (1.0 ~ 0.6)
popularity = 찜 수 기반 경쟁률 (1.0 ~ 0.7)
final = bidir * activity * popularity (5-95 범위)
```

### 6.4 MBTI 호환성 매트릭스

`MBTI_COMPAT` 객체에 16개 MBTI 유형 간 호환성 점수 (0-100) 정의.

- 최고 호환: ENFP ↔ INFJ (95)
- 동일 유형: 65
- 미매핑: 50

### 6.5 직업 점수 매핑

```javascript
const JOB_SCORES = {
    '전문직': 95, '연구·기술직': 85, '공공·금융·교육직': 80,
    '대기업·중견기업직': 75, '사업·전문자유직': 70,
    '일반사무·기술직': 60, '대학생/대학원생': 45, '기타': 30
};
```

### 6.6 기타 유틸

| 함수 | 설명 |
|------|------|
| `checkIsAdmin()` | admin_users 테이블 조회로 관리자 여부 확인 |
| `canManageIntros(profile)` | 주선자 역할 또는 추천 네트워크 보유 확인 |
| `esc(str)` | HTML 엔티티 이스케이프 |
| `escJs(str)` | JS 컨텍스트 이스케이프 (onclick용) |
| `toast(msg, type?)` | 토스트 알림 (자동 타입 감지) |
| `calcAge(birth)` | 나이 계산 |
| `heightInRange(h, range, gender)` | 성별별 키 범위 매칭 |
| `calcProfileQuality(person)` | 프로필 품질 점수 (외모+직업+키+완성도 평균) |

---

## 7. index.js -- 메인 앱 로직

**파일**: `js/index.js` (~3500줄)

### 7.1 전역 변수

```javascript
let prevScreen         = 'login'     // 이전 화면
let selectedGender     = null        // 선택된 성별
let adminCache         = []          // 관리자 데이터 캐시
let photoFiles         = [null, null, null]  // 사진 버퍼 (최대 3장)
let _submitting        = false       // 중복 제출 방지
let currentAdminFilter = 'all'       // 관리자 필터 상태
let _adminRendered     = false       // 관리자 첫 렌더링 여부
```

### 7.2 화면 전환 (`showScreen`)

4개 메인 화면: `login`, `home`, `register`, `admin`

화면 전환 시 opacity 트랜지션 적용, History API pushState 사용.

### 7.3 회원가입 흐름

```
1. 역할 선택 (참가자/주선자)
2. 초대 코드 입력
   ├── 슈퍼코드 해시 검증 (SHA-256)
   └── applicants.referral_code 매칭 (추천인 status가 approved/matched여야 유효)
3. 이메일/비밀번호 입력
4. db.auth.signUp()
5. 프로필 폼으로 이동
```

### 7.4 프로필 제출 (`submitApplication`)

**위치**: index.js:740-950

1. **사진 처리**: Canvas 압축 (quality 0.7-0.75) → Supabase Storage 업로드 (`photos/{user_id}/{timestamp}.jpg`)
2. **이상형 데이터**: 칩 선택 UI에서 JSON 구조로 변환
3. **프로필 점수**: 필드 완성도 자동 계산
4. **DB 저장**: `applicants` 테이블 INSERT (신규) 또는 UPDATE (수정)
5. **추천 보너스**: `apply_referral_bonus` RPC 호출
6. **수정 모드**: `bj_edit_profile` localStorage에서 기존 데이터 복원, `referred_by`/`referral_code` 변경 불가

### 7.5 관리자 대시보드

#### 탭 구조 (6개)

| 탭 | ID | 주요 기능 |
|----|----|-----------|
| 홈 | `adminPanel-home` | TODO 위젯, 건강지표(DAU/가입/메시지/성비), 통계 카드, AI 매칭 제안, 실시간 활동, 유저 피드백 |
| 신청자 | `adminPanel-applicants` | 서브 필터(전체/평판대기/승인대기/남/여/소개자), 검색, 퀵필터, 일괄승인, 상세 모달 |
| 매칭 | `adminPanel-matching` | 매칭 요청, 상호관심 현황, 매칭된 커플 |
| 문의 | `adminPanel-inquiries` | 전체/미답변/답변완료 필터, 관리자 답변 |
| 네트워크 | `adminPanel-network` | Canvas 기반 추천 인맥 네트워크 그래프 (force-directed) |
| 설정 | `adminPanel-settings` | 공지사항 발송 (대상 세그먼트 선택, 푸시 동시 발송) |

#### 주요 관리자 함수

| 함수 | 위치 | 설명 |
|------|------|------|
| `renderAdmin()` | ~1228 | 전체 관리자 데이터 로드 + 렌더링 |
| `switchAdminTab(name)` | ~1292 | 탭 전환 (네트워크 탭은 lazy render) |
| `loadAdminTodoWidget()` | ~1495 | 오늘 처리할 것 (승인대기, 평판, 매칭, 문의 등) |
| `loadAdminHealthMetrics()` | ~1615 | DAU, 7일 가입 차트, 메시지, 성비 |
| `loadAdminActivityFeed()` | ~1694 | 최근 20건 실시간 활동 |
| `loadAdminFeedbackWidget()` | ~1780 | 7일 피드백 요약 |
| `renderAiMatchSuggestions()` | ~1448 | 상호 찜 쌍 중 궁합 상위 5쌍 제안 |
| `applicantRowHtml(a)` | ~2100+ | 신청자 카드 HTML 생성 (사진, 뱃지, 점수) |
| `openAdminDetail(id)` | ~2304 | 신청자 상세 모달 (전 필드, 사진, 평판, 승인/거절/삭제) |
| `filterAdmin(type)` | ~1340 | 신청자 필터링 (all/pending/male/female/matchmaker) |
| `filterAdminSearch()` | ~1370 | 이름/지역/직업/MBTI 실시간 검색 |
| `loadMatchRequests()` | ~1867 | 매칭 요청 목록 + 승인/거절 |
| `loadMutualOverview()` | ~1972 | 상호관심 쌍 목록 + 매칭 승인 |
| `renderMatchedCouples()` | ~1311 | 매칭된 커플 카드 렌더링 |
| `loadAdminInquiries()` | ~2981 | 문의 목록 + 관리자 답변 |
| `renderNetworkGraph()` | ~3157 | Canvas force-directed 네트워크 그래프 |
| `sendBroadcast()` | ~1386 | 공지사항 발송 (notifications INSERT + 푸시) |

#### 관리자 단축키

```
/ : 검색 포커스
1~5 : 탭 전환 (홈·신청자·매칭·문의·설정)
R : 새로고침
Esc : 모달 닫기
A : 승인 (상세 모달 내)
X : 거절 (상세 모달 내)
```

---

## 8. dashboard.js -- 참가자 대시보드

**파일**: `js/dashboard.js` (~2900줄)

### 8.1 초기화 흐름

```
1. Supabase 세션 확인 → 미인증 시 index.html 리다이렉트
2. applicants 테이블에서 프로필 로드
3. 역할 확인 → matchmaker면 matchmaker.html 리다이렉트
4. 온보딩 오버레이 표시 (pending_reputation / pending / approved)
5. 각 탭 데이터 비동기 로드
6. 워터마크 생성 (스크린샷 방지)
7. URL 해시 기반 탭 전환 (푸시 알림 딥링크)
```

### 8.2 4개 탭

#### 추천 탭 (discover)

- 반대 성별 승인 유저 전체 조회
- 차단/매칭된 유저 필터링
- `calcMatchScore`로 점수 계산 + 정렬
- 상위 3명 카드 렌더링
- 카드에 사진, 나이, MBTI, 직업, 지역, 점수 표시
- "좋아요" (찜) / "다음에" (패스) 버튼

#### 관심 탭 (interest)

4개 섹션 (접기/펼치기):
1. **상호 관심**: 서로 찜한 쌍. 쌍방 승인 플로우 (수락/거절 버튼) → 양쪽 수락 시 채팅 개설
2. **내가 찜한 사람**: favorites 테이블 조회
3. **나를 찜한 사람**: `get_who_liked_me` RPC
4. **프로필 방문자**: `get_my_profile_viewers` RPC

#### 대화 탭 (chat)

- 매칭된 상대와의 채팅방 목록
- 메시지 발송: `send_chat_message` RPC
- 텍스트 전용 (이미지/파일 미지원)
- 500자 제한
- 매칭 상태가 아니면 "매칭이 성사되면 대화를 시작할 수 있어요" 표시

#### MY 탭

- 프로필 조회 + 수정 (index.html#register로 이동)
- 문의하기 (inquiries 테이블)
- 푸시 알림 설정 토글
- 로그아웃
- 회원 탈퇴

### 8.3 상호 관심 → 채팅 개설 흐름

```
1. A가 B를 찜 → favorites INSERT
2. B가 A를 찜 → favorites INSERT + 상호 찜 감지
3. 양쪽에 match_proposal 알림 생성
4. A가 수락 → match_accepted 알림
5. B가 수락 → match_accepted 알림 + auto_match_if_mutual RPC
6. 양쪽 status = matched, matched_with 설정
7. 대화 탭에서 채팅 가능
```

### 8.4 주요 함수

| 함수 | 설명 |
|------|------|
| `switchTab(tab)` | 탭 전환 (discover/interest/chat/my) |
| `loadDiscoverMatches()` | 추천 카드 데이터 로드 + 렌더링 |
| `renderDiscoverCard(card)` | 개별 추천 카드 HTML |
| `toggleFavorite(applicantId)` | 찜 토글 + 상호 찜 확인 |
| `proposeMutualMatch(targetId, userId, name)` | 상호 관심 시 매칭 제안 알림 생성 |
| `acceptMatch(targetApplicantId)` | 매칭 수락 처리 |
| `declineMatch(targetApplicantId)` | 매칭 거절 처리 |
| `renderMutualSection()` | 상호 관심 섹션 렌더링 (수락/거절 상태 반영) |
| `loadNotifications()` | 알림 목록 로드 |
| `applyWatermark()` | Canvas 타일 패턴 워터마크 (이름+전화+날짜) |
| `openProfileModal(id)` | 프로필 상세 모달 |
| `openReputationModal(targetId)` | 평판 작성 모달 |
| `editMyProfile()` | 프로필 수정 (localStorage에 백업 후 index.html 이동) |
| `deleteAccount()` | 회원 탈퇴 (전 테이블 데이터 삭제) |

### 8.5 워터마크

```javascript
function applyWatermark() {
    // Canvas 360x120px 타일 생성
    // 텍스트: "{이름} {전화번호} {날짜시간}"
    // 회전: -25도
    // 투명도: rgba(0,0,0,0.07)
    // position:fixed, z-index:9998, pointer-events:none
    // background-repeat:repeat으로 전체 화면 커버
}
```

---

## 9. matchmaker.js -- 주선자 대시보드

**파일**: `js/matchmaker.js` (~300줄)

### 9.1 3개 탭

| 탭 | 기능 |
|----|----|
| 추천 현황 | 내 추천 코드, 추천한 참가자 목록, 상태 뱃지 |
| 소개 | 드롭다운에서 참가자 선택 → 이성 추천 3명 카드 → 소개 메모 작성 → 제안 |
| 현황 | 소개 이력 (proposed/matched/declined/expired) |

### 9.2 소개 제안 흐름

```
1. 드롭다운에서 내 풀의 참가자 A 선택
2. 반대 성별 승인 유저 중 매칭 점수 상위 3명 표시
3. B 선택 + 소개 메모 작성
4. propose_introduction RPC 호출
   - 일일 한도 확인 (tier 기반: bronze=2, silver=3, gold=4)
   - 최소 1명이 내 네트워크에 속해야 함
   - 중복 활성 소개 불가
5. 양쪽에 introduction 알림 전송
6. A, B 각각 수락/거절 응답 → respond_to_introduction RPC
```

---

## 10. Service Worker & PWA

**파일**: `sw.js` (69줄)

### 10.1 캐싱 전략

- **설치 시**: ASSETS 배열의 모든 파일 프리캐시
- **Fetch**: 네트워크 우선 + 캐시 폴백 (`/banjjok/` 경로만)
- **활성화 시**: 이전 버전 캐시 삭제 (`banjjok-v*`)

### 10.2 웹 푸시

```javascript
// Push 수신 시
self.addEventListener('push', e => {
    const data = e.data.json();
    self.registration.showNotification(data.title || '반쪽', {
        body: data.body,
        icon: '/banjjok/icons/icon-192.png',
        badge: '/banjjok/icons/icon-192.png',
        tag: 'banjjok-notif',
        renotify: true,
        vibrate: [120, 60, 120]
    });
});

// 알림 클릭 시 → dashboard.html로 이동 (섹션 해시 지원)
```

### 10.3 PWA 설치

- Android/Chrome: `beforeinstallprompt` 이벤트로 설치 UI 표시
- iOS: Safari Share 메뉴 → "홈 화면에 추가" 가이드
- 관리자 로그인 시 설치 스플래시 숨김 (`kj_role !== 'admin'` 체크)

---

## 11. localStorage 키 목록

| 키 | 용도 | 설정 위치 |
|----|------|-----------|
| `kj_role` | 현재 역할 (`viewer` / `admin`) | index.js 로그인 |
| `kj_screen` | 현재 화면 이름 | index.js showScreen |
| `kj_filter` | 관리자 필터 상태 | index.js filterAdmin |
| `bj_signup_role` | 가입 역할 (`participant` / `matchmaker`) | index.js selectSignupRole |
| `bj_signup_ref_code` | 가입 시 사용한 추천 코드 | index.js doSignup |
| `bj_edit_return_dashboard` | 프로필 수정 후 대시보드 복귀 플래그 | dashboard.js editMyProfile |
| `bj_edit_profile` | 수정 중인 프로필 JSON 백업 | dashboard.js editMyProfile |
| `bj_pending_seen` | 승인 대기 메시지 표시 여부 | dashboard.js 온보딩 |
| `kj_onboarded` | 승인 환영 메시지 표시 여부 | dashboard.js 온보딩 |
| `bj_push_enabled` | 푸시 알림 활성화 상태 | dashboard.js togglePush |
| `bj_filters` | 추천 필터 설정 JSON | dashboard.js 필터 |

---

## 12. 알림 시스템

### 12.1 알림 유형

| type | 트리거 | 수신자 | 설명 |
|------|--------|--------|------|
| `favorite` | 누군가 나를 찜 | 찜 받은 사람 | "OOO님이 관심을 보냈어요" |
| `mutual` | 상호 찜 성립 | 양쪽 | "상호 관심이 성립되었어요!" |
| `match_proposal` | 상호 찜 → 매칭 제안 | 양쪽 | "상대방의 수락을 기다려주세요" |
| `match_accepted` | 매칭 수락 | 상대방 | "매칭이 수락되었어요" |
| `match_declined` | 매칭 거절 | - | 내부 처리용 |
| `introduction` | 주선자 소개 제안 | A, B | "OOO님이 소개를 보냈어요" |
| `intro_response` | 소개 응답 | 주선자 + 상대방 | "소개를 수락/거절했어요" |
| `matched` | 관리자 수동 매칭 | 양쪽 | "매칭이 성사되었어요!" |
| `message` | 채팅 메시지 | 수신자 | "OOO님이 메시지를 보냈어요" |
| `inquiry_response` | 관리자 문의 답변 | 문의자 | "문의에 답변이 달렸어요" |
| `broadcast` | 관리자 공지 발송 | 세그먼트 | 공지 내용 |

### 12.2 푸시 알림

- VAPID 기반 Web Push API
- Supabase Edge Function `send-push` 호출 (현재 미배포, 에러 무시 처리)
- `push_subscriptions` 테이블에 구독 정보 저장

---

## 13. 보안 & RLS

### 13.1 인증

- Supabase Auth (이메일/비밀번호)
- 세션: localStorage 기반 (autoRefreshToken)
- 관리자 확인: `admin_users` 테이블 서버사이드 조회

### 13.2 Row Level Security

- 모든 테이블에 RLS 활성화
- 자신의 데이터만 읽기/쓰기 가능 (auth.uid() 기반)
- kakao, contact 필드: 관리자만 SELECT 가능
- 매칭/소개 등 중요 작업: SECURITY DEFINER RPC 사용

### 13.3 API 키

- anon key: 클라이언트에 노출 (RLS로 보호)
- service_role key: 코드에 포함되지 않음 (Supabase 대시보드에서만 사용)

---

## 14. 디자인 시스템 요약

**상세**: `DESIGN.md` 참조

| 요소 | 값 |
|------|-----|
| Primary | `#111111` |
| Accent | `#FF6B6B` (코랄) |
| Accent Light | `#FFF0F0` |
| Surface | `#FFFFFF` |
| Muted | `#888888` |
| Border | `#F0F0F0` |
| 폰트 | Pretendard (단일) |
| 버튼 | pill 형태 (border-radius: 26px) |
| 카드 | border-radius: 14px |
| 모션 | ease-out 입장, ease-in 퇴장, 150-350ms |

---

## 15. 사용자 상태 흐름 (Lifecycle)

```
[가입] ──→ pending_reputation ──→ pending ──→ approved ──→ matched
              │                      │           │
              │ (평판 수집 완료)       │ (관리자 승인)  │ (상호 찜 + 쌍방 수락
              │                      │           │  또는 관리자 매칭)
              └──────────────────────┘           │
                                                 ▼
                                            [채팅 개설]
                                                 │
                                            rejected (관리자 거절)
                                            inactive (자발적 비활성)
```

### 상태별 접근 권한

| 상태 | 추천 카드 | 찜 | 채팅 | 소개 응답 |
|------|-----------|-----|------|-----------|
| pending_reputation | X | X | X | X |
| pending | X | X | X | X |
| approved | O | O | X | O |
| matched | X | X | O | X |

---

## 16. 이벤트 로깅

`event_logs` 테이블에 사용자 행동 기록:

| event_type | 트리거 시점 |
|-----------|------------|
| `dashboard_open` | 대시보드 진입 |
| `exit_feedback` | 피드백 제출 |
| `suggestion` | 기능 제안 제출 |
| `favorite` | 찜 토글 |
| `intro` | 소개 제안 |
| `chat` | 메시지 발송 |
| `admin_match` | 관리자 매칭 |

---

## 17. 주요 제약사항 & 알려진 이슈

| 항목 | 상태 | 설명 |
|------|------|------|
| 실시간 채팅 | 미구현 | Supabase Realtime 미사용, 수동 새로고침 기반 |
| 푸시 알림 | 부분 동작 | Edge Function 미배포, 403/404 에러 무시 처리 |
| 모바일 반응형 | 구현됨 | @media (max-width:600px/640px) 브레이크포인트 |
| 이미지 최적화 | 구현됨 | Canvas 압축 (quality 0.7-0.75) |
| 오프라인 | 제한적 | 캐시된 페이지 열람만 가능, 데이터 동기화 없음 |
| 차단 기능 | 백엔드만 | blocks 테이블 존재하나 프론트엔드 UI 미구현 |
| 소개 관리 (관리자) | 미구현 | 관리자가 주선자 소개 현황을 볼 수 있는 탭 없음 |
| minified 파일 | 구버전 | .min.js/.min.css에 레거시 색상 잔존, build.sh 재실행 필요 |

---

## 18. 빌드 & 배포

```bash
# 로컬 개발
npx http-server . -p 8080 -c-1

# 빌드 (JS/CSS 압축)
./build.sh

# 배포 (GitHub Pages)
git push origin main
# → GitHub Actions 또는 Pages 자동 배포

# iOS 시뮬레이터 테스트
xcrun simctl openurl booted http://localhost:8080
```

**SW 캐시 버전 변경 시**: `sw.js` 1행의 `CACHE` 상수 수정 필요.

---

## 19. Supabase 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 프로젝트 ID | gwthsweeocjovfcbcvpa |
| 리전 | ap-northeast-2 (서울) |
| URL | https://gwthsweeocjovfcbcvpa.supabase.co |
| Auth | Email/Password (소셜 로그인 없음) |
| Storage | photos 버킷 (프로필 사진) |
