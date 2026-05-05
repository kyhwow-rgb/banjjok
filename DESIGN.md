# Design System — 반쪽 (Banjjok) v2

## Product Context
- **What this is:** 주선자 중심 소개팅 중개 PWA. 지인이 직접 골라서 연결해주는 서비스.
- **Who it's for:** 20-30대 한국 싱글 + 주선자(친구/선후배)
- **Space/industry:** 소개팅 중개 서비스 (주선자 중심). 데이팅앱과 의도적으로 차별화.
- **Project type:** Mobile-first PWA (GitHub Pages)
- **Memorable thing:** "친구가 직접 골라서 소개해준 사람이라 더 안심되는 느낌"

## Aesthetic Direction
- **Direction:** Quiet Minimal
- **Decoration level:** Minimal (오프화이트 베이스 + 채도 낮은 악센트)
- **Mood:** 조용하고 신뢰감 있는 분위기. 글자가 주인공, 색은 보조. "친구가 조용히 연결해주는" 느낌.
- **Anti-patterns:** 코랄/핑크 악센트(데이팅앱 연상), 퍼플 그라디언트, warm/beige 톤, 3컬럼 아이콘 그리드, 자극적 CTA

## Key UI Pattern: 소개장
- 소개 카드 상단에 "OOO님이 보낸 소개장" 영역 배치
- 주선자의 직접 메모 (왜 이 사람을 소개하는지)
- 주선자 평판 태그 (성사 횟수)
- 소개장 배경: accent-light (#EFF7F5), 둥근 모서리

## Key UI Pattern: 모드 토글
- 화면 상단 header pill toggle: 참가자 / 주선자
- 항상 노출, 현재 모드 시각적 강조
- 모드 전환 시 하단 탭 구성 변경 (참가자: 소개/대화/MY, 주선자: 내 사람들/소개하기/요청함/이력)

## Typography
- **Display/Hero:** Pretendard — 깔끔한 고딕으로 통일. 무게감으로 차별화.
- **Body:** Pretendard — 가독성 완벽.
- **Logo:** Pretendard Black (900) — 단일 색상, 단일 폰트. "반쪽" + dot 악센트.
- **Data/Tables:** Pretendard (tabular-nums)
- **Loading:** Pretendard(CDN)
- **Scale:** 11px / 13px / 15px / 18px / 24px / 32px / 48px

## Color
- **Approach:** Quiet (1 muted accent + neutral base)
- **Primary:** `#1A1A1A` — 깊은 텍스트 색.
- **Accent:** `#4A7B6F` — muted teal-green. 신뢰감, 차분함. CTA, 강조.
- **Accent hover:** `#3D6A5E`
- **Accent light:** `#EFF7F5` — 소개장 배경, 배지 배경.
- **Surface:** `#FAFAF9` — 오프화이트 배경 (순백보다 따뜻함).
- **Surface alt:** `#F3F3F2` — 태그, 비활성 버튼 배경.
- **Muted:** `#8C8C8C` — 보조 텍스트.
- **Border:** `#EBEBEB` — 경계선.
- **Semantic:**
  - Success: `#34D399` (emerald)
  - Warning: `#FBBF24` (amber)
  - Error: `#EF4444` (red)
  - Info: `#60A5FA` (blue)
- **Dark mode strategy:** surface #151515, card #1C1C1C, border #2A2A2A, accent 유지

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined (mobile-first PWA)
- **Grid:** Single column (mobile), max 2 columns on wider screens
- **Max content width:** 720px
- **Border radius:** sm:8px (inputs), md:14px (cards), lg:20px (profile cards), pill:26px (buttons), full:9999px (avatars)

## Motion
- **Approach:** Intentional (subtle entrance + state transitions)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-350ms) long(400-600ms)
- **Patterns:** card entrance fade-up, tab crossfade, mode toggle slide, 소개장 unfold

## Buttons
- **Primary (소개하기/수락):** pill shape, accent background, white text, shadow `0 4px 16px rgba(74,123,111,.2)`
- **Secondary (거절/다음에):** pill shape, #F3F3F2 background, muted text
- **Ghost:** transparent, accent text

## CSS Variables
```css
:root {
  --primary: #1A1A1A;
  --accent: #4A7B6F;
  --accent-hover: #3D6A5E;
  --accent-light: #EFF7F5;
  --surface: #FAFAF9;
  --surface-alt: #F3F3F2;
  --muted: #8C8C8C;
  --border: #EBEBEB;
  --success: #34D399;
  --warning: #FBBF24;
  --error: #EF4444;
  --info: #60A5FA;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-pill: 26px;
}
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-01 | Initial: Warm Minimal | /design-consultation 첫 제안. terracotta + Galmuri. |
| 2026-05-01 | Pivot: Cool Mono + Electric | /design-shotgun R2. 유저가 warm 톤 거부. #111 + 순백 + 코랄로 전환. |
| 2026-05-01 | Variant E (Electric) 선택 | 코랄 악센트 (#FF6B6B), pill 버튼, 소개장 UI, 밝은 에너지. |
| 2026-05-01 | 소개장 UI 채택 | Variant C에서 발견. 주선자 메모 + 평판 태그를 추천 카드 상단에 배치. |
| 2026-05-01 | 로고: "반쪽" 단색 + dot | 반/쪽 색 분리 거부. 단일 색상 + 악센트 dot으로 정리. |
| 2026-05-01 | Galmuri11 제거 | warm 톤과 함께 제거. Pretendard 단일 폰트 시스템으로 통일. |
| 2026-05-05 | v2 Pivot: Quiet Minimal | /autoplan 리뷰. 데이팅앱 톤 탈피. 코랄→muted teal (#4A7B6F). |
| 2026-05-05 | 모드 토글 패턴 결정 | Header pill toggle (참가자/주선자). 탭바 충돌 방지. |
| 2026-05-05 | 좋아요 버튼 제거 | v2에 좋아요 기능 없음. Primary CTA는 "소개하기/수락". |
