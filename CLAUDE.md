# 반쪽 (Banjjok)

초대받은 사람들의 소개팅 PWA

## 개요

- **서비스**: 초대 코드 기반 소개팅 매칭 앱
- **배포 URL**: https://kyhwow-rgb.github.io/banjjok/
- **GitHub**: https://github.com/kyhwow-rgb/banjjok
- **개발 기간**: 2026-04-09 ~
- **현재 버전**: SW v55

## 기술 스택

- **프론트엔드**: Vanilla HTML/CSS/JS (프레임워크 없음)
- **백엔드**: Supabase (Auth, Database, Storage, Realtime)
- **PWA**: Service Worker + Web App Manifest
- **푸시 알림**: Web Push API
- **호스팅**: GitHub Pages
- **폰트**: Pretendard, DM Serif Display
- **아이콘**: Font Awesome 6.5

## 프로젝트 구조

```
banjjok/
├── index.html          # 메인 앱 (로그인, 추천, 관심, 대화, MY 탭)
├── dashboard.html      # 관리자 대시보드
├── js/
│   ├── common.js       # Supabase 초기화, 공통 유틸 (esc, 관리자 체크 등)
│   ├── index.js        # 메인 앱 로직
│   └── dashboard.js    # 관리자 대시보드 로직
├── css/
│   ├── index.css       # 메인 앱 스타일
│   └── dashboard.css   # 대시보드 스타일
├── sw.js               # Service Worker (캐시 + 웹 푸시)
├── manifest.json       # PWA 매니페스트
├── icons/              # 앱 아이콘 (192px, 512px, SVG, Apple Touch)
├── og-image.svg        # 카카오톡/SNS 미리보기 이미지
└── supabase-storage-setup.sql  # Supabase 스토리지 설정 SQL
```

## 주요 기능

- **초대 코드 가입**: 초대받은 사람만 가입 가능
- **프로필 관리**: 사진, 소개, 직업, 생년월일 등
- **추천 카드**: 스와이프 방식으로 상대 프로필 탐색
- **찜 / 상호 찜**: 상호 찜 시 자동 매칭
- **대화 탭**: 카톡 스타일 채팅
- **관심 탭**: 나를 찜한 사람, 내가 찜한 사람 확인
- **푸시 알림**: 매칭, 메시지 등 실시간 알림
- **관리자 대시보드**: 유저/매칭/초대코드 관리

## 로컬 개발

```bash
# 로컬 서버 실행
npx http-server . -p 8080 -c-1

# 브라우저에서 접속
open http://localhost:8080

# iOS 시뮬레이터에서 확인
xcrun simctl openurl booted http://localhost:8080
```

## 참고사항

- Supabase anon key는 `js/common.js`에 하드코딩되어 있음 (RLS로 보호)
- Service Worker 캐시 버전은 `sw.js`의 `CACHE` 상수로 관리 (현재 `banjjok-v27`)
- GitHub Pages 배포이므로 `start_url`, `scope` 등이 `/banjjok/` 경로 기준

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
