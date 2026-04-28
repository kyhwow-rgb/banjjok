#!/bin/bash
# 반쪽 빌드 스크립트 — JS/CSS 미니파이
# 사용법: bash build.sh

set -e
echo "🔧 반쪽 빌드 시작..."

# JS 미니파이 (terser)
echo "  JS 압축 중..."
npx terser js/common.js -o js/common.min.js -c -m 2>/dev/null
npx terser js/index.js -o js/index.min.js -c -m 2>/dev/null
npx terser js/dashboard.js -o js/dashboard.min.js -c -m 2>/dev/null

# CSS 미니파이 (간단한 공백/주석 제거)
echo "  CSS 압축 중..."
for f in css/index.css css/dashboard.css; do
    out="${f%.css}.min.css"
    # 주석 제거 → 불필요한 공백 제거
    sed 's|/\*[^*]*\*+([^/*][^*]*\*+)*/||g' "$f" | tr -s ' \n' ' ' > "$out"
done

# 크기 비교
echo ""
echo "📊 크기 비교:"
for f in js/common js/index js/dashboard; do
    orig=$(wc -c < "${f}.js" | tr -d ' ')
    mini=$(wc -c < "${f}.min.js" | tr -d ' ')
    pct=$((100 - mini * 100 / orig))
    echo "  ${f}.js: ${orig}B → ${mini}B (-${pct}%)"
done
for f in css/index css/dashboard; do
    orig=$(wc -c < "${f}.css" | tr -d ' ')
    mini=$(wc -c < "${f}.min.css" | tr -d ' ')
    pct=$((100 - mini * 100 / orig))
    echo "  ${f}.css: ${orig}B → ${mini}B (-${pct}%)"
done

echo ""
echo "✅ 빌드 완료!"
echo "💡 프로덕션 배포 시 HTML에서 .js → .min.js, .css → .min.css로 변경하세요."
