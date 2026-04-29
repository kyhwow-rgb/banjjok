#!/bin/bash
# 반쪽 시뮬레이터 미리보기 (서비스워커 캐시 초기화 후 최신 버전 열기)
# git push 후 자동 실행됨 (.claude/settings.json 훅)

DEVICE=$(xcrun simctl list devices booted -j 2>/dev/null | python3 -c "import sys,json; devs=[d for r in json.load(sys.stdin)['devices'].values() for d in r if d['state']=='Booted']; print(devs[0]['udid'] if devs else '')" 2>/dev/null)

if [ -z "$DEVICE" ]; then
    DEVICE=$(xcrun simctl list devices available -j 2>/dev/null | python3 -c "import sys,json; devs=[d for r in json.load(sys.stdin)['devices'].values() for d in r if 'iPhone' in d['name'] and d['isAvailable']]; print(devs[0]['udid'] if devs else '')" 2>/dev/null)
    [ -z "$DEVICE" ] && exit 0
    xcrun simctl boot "$DEVICE" 2>/dev/null
    sleep 3
    open -a Simulator 2>/dev/null
    sleep 2
fi

# 1단계: 서비스워커 + 캐시 삭제 페이지 열기
xcrun simctl openurl booted "https://kyhwow-rgb.github.io/banjjok/clear-cache.html" 2>/dev/null

# clear-cache.html이 자동으로 메인 페이지로 리다이렉트함
