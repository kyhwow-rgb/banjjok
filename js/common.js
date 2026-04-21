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

// ── HTML 이스케이프 ──
function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');
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
const JOB_SCORES = { '전문직':95, '연구·기술직':85, '공공·금융·교육직':80, '대기업·중견기업직':75, '사업·전문자유직':70, '일반사무·기술직':60, '학생':40, '기타':30 };
function calcJobScore(jc) { return JOB_SCORES[jc] || 50; }
