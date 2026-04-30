# Design System — 반쪽 (Banjjok)

## Product Context
- **What this is:** 초대 코드 기반 소개팅 PWA. 지인이 추천한 사람만 만남.
- **Who it's for:** 20-30대 한국 싱글
- **Space/industry:** 소개팅/데이팅 앱 (Amanda, Noondate, GLAM과 경쟁)
- **Project type:** Mobile-first PWA (GitHub Pages)
- **Memorable thing:** "친구가 소개해준 사람이라 더 안심되는 느낌"

## Aesthetic Direction
- **Direction:** Warm Minimal
- **Decoration level:** Intentional (subtle texture, paper-like grain on cards)
- **Mood:** 카페에서 친구가 소개해주는 따뜻함. 차갑지 않고, 산만하지 않고, 정돈되어 있지만 사람 냄새가 남.
- **Anti-patterns:** 순백+네온 악센트, 퍼플 그라디언트, 3컬럼 아이콘 그리드, 센터 정렬 일변도

## Typography
- **Display/Hero:** Galmuri11 — 한국 픽셀 폰트. 레트로 감성으로 "지인 소개"의 아날로그 따뜻함 전달.
- **Body:** Pretendard — 한국 앱의 de facto 표준. 가독성 완벽.
- **Logo/Accent:** DM Serif Display — 영문 로고 "반쪽"에 품격. 세리프의 클래식함.
- **Data/Tables:** Pretendard (tabular-nums)
- **Loading:** Pretendard(CDN), Galmuri11(CDN), DM Serif Display(Google Fonts)
- **Scale:** 11px / 13px / 15px / 18px / 24px / 32px / 48px

## Color
- **Approach:** Restrained (1 accent + warm neutrals)
- **Primary:** `#2D2A26` — warm charcoal. 텍스트, 헤더. #111보다 따뜻한 검정.
- **Accent:** `#D4664A` — terracotta. CTA, 강조. 붉은 황토색으로 자연스럽고 따뜻함.
- **Accent hover:** `#C05A40`
- **Surface:** `#FAF8F5` — off-white 배경. 순백보다 포근하고 원안한 느낌.
- **Surface card:** `#FFFFFF` — 카드 배경. surface와 대비.
- **Muted:** `#A39E97` — warm gray. 보조 텍스트.
- **Border:** `#EBE7E2` — warm border.
- **Semantic:**
  - Success: `#3D8B6E` (sage green)
  - Warning: `#CC8D35` (amber)
  - Error: `#C15450` (muted red)
  - Info: `#5B7FA6` (slate blue)
- **Dark mode strategy:** surface #1C1A17, card #2A2724, border #3A3632, accent saturation +10%

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined (mobile-first PWA)
- **Grid:** Single column (mobile), max 2 columns on wider screens
- **Max content width:** 720px
- **Border radius:** sm:8px (buttons, inputs), md:14px (cards, sections), lg:20px (profile cards, hero), full:9999px (pills, avatars)

## Motion
- **Approach:** Intentional (subtle entrance + state transitions)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-350ms) long(400-600ms)
- **Patterns:** Card entrance fade-up, tab content crossfade, button press scale(0.97)

## CSS Variables
```css
:root {
  --primary: #2D2A26;
  --accent: #D4664A;
  --accent-hover: #C05A40;
  --surface: #FAF8F5;
  --surface-card: #FFFFFF;
  --muted: #A39E97;
  --border: #EBE7E2;
  --success: #3D8B6E;
  --warning: #CC8D35;
  --error: #C15450;
  --info: #5B7FA6;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
}
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-01 | Initial design system created | /design-consultation. Warm Minimal direction based on "친구 소개의 안심감". Competitive research: 한국 소개팅 앱들이 순백+네온으로 수렴하는 반면, terracotta warm palette로 차별화. |
| 2026-05-01 | Galmuri11 as display font | 레트로 픽셀 감성으로 데이팅 앱 카테고리에서 파격적 차별화. 아날로그 따뜻함 전달. |
| 2026-05-01 | Terracotta accent (#D4664A) | 기존 로즈(#e11d48)보다 따뜻하고 자연스러움. 대부분의 데이팅 앱이 핑크/퍼플 쓰는 것과 대비. |
