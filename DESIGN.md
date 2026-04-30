# Design System — 반쪽 (Banjjok)

## Product Context
- **What this is:** 초대 코드 기반 소개팅 PWA. 지인이 추천한 사람만 만남.
- **Who it's for:** 20-30대 한국 싱글
- **Space/industry:** 소개팅/데이팅 앱 (Amanda, Noondate, GLAM과 경쟁)
- **Project type:** Mobile-first PWA (GitHub Pages)
- **Memorable thing:** "친구가 소개해준 사람이라 더 안심되는 느낌"

## Aesthetic Direction
- **Direction:** Cool Mono + Electric
- **Decoration level:** Minimal (깨끗한 순백 + 강한 악센트로 포인트)
- **Mood:** 깔끔하고 밝은 에너지. 소개장 UI로 "지인 소개"의 신뢰감 전달. 차갑지 않되 군더더기 없음.
- **Anti-patterns:** 퍼플 그라디언트, warm/beige 톤, 로고 색 분리(반/쪽), 3컬럼 아이콘 그리드

## Key UI Pattern: 소개장
- 추천 카드 상단에 "OOO님이 보낸 소개장" 영역 배치
- 주선자의 직접 메모 (왜 이 사람을 소개하는지)
- 주선자 평판 태그 (성사 횟수, 성공률, 골든 뱃지)
- 소개장 배경: accent-light (#FFF0F0), 둥근 모서리

## Typography
- **Display/Hero:** Pretendard — 깔끔한 고딕으로 통일. 무게감으로 차별화.
- **Body:** Pretendard — 가독성 완벽.
- **Logo:** Pretendard Black (900) — 단일 색상, 단일 폰트. "반쪽" + dot 악센트.
- **Data/Tables:** Pretendard (tabular-nums)
- **Loading:** Pretendard(CDN)
- **Scale:** 11px / 13px / 15px / 18px / 24px / 32px / 48px

## Color
- **Approach:** Restrained (1 accent + cool neutrals)
- **Primary:** `#111111` — 순수 검정에 가까운 텍스트.
- **Accent:** `#FF6B6B` — coral/electric pink. CTA, 강조, 좋아요.
- **Accent hover:** `#E85C5C`
- **Accent light:** `#FFF0F0` — 소개장 배경, 배지 배경.
- **Surface:** `#FFFFFF` — 순백 배경.
- **Surface alt:** `#F8F8F8` — 태그, 패스 버튼 배경.
- **Muted:** `#888888` — 보조 텍스트.
- **Border:** `#F0F0F0` — 경계선.
- **Semantic:**
  - Success: `#34D399` (emerald)
  - Warning: `#FBBF24` (amber)
  - Error: `#EF4444` (red)
  - Info: `#60A5FA` (blue)
- **Dark mode strategy:** surface #111, card #1A1A1A, border #2A2A2A, accent 유지

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
- **Patterns:** 좋아요 버튼 hover lift (translateY -2px + shadow), card entrance fade-up, tab crossfade

## Buttons
- **Primary (좋아요):** pill shape, accent background, white text, shadow `0 4px 16px rgba(255,107,107,.3)`
- **Secondary (다음에):** pill shape, #F5F5F5 background, muted text
- **Ghost:** transparent, accent text

## CSS Variables
```css
:root {
  --primary: #111111;
  --accent: #FF6B6B;
  --accent-hover: #E85C5C;
  --accent-light: #FFF0F0;
  --surface: #FFFFFF;
  --surface-alt: #F8F8F8;
  --muted: #888888;
  --border: #F0F0F0;
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
