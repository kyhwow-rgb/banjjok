'use strict';

// ══════════════════════════════════════
//  반쪽 — 공통 모듈
//  index.html, dashboard.html 에서 공유
// ══════════════════════════════════════

// ── Supabase 초기화 ──
const SUPABASE_URL = 'https://gwthsweeocjovfcbcvpa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dGhzd2Vlb2Nqb3ZmY2JjdnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTM4OTgsImV4cCI6MjA5MTE4OTg5OH0.omd5yf67wbTLveOkQpWzFFqBgpntvx1NEhPUaFUwP_w';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

// ── 관리자 확인 (P0: 서버사이드 기반) ──
async function checkIsAdmin() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;
    const { data } = await db.from('admin_users').select('user_id').eq('user_id', user.id).limit(1);
    return !!(data && data.length > 0);
}

// ── 주선 권한 확인 (matchmaker이거나 추천인이 있는 participant) ──
async function canManageIntros(profile) {
    if (profile.role === 'matchmaker') return true;
    if (!profile.referral_code) return false;
    const { count } = await db.from('applicants')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', profile.referral_code);
    return count > 0;
}

// ── HTML 이스케이프 ──
function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');
}
// JS 컨텍스트 이스케이프 (onclick 등 인라인 핸들러 내 문자열에 사용)
function escJs(str) {
    if (str == null) return '';
    return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/</g,'\\x3c');
}

// ── 토스트 ──
let _toastTimer;
function toast(msg, type) {
    const el = document.getElementById('toast');
    if (!type) {
        if (msg.includes('완료') || msg.includes('되었습니다') || msg.includes('저장') || msg.includes('성공')) type = 'success';
        else if (msg.includes('실패') || msg.includes('오류') || msg.includes('Error')) type = 'error';
        else if (msg.includes('입력해') || msg.includes('선택해') || msg.includes('업로드')) type = 'warning';
        else type = 'info';
    }
    const icons = { success:'<i class="fa-solid fa-circle-check"></i>', error:'<i class="fa-solid fa-circle-xmark"></i>', warning:'<i class="fa-solid fa-triangle-exclamation"></i>', info:'<i class="fa-solid fa-circle-info"></i>' };
    el.className = 'toast toast-' + type;
    el.innerHTML = `<span style="font-size:1.1em;">${icons[type] || icons.info}</span> ${esc(msg)}`;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    const duration = (type === 'error' || type === 'warning') ? 5000 : 3200;
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── 나이 계산 (number | null) ──
function calcAge(birth) {
    if (!birth) return null;
    const b = new Date(birth);
    if (isNaN(b.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - b.getFullYear();
    if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--;
    return (age > 0 && age < 120) ? age : null;
}

// ── MBTI 궁합 (단일 정의) ──
const MBTI_COMPAT = {
    'ENFP':{'INFJ':95,'INTJ':92,'ENFJ':85,'ENTJ':82,'INFP':80,'ENTP':78,'INTP':75},
    'ENFJ':{'INFP':95,'ISFP':90,'ENFP':85,'ENTP':82,'INTJ':80,'INFJ':78},
    'ENTP':{'INFJ':95,'INTJ':90,'ENFJ':82,'ENFP':78,'INTP':75,'ENTJ':72},
    'ENTJ':{'INFP':92,'INTP':88,'ENFP':82,'ENTP':72,'INTJ':70,'ENFJ':68},
    'INFP':{'ENFJ':95,'ENTJ':92,'INFJ':85,'ENFP':80,'INTP':75,'ISFP':72},
    'INFJ':{'ENTP':95,'ENFP':92,'INTJ':85,'INFP':85,'ENFJ':78,'INTP':72},
    'INTP':{'ENTJ':88,'ENFJ':82,'ENTP':75,'INTJ':72,'INFJ':72,'INFP':75},
    'INTJ':{'ENFP':92,'ENTP':90,'INFJ':85,'ENTJ':70,'INFP':68,'INTP':72},
    'ESFP':{'ISFJ':88,'ISTJ':85,'ESFJ':78,'ESTP':72,'ISFP':70},
    'ESFJ':{'ISFP':88,'ISTP':85,'ESFP':78,'ESTJ':75,'ISFJ':72},
    'ESTP':{'ISFJ':85,'ISTJ':82,'ESFP':72,'ESTJ':70,'ISTP':68},
    'ESTJ':{'ISFP':85,'ISTP':82,'ESFJ':75,'ESTP':70,'ISTJ':68},
    'ISFP':{'ENFJ':90,'ESFJ':88,'ESTJ':85,'ENTJ':78,'ISFJ':72},
    'ISFJ':{'ESFP':88,'ESTP':85,'ENFP':78,'ISFP':72,'ISTJ':70},
    'ISTP':{'ESFJ':85,'ESTJ':82,'ENTP':72,'ESTP':68,'INTP':65},
    'ISTJ':{'ESFP':85,'ESTP':82,'ENFP':75,'ESTJ':68,'ISFJ':70},
};
function calcMbtiCompat(m1, m2) {
    if (!m1 || !m2) return 50;
    const a = m1.toUpperCase(), b = m2.toUpperCase();
    if (a === b) return 65;
    return MBTI_COMPAT[a]?.[b] || MBTI_COMPAT[b]?.[a] || 50;
}

// ── 직업 점수 ──
const JOB_SCORES = { '전문직':95, '연구·기술직':85, '공공·금융·교육직':80, '대기업·중견기업직':75, '사업·전문자유직':70, '일반사무·기술직':60, '대학생/대학원생':45, '대학원생':50, '대학생':40, '학생':40, '기타':30 };
function calcJobScore(jc) { return JOB_SCORES[jc] || 50; }

// ── 이상형 키 범위 매칭 ──
function heightInRange(h, range, candidateGender) {
    if (!h || !range) return false;
    if (candidateGender === 'female') {
        if (range === '155미만') return h < 155;
        if (range === '155~160') return h >= 155 && h < 160;
        if (range === '160~165') return h >= 160 && h < 165;
        if (range === '165~170') return h >= 165 && h < 170;
        if (range === '170이상') return h >= 170;
    } else {
        if (range === '170미만') return h < 170;
        if (range === '170~175') return h >= 170 && h < 175;
        if (range === '175~180') return h >= 175 && h < 180;
        if (range === '180~185') return h >= 180 && h < 185;
        if (range === '185이상') return h >= 185;
    }
    return false;
}

// ── 매칭 점수 (개인화: viewer의 이상형 기준) ──
// opts.detailed=true → 항목별 breakdown 객체 반환
function calcMatchScore(viewer, candidate, opts) {
    let w = { height:20, looks:20, job:15, location:15, age:15, mbti:15 };
    if (viewer.ideal_weights) { try { const saved = JSON.parse(viewer.ideal_weights); Object.assign(w, saved); } catch {} }
    const total = (w.height||0) + (w.looks||0) + (w.job||0) + (w.location||0) + (w.age||0) + (w.mbti||0);
    if (total === 0) return 50;

    let ideal = {};
    if (viewer.ideal) { try { ideal = JSON.parse(viewer.ideal); } catch {} }

    // 1. 키 (이상형 범위 매칭)
    let heightScore = 50;
    if (candidate.height) {
        const h = parseInt(candidate.height);
        const pref = ideal['키'] || [];
        if (pref.length === 0) { heightScore = 70; }
        else { heightScore = pref.some(range => heightInRange(h, range, candidate.gender)) ? 95 : 30; }
    }

    // 2. 외모
    const looksScore = candidate.look_score || 50;

    // 3. 직업
    const jobScore = calcJobScore(candidate.job_category);

    // 4. 지역 (이상형 선호 반영)
    let locationScore = 50;
    if (candidate.location && viewer.location) {
        const prefLoc = ideal['지역'] || [];
        if (prefLoc.includes('상관없음') || prefLoc.length === 0) {
            locationScore = candidate.location === viewer.location ? 80 : 60;
        } else {
            const cLoc = candidate.location;
            const locMatch = prefLoc.some(p => cLoc.includes(p) || p.includes(cLoc));
            locationScore = locMatch ? 95 : (cLoc === viewer.location ? 70 : 30);
        }
    }

    // 5. 나이 (선호 생년 범위)
    let ageScore = 50;
    if (candidate.birth) {
        const candYear = new Date(candidate.birth).getFullYear();
        let yStart = ideal['생년_시작'], yEnd = ideal['생년_끝'];
        if ((yStart == null || yEnd == null) && viewer.birth) {
            const vYear = new Date(viewer.birth).getFullYear();
            if (yStart == null && ideal['나이_연상'] != null) yStart = vYear - parseInt(ideal['나이_연상']);
            if (yEnd == null && ideal['나이_연하'] != null) yEnd = vYear + parseInt(ideal['나이_연하']);
        }
        if (yStart != null && yEnd != null) {
            const minY = Math.min(yStart, yEnd), maxY = Math.max(yStart, yEnd);
            if (candYear >= minY && candYear <= maxY) { ageScore = 95; }
            else { const dist = candYear < minY ? (minY - candYear) : (candYear - maxY); ageScore = Math.max(15, 85 - dist * 12); }
        } else if (viewer.birth) {
            const diff = Math.abs(calcAge(candidate.birth) - calcAge(viewer.birth));
            ageScore = diff <= 3 ? 85 : diff <= 5 ? 70 : diff <= 8 ? 50 : 30;
        }
    }

    // 6. MBTI (궁합 + 이상형 성향)
    let mbtiScore = calcMbtiCompat(viewer.mbti, candidate.mbti);
    const prefMbti = ideal['성향'] || [];
    if (prefMbti.length > 0 && !prefMbti.includes('상관없음') && candidate.mbti) {
        const matchCount = prefMbti.filter(p => candidate.mbti.toUpperCase().includes(p)).length;
        mbtiScore = Math.min(100, mbtiScore + matchCount * 8);
    }

    // 7. 종교 보너스
    let religionBonus = 0;
    const prefReligion = ideal['종교'] || [];
    if (prefReligion.length > 0 && !prefReligion.includes('상관없음') && candidate.religion) {
        religionBonus = prefReligion.includes(candidate.religion) ? 5 : -5;
    }

    const weighted = (heightScore*(w.height||0) + looksScore*(w.looks||0) + jobScore*(w.job||0) + locationScore*(w.location||0) + ageScore*(w.age||0) + mbtiScore*(w.mbti||0)) / total;
    const finalScore = Math.min(100, Math.max(0, Math.round(weighted + religionBonus)));

    if (opts && opts.detailed) {
        return {
            total: finalScore,
            categories: [
                { key:'height', score:heightScore, weight:w.height||0, label:'키', icon:'fa-ruler-vertical' },
                { key:'looks',  score:looksScore,  weight:w.looks||0,  label:'외모', icon:'fa-star' },
                { key:'job',    score:jobScore,     weight:w.job||0,    label:'직업', icon:'fa-briefcase' },
                { key:'location',score:locationScore,weight:w.location||0,label:'지역', icon:'fa-location-dot' },
                { key:'age',    score:ageScore,     weight:w.age||0,    label:'나이', icon:'fa-cake-candles' },
                { key:'mbti',   score:mbtiScore,    weight:w.mbti||0,   label:'MBTI', icon:'fa-brain' },
            ]
        };
    }
    return finalScore;
}

// ── 매칭 확률 예측 ──
function calcMatchProbability(viewer, candidate, opts) {
    const forward = calcMatchScore(viewer, candidate);
    const reverse = calcMatchScore(candidate, viewer);
    const bidir = Math.sqrt(forward * reverse);

    // 활동성 (최근 접속)
    let activity = 0.3;
    if (candidate.last_seen_at) {
        const h = (Date.now() - new Date(candidate.last_seen_at).getTime()) / 3600000;
        activity = h < 1 ? 1.0 : h < 24 ? 0.9 : h < 72 ? 0.7 : h < 168 ? 0.5 : 0.3;
    }

    // 인기도 (찜 많으면 경쟁 높음)
    const fav = opts?.favCount || 0;
    const pop = fav > 10 ? 0.6 : fav > 5 ? 0.75 : fav > 2 ? 0.85 : 1.0;

    return Math.min(95, Math.max(5, Math.round(bidir * activity * pop / 100 * 100)));
}

// ── 프로필 품질 점수 (객관적, 관리자용) ──
function calcProfileQuality(person) {
    const scores = [];
    // 외모
    scores.push(person.look_score || 50);
    // 직업
    scores.push(calcJobScore(person.job_category));
    // 키 백분위
    if (person.height) {
        const h = parseInt(person.height);
        if (person.gender === 'male') {
            scores.push(h >= 185 ? 95 : h >= 180 ? 85 : h >= 175 ? 75 : h >= 170 ? 60 : 40);
        } else {
            scores.push(h >= 168 ? 90 : h >= 163 ? 80 : h >= 158 ? 70 : h >= 153 ? 55 : 40);
        }
    }
    // 프로필 완성도
    const fields = ['name','birth','job','height','location','mbti','kakao','intro','education','hobby'];
    const filled = fields.filter(f => person[f]).length + (person.photos?.length > 0 ? 2 : 0);
    scores.push(Math.round((filled / (fields.length + 2)) * 100));
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
