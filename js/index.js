'use strict';

let prevScreen         = 'login';
let selectedGender     = null;
// (cachedPw 제거 — 레거시 평문 비밀번호 캐시)
let adminCache         = [];
let photoFiles         = [null, null, null];
let _skipRegisterReset = false; // prefill 직후 showScreen 시 resetForm 건너뛰기용
let _submitting = false; // 더블서밋 방지 가드

// ── 생년월일 유효성 검증 ──
function isValidBirth(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// ── 직업군 정규화 (레거시 값 호환) ──
function normalizeJobCategory(val) {
    if (!val) return '';
    if (['대학생','대학원생','학생'].includes(val)) return '대학생/대학원생';
    return val;
}
let _adminRendered     = false;
let currentAdminFilter = 'all';
let _historyNav        = false;

// ── 세션 저장/복원 ──
function saveSession(role, screen) {
    localStorage.setItem('kj_role',   role);
    localStorage.setItem('kj_screen', screen);
}
function clearSession() {
    localStorage.removeItem('kj_role');
    localStorage.removeItem('kj_screen');
    localStorage.removeItem('kj_filter');
}

// ── 로딩 ──
function setLoading(on, msg='잠시만요...') {
    document.getElementById('loading-overlay').classList.toggle('on', on);
    document.getElementById('loading-msg').textContent = msg;
}

// (getPasswords 제거 — 레거시 평문 비밀번호 함수. 비밀번호 변경은 savePasswords에서 직접 처리)

// ── 화면 전환 ──
function showScreen(name) {
    const prev = document.querySelector('.screen.active');
    const next = document.getElementById('screen-' + name);
    if (prev && prev !== next) {
        prev.style.opacity = '0';
        setTimeout(() => {
            prev.classList.remove('active');
            prev.style.opacity = '';
            next.classList.add('active');
            // 약간의 딜레이 후 fade in
            requestAnimationFrame(() => { next.style.opacity = '0'; requestAnimationFrame(() => { next.style.opacity = '1'; }); });
        }, 150);
    } else {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        next.classList.add('active');
    }
    if (name === 'home')     renderHome();
    if (name === 'admin')    renderAdmin();
    if (name === 'register' && !_skipRegisterReset) resetForm();
    _skipRegisterReset = false;
    // register 화면 진입 시 ?ref= 파라미터로 저장된 코드 자동 입력 (reset 이후 실행)
    if (name === 'register') {
        const el = document.getElementById('reg-referral-code');
        // 회원가입 시 입력한 추천인 코드 자동 채움
        const signupRef = localStorage.getItem('bj_signup_ref_code');
        if (signupRef && el) {
            el.value = signupRef;
        }
        // ?ref= URL 파라미터로 저장된 코드
        const pendingRef = localStorage.getItem('bj_pending_ref_code');
        if (pendingRef && el && !el.value) {
            el.value = pendingRef;
            localStorage.removeItem('bj_pending_ref_code');
        }
    }

    if (!_historyNav) history.pushState({ screen: name }, '', location.pathname);

    const role = localStorage.getItem('kj_role');
    if (name !== 'login' && role) localStorage.setItem('kj_screen', name);
}

function goRegister() {
    prevScreen = document.querySelector('.screen.active').id.replace('screen-', '');
    showScreen('register');
}
function goBack() {
    // 대시보드에서 프로필 수정으로 온 경우 → 대시보드로 복귀
    if (document.referrer.includes('dashboard') || localStorage.getItem('kj_screen') === 'register') {
        window.location.href = 'dashboard.html';
        return;
    }
    showScreen(prevScreen || 'home');
}
function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    db.auth.signOut();
    clearSession();
    adminCache = [];
    localStorage.removeItem('bj_signup_ref_code');
    showAuthView('invite');
    showScreen('login');
}

// ── 비밀번호 보기 토글 ──
function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text'; btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>'; }
    else { input.type = 'password'; btn.innerHTML = '<i class="fa-solid fa-eye"></i>'; }
}

// ── 접속경로 변경 핸들러 ──
function onReferralChange(sel) {
    const friendWrap = document.getElementById('reg-referral-friend-wrap');
    const textWrap = document.getElementById('reg-referral-text-wrap');
    friendWrap.style.display = 'none';
    textWrap.style.display = 'none';
    sel.style.display = '';
    if (sel.value === '지인 소개') {
        friendWrap.style.display = '';
        document.getElementById('reg-referral-friend').focus();
    } else if (sel.value === 'direct') {
        sel.style.display = 'none';
        textWrap.style.display = '';
        document.getElementById('reg-referral-text').focus();
    }
}

// ── Auth 뷰 전환 ──
function showAuthView(view) {
    document.getElementById('auth-invite').style.display = view === 'invite' ? '' : 'none';
    document.getElementById('auth-signup').style.display = view === 'signup' ? '' : 'none';
    document.getElementById('auth-login').style.display  = view === 'login'  ? '' : 'none';
    // 에러 초기화
    ['invite-error','signup-error','login-error'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    // 회원가입 화면 진입 시 ?ref= 코드 자동 입력
    if (view === 'signup') {
        const ref = localStorage.getItem('bj_pending_ref_code') || localStorage.getItem('bj_signup_ref_code');
        const el = document.getElementById('signup-referral-code');
        if (ref && el && !el.value) el.value = ref;
    }
}

// (입장 코드 → 추천인 코드로 대체됨, checkInviteCode 제거)

// Supabase Auth 에러 메시지 한글화
function translateAuthError(msg) {
    if (!msg) return '알 수 없는 오류가 발생했어요.';
    const m = String(msg).toLowerCase();
    if (m.includes('user already') || m.includes('already registered') || m.includes('email address is already')) {
        return '이미 가입된 이메일이에요. 로그인을 시도해주세요.';
    }
    if (m.includes('invalid login') || m.includes('invalid credentials')) {
        return '이메일 또는 비밀번호가 올바르지 않아요.';
    }
    if (m.includes('email not confirmed')) {
        return '이메일 인증이 완료되지 않았어요. 메일함을 확인해주세요.';
    }
    if (m.includes('password') && (m.includes('at least') || m.includes('short') || m.includes('characters'))) {
        return '비밀번호는 6자 이상이어야 해요.';
    }
    if (m.includes('invalid email') || m.includes('invalid format') || m.includes('not a valid email')) {
        return '올바른 이메일 형식이 아니에요.';
    }
    if (m.includes('rate limit') || m.includes('too many')) {
        return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    }
    if (m.includes('security purposes') && m.includes('seconds')) {
        return '보안 정책상 잠시 후 다시 시도해주세요.';
    }
    if (m.includes('network') || m.includes('failed to fetch')) {
        return '네트워크 연결을 확인해주세요.';
    }
    if (m.includes('user not found')) {
        return '가입되지 않은 이메일이에요.';
    }
    if (m.includes('weak password')) {
        return '비밀번호가 너무 단순해요. 더 복잡하게 만들어주세요.';
    }
    // 번역 못한 영어 메시지는 표시 안 함 대신 일반 문구
    if (/^[\x00-\x7f]*$/.test(msg)) {
        return '가입 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
    }
    return msg; // 한글 메시지면 그대로
}

// ── 회원가입 ──
async function doSignup() {
    const refCode = (document.getElementById('signup-referral-code').value || '').trim().toUpperCase();
    const email = document.getElementById('signup-email').value.trim();
    const pw    = document.getElementById('signup-pw').value;
    const pw2   = document.getElementById('signup-pw2').value;
    const err   = document.getElementById('signup-error');

    // 추천인 코드 먼저 검증
    if (!refCode) { err.textContent = '추천인 코드를 입력해주세요.'; err.style.display = 'block'; return; }
    if (!email || !pw) { err.textContent = '이메일과 비밀번호를 입력해주세요.'; err.style.display = 'block'; return; }
    if (pw !== pw2)    { err.textContent = '비밀번호가 일치하지 않습니다.';     err.style.display = 'block'; return; }
    if (pw.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 합니다.'; err.style.display = 'block'; return; }

    setLoading(true, '추천인 코드 확인 중...');
    // 슈퍼코드 확인
    let isSuperRef = false;
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(refCode));
        const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
        isSuperRef = hex === '17383edbe36604497caed4e82804f529edd5f4257ded15d4608f047c03ea8018';
    } catch {}

    if (!isSuperRef) {
        const { data: refData } = await db.from('applicants')
            .select('id,status')
            .eq('referral_code', refCode)
            .limit(1);
        if (!refData || !refData.length) {
            setLoading(false);
            err.textContent = '유효하지 않은 추천인 코드입니다.';
            err.style.display = 'block';
            return;
        }
        if (!['approved', 'matched'].includes(refData[0].status)) {
            setLoading(false);
            err.textContent = '추천인이 아직 활동 중이 아니에요.';
            err.style.display = 'block';
            return;
        }
    }

    setLoading(true, '가입 중...');
    const { data, error } = await db.auth.signUp({ email, password: pw });
    setLoading(false);
    if (error) { err.textContent = translateAuthError(error.message); err.style.display = 'block'; return; }
    err.style.display = 'none';
    // 이메일 인증이 필요한 경우 세션이 없을 수 있음
    if (!data.session) {
        toast('인증 메일을 보냈어요. 메일함에서 인증 후 로그인해주세요.', 'success');
        localStorage.setItem('bj_signup_ref_code', refCode);
        showAuthView('login');
        return;
    }
    // 추천인 코드를 localStorage에 저장 → 프로필 폼에서 자동 채움
    localStorage.setItem('bj_signup_ref_code', refCode);
    // 가입 성공 → 신청서 작성 화면으로
    saveSession('viewer', 'register');
    showScreen('register');
}

// ── 로그인 ──
async function resetPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { toast('이메일을 먼저 입력해주세요.', 'warning'); return; }
    setLoading(true, '메일 발송 중...');
    const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    setLoading(false);
    if (error) { toast('발송 실패: ' + translateAuthError(error.message), 'error'); return; }
    toast('비밀번호 재설정 메일을 보냈어요. 메일함을 확인해주세요.', 'success');
}

async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-pw').value;
    const err   = document.getElementById('login-error');
    setLoading(true, '로그인 중...');
    const { error } = await db.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) {
        err.textContent = translateAuthError(error.message);
        err.style.display = 'block';
        return;
    }
    err.style.display = 'none';
    window.location.href = 'dashboard.html';
}

function openAdminModal() {
    document.getElementById('admin-login-overlay').classList.add('open');
    setTimeout(() => document.getElementById('admin-pw-input').focus(), 50);
}
function closeAdminModal() {
    document.getElementById('admin-login-overlay').classList.remove('open');
    document.getElementById('admin-pw-input').value = '';
    document.getElementById('admin-email-input').value = '';
    document.getElementById('admin-login-error').style.display = 'none';
}
async function adminLogin() {
    const email = document.getElementById('admin-email-input').value.trim();
    const pw    = document.getElementById('admin-pw-input').value;
    const err   = document.getElementById('admin-login-error');
    setLoading(true, '로그인 중...');
    const { data, error } = await db.auth.signInWithPassword({ email, password: pw });
    if (error) { setLoading(false); err.style.display = 'block'; return; }
    // 서버사이드 관리자 확인 (admin_users 테이블)
    const isAdmin = await checkIsAdmin();
    setLoading(false);
    if (!isAdmin) {
        await db.auth.signOut();
        err.style.display = 'block';
        return;
    }
    closeAdminModal();
    saveSession('admin', 'admin');
    showScreen('admin');
}

function fuzzyCount(n) {
    if (n === 0) return '0';
    if (n <= 5) return '5+';
    if (n <= 10) return '10+';
    if (n <= 20) return '20+';
    if (n <= 50) return '50+';
    return '100+';
}

function animateCount(elementId, target) {
    const el = document.getElementById(elementId);
    if (target === 0) { el.textContent = '0'; return; }
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 20));
    const interval = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(interval); }
        el.textContent = current;
    }, 40);
}

// ── 홈 ──
async function renderHome() {
    // 로그인 상태에 따라 대시보드 버튼 표시
    const dashBtn = document.getElementById('home-dashboard-btn');
    const role = localStorage.getItem('kj_role');
    if (dashBtn) dashBtn.style.display = role ? '' : 'none';
    // 스켈레톤 UI 표시
    document.getElementById('home-male-count').innerHTML = '<div class="skeleton skeleton-text w60" style="height:40px;display:inline-block;width:60px;"></div>';
    document.getElementById('home-female-count').innerHTML = '<div class="skeleton skeleton-text w60" style="height:40px;display:inline-block;width:60px;"></div>';
    let list = [];
    try {
        const { data } = await db.from('applicants').select('gender,birth,job,location,mbti,photos,icebreaker').eq('status', 'approved');
        list = data || [];
    } catch(e) { console.log('renderHome error:', e.message); }
    // 정확한 숫자 대신 범위 표시
    const maleCount = list.filter(a => a.gender === 'male').length;
    const femaleCount = list.filter(a => a.gender === 'female').length;
    document.getElementById('home-male-count').textContent = fuzzyCount(maleCount);
    document.getElementById('home-female-count').textContent = fuzzyCount(femaleCount);

    // 오늘의 추천 반쪽 (랜덤 1명)
    if (list.length > 0) {
        const pick = list[Math.floor(Math.random() * list.length)];
        const age  = calcAge(pick.birth);
        const photo = pick.photos && pick.photos.length > 0 ? pick.photos[0] : null;
        const photoHtml = photo
            ? `<img class="rec-photo" loading="lazy" src="${photo}" alt="">`
            : `<div class="rec-photo-placeholder">${pick.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);"></i>'}</div>`;
        const tags = [
            age ? `${age}세` : null,
            pick.job  || null,
            pick.location || null,
            pick.mbti || null
        ].filter(Boolean).map(t => `<span class="rec-tag">${t}</span>`).join('');

        let recIbHtml = '';
        if (pick.icebreaker) {
            try {
                const ib = JSON.parse(pick.icebreaker);
                recIbHtml = `<div style="padding:8px 12px;font-size:.75em;background:#f5f3ff;border-top:1px solid #ede9fe;"><span style="color:var(--primary);font-weight:700;">💬 ${esc(ib.q)}</span><br><span style="font-weight:600;">${esc(ib.a)}</span></div>`;
            } catch {}
        }
        document.getElementById('rec-card-wrap').innerHTML = `
            <div class="rec-card">
                <div class="rec-photo-wrap">
                    ${photoHtml}
                    <div class="rec-overlay">
                        <div class="rec-hint">매칭 성사 시 공개돼요</div>
                    </div>
                </div>
                <div class="rec-info">${tags}</div>
                ${recIbHtml}
            </div>`;
        document.getElementById('rec-section').style.display = 'block';
    }
}

// ── 보석 순도 점수 ──
const SCORE_BASIC = ['reg-name','reg-birth','reg-job','reg-height','reg-location','reg-mbti','reg-kakao','reg-intro','reg-education','reg-contact','reg-smoking','reg-drinking','reg-religion'];

function calcProfileScore() {
    let score = 0;
    if (selectedGender) score += 10;
    SCORE_BASIC.forEach(id => { if (document.getElementById(id)?.value.trim()) score += 10; });
    if (photoFiles.some(f => f !== null)) score += 10;
    const cats = new Set();
    document.querySelectorAll('#ideal-chips .chip.on').forEach(c => cats.add(c.dataset.cat));
    score += cats.size * 5;
    const max = SCORE_BASIC.length * 10 + 10 + 10 + IDEAL_CATEGORIES.length * 5;
    return { score, max, pct: Math.min(100, Math.round((score / max) * 100)) };
}

function updateScoreBar() {
    const { pct } = calcProfileScore();
    document.getElementById('score-pct').textContent = pct;
    document.getElementById('score-bar-fill').style.width = pct + '%';

    const gem = document.getElementById('score-gem');
    if (pct >= 96)      { gem.innerHTML = '<i class="fa-solid fa-gem"></i>'; gem.classList.add('max'); gem.style.filter = 'none'; gem.style.color = '#7c3aed'; }
    else if (pct >= 70) { gem.innerHTML = '<i class="fa-solid fa-gem"></i>'; gem.classList.remove('max'); gem.style.filter = 'none'; gem.style.color = '#7c3aed'; }
    else if (pct >= 45) { gem.innerHTML = '<i class="fa-solid fa-gem"></i>'; gem.classList.remove('max'); gem.style.filter = 'none'; gem.style.color = '#a78bfa'; }
    else if (pct >= 20) { gem.innerHTML = '<i class="fa-solid fa-gem"></i>'; gem.classList.remove('max'); gem.style.filter = 'none'; gem.style.color = '#c4b5fd'; }
    else                { gem.innerHTML = '<i class="fa-solid fa-gem"></i>'; gem.classList.remove('max'); gem.style.filter = 'none'; gem.style.color = '#d1d5db'; }

    const msgs = [
        [0,  15,  '정보를 입력하면 순도가 올라가요! 🌱'],
        [16, 35,  '조금씩 채워가고 있어요 ✨'],
        [36, 55,  '절반을 넘었어요! 계속해요 💪'],
        [56, 75,  '거의 다 왔어요! 조금만 더 🔥'],
        [76, 95,  `순도 ${pct}% — 조금만 더 채우면 완벽한 보석이 돼요! 💎`],
        [96, 100, '완벽한 보석이 완성됐어요! ✨💎✨'],
    ];
    const m = msgs.find(([lo, hi]) => pct >= lo && pct <= hi);
    document.getElementById('score-msg').textContent = m ? m[2] : '';
}

// ── 직업 입력 → 직업군 자동 선택 ──
function autoFillJobCategory() {
    const jobInput = document.getElementById('reg-job');
    const catSelect = document.getElementById('reg-job-category');
    if (!jobInput || !catSelect) return;
    const detected = autoDetectJobCategory(jobInput.value);
    if (detected) catSelect.value = detected;
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('ideal-chips');
    if (container) container.innerHTML = buildIdealChipsHtml('reg', null);

    // 생년월일 자동 포맷 (YYYY.MM.DD)
    const birthEl = document.getElementById('reg-birth');
    if (birthEl) {
        birthEl.addEventListener('input', function(e) {
            let v = this.value.replace(/[^\d]/g, '');
            if (v.length > 8) v = v.slice(0, 8);
            if (v.length >= 5) v = v.slice(0,4) + '.' + v.slice(4);
            if (v.length >= 8) v = v.slice(0,7) + '.' + v.slice(7);
            this.value = v;
        });
    }

    // 점수바 이벤트 리스너
    SCORE_BASIC.forEach(id => document.getElementById(id)?.addEventListener('input', updateScoreBar));
    // 사진 업로드 & 칩 토글은 previewPhoto/removePhoto/toggleChip에서 직접 호출
});

// ── 사진 관련 ──
function previewPhoto(i, input) {
    if (!input.files[0]) return;
    if (input.files[0].size > 5 * 1024 * 1024) {
        toast('사진 크기는 5MB 이하만 가능해요.', 'warning');
        input.value = '';
        return;
    }
    photoFiles[i] = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById(`photo-preview-${i}`).src = e.target.result;
        document.getElementById(`photo-preview-${i}`).style.display = 'block';
        document.getElementById(`photo-ph-${i}`).style.display = 'none';
        document.getElementById(`photo-rm-${i}`).style.display = 'flex';
        document.getElementById(`photo-slot-${i}`).classList.add('has-photo');
        // 파일 input을 z-index 낮춰서 제거 버튼이 우선
        document.getElementById(`photo-file-${i}`).style.zIndex = '1';
    };
    reader.readAsDataURL(input.files[0]);
    updateScoreBar();
}

function removePhoto(event, i) {
    event.stopPropagation();
    photoFiles[i] = null;
    // 기존 사진 삭제 추적 (수정 모드에서 구사진 제거 반영)
    if (window._existingPhotos && window._existingPhotos[i]) {
        if (!window._retainedPhotos) window._retainedPhotos = [...(window._existingPhotos || [])];
        window._retainedPhotos = window._retainedPhotos.filter(u => u !== window._existingPhotos[i]);
    }
    const preview = document.getElementById(`photo-preview-${i}`);
    preview.style.display = 'none';
    preview.src = '';
    document.getElementById(`photo-ph-${i}`).style.display = 'flex';
    document.getElementById(`photo-rm-${i}`).style.display = 'none';
    document.getElementById(`photo-slot-${i}`).classList.remove('has-photo');
    document.getElementById(`photo-file-${i}`).value = '';
    document.getElementById(`photo-file-${i}`).style.zIndex = '2';
    updateScoreBar();
}

// ── 이미지 압축 → Blob (Supabase Storage 업로드용) ──
// 무료 티어 가드: 200KB/장 × 3장 × 1,700명 = 1GB
const PHOTO_MAX_KB = 200;

async function compressToBlob(file, maxKB = PHOTO_MAX_KB) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const MAX = 1200;
                if (width > MAX || height > MAX) {
                    if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                    else { width = Math.round(width * MAX / height); height = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                let quality = 0.8;
                const tryBlob = (q) => new Promise(r => canvas.toBlob(b => r(b), 'image/jpeg', q));
                (async () => {
                    let blob = await tryBlob(quality);
                    while (blob.size > maxKB * 1024 && quality > 0.25) {
                        quality -= 0.08;
                        blob = await tryBlob(quality);
                    }
                    resolve(blob);
                })();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Supabase Storage에 사진 업로드 → public URL 반환
async function uploadPhotoToStorage(file, userId, index) {
    const blob = await compressToBlob(file);
    const filename = `${userId}/${Date.now()}_${index}.jpg`;
    const { data, error } = await db.storage
        .from('photos')
        .upload(filename, blob, {
            contentType: 'image/jpeg',
            cacheControl: '31536000',
            upsert: false
        });
    if (error) throw new Error('사진 업로드 실패: ' + error.message);
    const { data: { publicUrl } } = db.storage.from('photos').getPublicUrl(filename);
    return publicUrl;
}

// 유저 폴더의 모든 사진 삭제
async function deleteUserPhotosFromStorage(userId) {
    try {
        const { data: files } = await db.storage.from('photos').list(userId);
        if (files && files.length > 0) {
            const paths = files.map(f => `${userId}/${f.name}`);
            await db.storage.from('photos').remove(paths);
        }
    } catch(e) { console.log('Storage cleanup error:', e.message); }
}

// 특정 URL의 사진만 삭제 (Storage URL인 경우만)
function getStoragePath(url) {
    if (!url || url.startsWith('data:')) return null;
    const marker = '/storage/v1/object/public/photos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
}

async function deletePhotosFromStorage(urls) {
    const paths = (urls || []).map(getStoragePath).filter(Boolean);
    if (paths.length > 0) {
        await db.storage.from('photos').remove(paths).catch(() => {});
    }
}

// ── 신청서 제출 ──
function selectGender(gender) {
    const prevGender = selectedGender;
    selectedGender = gender;
    document.getElementById('gender-male').className  = 'gender-option' + (gender === 'male'   ? ' selected male'   : '');
    document.getElementById('gender-female').className = 'gender-option' + (gender === 'female' ? ' selected female' : '');
    updateScoreBar();
    // 성별 바뀌면 이상형 키 옵션을 이성 기준으로 재빌드
    if (gender !== prevGender) {
        const container = document.getElementById('ideal-chips');
        if (container) {
            // 기존 선택값 보존 (키 제외 — 기준이 바뀜)
            const prevSelected = collectIdealData('ideal-chips', 'reg-ideal-memo');
            let prev = null;
            if (prevSelected) {
                try { prev = JSON.parse(prevSelected); delete prev['키']; } catch {}
            }
            container.innerHTML = buildIdealChipsHtml('reg', prev ? JSON.stringify(prev) : null);
        }
    }
}

function resetForm() {
    selectedGender = null;
    photoFiles = [null, null, null];
    ['gender-male','gender-female'].forEach(id => document.getElementById(id).className = 'gender-option');
    ['reg-name','reg-birth','reg-job','reg-height','reg-location','reg-contact','reg-kakao',
     'reg-intro','reg-mbti','reg-education','reg-smoking','reg-drinking','reg-religion','reg-company','reg-job-title','reg-hobby','reg-referral-code'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    // hidden referral field 리셋
    const refHidden = document.getElementById('reg-referral'); if (refHidden) refHidden.value = '';
    // 이상형 칩 초기화 (성별 선택 전이니 키 옵션은 비어 있음)
    const chips = document.getElementById('ideal-chips');
    if (chips) chips.innerHTML = buildIdealChipsHtml('reg', null);
    document.getElementById('reg-ideal-memo').value = '';
    for (let i = 0; i < 3; i++) {
        document.getElementById(`photo-preview-${i}`).style.display = 'none';
        document.getElementById(`photo-preview-${i}`).src = '';
        document.getElementById(`photo-ph-${i}`).style.display = 'flex';
        document.getElementById(`photo-rm-${i}`).style.display = 'none';
        document.getElementById(`photo-slot-${i}`).classList.remove('has-photo');
        document.getElementById(`photo-file-${i}`).value = '';
        document.getElementById(`photo-file-${i}`).style.zIndex = '2';
    }
}

async function submitApplication() {
    if (_submitting) return;
    const name     = document.getElementById('reg-name').value.trim();
    const birthRaw = document.getElementById('reg-birth').value.trim();
    const birth    = birthRaw.replace(/\./g, '-');
    const job      = document.getElementById('reg-job').value.trim();
    const kakao    = document.getElementById('reg-kakao').value.trim();
    const contact  = document.getElementById('reg-contact').value.trim();
    const height   = document.getElementById('reg-height').value.trim();
    const location_ = document.getElementById('reg-location').value.trim();
    const mbti     = document.getElementById('reg-mbti').value.trim();
    const ideal    = collectIdealData('ideal-chips', 'reg-ideal-memo');
    const missing = [];
    if (!selectedGender) missing.push('성별');
    if (!name)     missing.push('이름');
    if (!isValidBirth(birth)) missing.push('생년월일 (예: 2000.01.15)');
    if (!job)      missing.push('직업');
    if (!height || parseInt(height) < 140 || parseInt(height) > 220) missing.push('키 (140~220)');
    if (!location_) missing.push('거주지');
    if (!mbti)     missing.push('MBTI');
    if (!ideal)    missing.push('이상형');
    if (!kakao)    missing.push('카카오 ID');
    if (!document.getElementById('reg-smoking').value) missing.push('흡연');
    if (!document.getElementById('reg-drinking').value) missing.push('음주');
    if (!document.getElementById('reg-religion').value) missing.push('종교');
    if (!contact) missing.push('연락처 (휴대폰)');
    if (!photoFiles.some(f => f !== null) && !(window._existingPhotos && window._existingPhotos.length > 0)) missing.push('사진');
    if (missing.length > 0) {
        toast('미입력: ' + missing.join(', '), 'warning');
        return;
    }

    _submitting = true;
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = '제출 중...';
    try {

    setLoading(true, '기존 신청서 확인 중...');
    const { data: { session } } = await db.auth.getSession();
    const userId = session?.user?.id || null;

    // 기존 신청서 조회 (수정 vs 신규 판별)
    let existingId = null;
    let existingPhotos = [];
    if (userId) {
        const { data: existing } = await db.from('applicants').select('id,photos').eq('user_id', userId).limit(1);
        if (existing && existing.length > 0) {
            existingId = existing[0].id;
            existingPhotos = existing[0].photos || [];
        }
    }

    // 신규 신청 시에만 사진 필수
    if (!existingId && !photoFiles.some(f => f !== null)) {
        setLoading(false);
        btn.disabled = false;
        toast('사진을 최소 1장 업로드해주세요.');
        return;
    }

    // 사진 압축 → Supabase Storage 업로드
    let photoUrls = [];
    const hasNewPhotos = photoFiles.some(f => f !== null);
    if (hasNewPhotos) {
        // 새 사진 먼저 업로드 (구사진은 성공 후 삭제)
        for (let i = 0; i < 3; i++) {
            if (!photoFiles[i]) continue;
            setLoading(true, `사진 ${photoUrls.length + 1}장 업로드 중...`);
            try {
                const url = await uploadPhotoToStorage(photoFiles[i], userId, i);
                photoUrls.push(url);
            } catch(e) { toast(`사진 ${i+1} 업로드 실패: ${e.message}`, 'error'); }
        }
        // 새 사진 업로드 성공 시에만 구사진 삭제
        if (photoUrls.length > 0 && existingPhotos.length > 0) {
            try { await deletePhotosFromStorage(existingPhotos); } catch(e) {}
        }
    }
    // 새 사진 없으면 삭제되지 않은 기존 사진 유지 (UI에서 제거한 것 반영)
    if (photoUrls.length === 0 && existingPhotos.length > 0) {
        photoUrls = window._retainedPhotos || existingPhotos;
    }
    // 신규 신청인데 사진 처리 전부 실패한 경우 차단
    if (!existingId && photoUrls.length === 0) {
        setLoading(false);
        btn.disabled = false;
        btn.textContent = origText;
        toast('사진 처리에 실패했어요. 다른 사진으로 다시 시도해주세요.');
        return;
    }

    setLoading(true, '신청서 저장 중...');
    const heightVal = document.getElementById('reg-height').value;
    // Ice Breaker 조합
    const ibQ = document.getElementById('reg-icebreaker-q').value;
    const ibA = document.getElementById('reg-icebreaker-a').value.trim();
    const icebreaker = (ibQ && ibA) ? JSON.stringify({ q: ibQ, a: ibA }) : null;

    // 접속경로는 추천인 코드가 대신. 추천 받은 경우 "지인 추천 (코드)" 자동 표시
    const referralCodeInputCheck = document.getElementById('reg-referral-code').value.trim().toUpperCase();
    const rowData = {
        gender:    selectedGender,
        name, birth, job, kakao,
        contact:   contact   || null,
        height:    heightVal ? parseInt(heightVal) : null,
        education: document.getElementById('reg-education').value.trim() || null,
        location:  document.getElementById('reg-location').value.trim()  || null,
        mbti:      document.getElementById('reg-mbti').value.trim().toUpperCase() || null,
        intro:     document.getElementById('reg-intro').value.trim()    || null,
        ideal:         ideal || null,
        photos:        photoUrls,
        profile_score: calcProfileScore().pct,
        job_category:  job || null,
        smoking:   document.getElementById('reg-smoking').value || null,
        drinking:  document.getElementById('reg-drinking').value || null,
        religion:  document.getElementById('reg-religion').value || null,
        company:   document.getElementById('reg-company').value.trim() || null,
        job_title: document.getElementById('reg-job-title').value.trim() || null,
        hobby:     document.getElementById('reg-hobby').value.trim() || null,
        icebreaker:    icebreaker,
    };

    // 추천인 코드 처리
    const referralCodeInput = document.getElementById('reg-referral-code').value.trim().toUpperCase();
    // 슈퍼코드 검증 (SHA-256 해시 비교 — 원문 노출 방지)
    const _SC_HASH = '17383edbe36604497caed4e82804f529edd5f4257ded15d4608f047c03ea8018';
    let isSuperCode = false;
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(referralCodeInput));
        const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
        isSuperCode = hex === _SC_HASH;
    } catch {}

    // 신규 가입자는 추천인 코드 필수 (지인 추천제)
    let referrerApplicant = null;
    if (!existingId) {
        if (!referralCodeInput) {
            setLoading(false);
            btn.disabled = false;
            btn.textContent = origText;
            toast('반쪽은 지인 추천제입니다. 추천인 코드를 입력해주세요.', 'error');
            return;
        }
        if (!isSuperCode) {
            // 추천인 코드 유효성 검증
            const { data: refData } = await db.from('applicants')
                .select('id,name,referral_code,status,user_id')
                .eq('referral_code', referralCodeInput)
                .limit(1);
            if (!refData || !refData.length) {
                setLoading(false); btn.disabled = false; btn.textContent = origText;
                toast('유효하지 않은 추천인 코드입니다.', 'error');
                return;
            }
            const ACTIVE = ['approved', 'matched'];
            if (!ACTIVE.includes(refData[0].status)) {
                setLoading(false); btn.disabled = false; btn.textContent = origText;
                toast('추천인이 아직 활동 중이 아니에요. 다른 추천 코드가 필요합니다.', 'error');
                return;
            }
            referrerApplicant = refData[0];
        }
    }

    let error;
    if (existingId) {
        // 수정 모드: referral/referred_by는 건드리지 않음 (기존 값 유지)
        const { error: updateError } = await db.from('applicants').update(rowData).eq('id', existingId);
        error = updateError;
    } else {
        // 고유 추천 코드 생성 (이름 첫 글자 + 랜덤 5자리, 충돌 시 재생성)
        let myCode;
        for (let _retry = 0; _retry < 5; _retry++) {
            myCode = (name.charAt(0) || 'B') + Math.random().toString(36).slice(2, 7).toUpperCase();
            const { data: dup } = await db.from('applicants').select('id').eq('referral_code', myCode).limit(1);
            if (!dup || dup.length === 0) break;
        }
        const row = {
            id:      (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,10)),
            status:  isSuperCode ? 'pending' : 'pending_reputation', // 슈퍼코드 → 바로 심사, 일반 → 평판 대기
            user_id: userId,
            referral_code: myCode,
            referred_by: referralCodeInput || null,
            referral: referralCodeInputCheck ? `지인 추천 (${referralCodeInputCheck})` : null,
            ...rowData,
        };
        const { error: insertError } = await db.from('applicants').insert([row]);
        error = insertError;

        // 추천인에게 평판 요청 푸시/알림
        if (!insertError && referrerApplicant?.user_id) {
            try {
                const dashBase = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html';
                // notifications 테이블 (인앱)
                await db.from('notifications').insert({
                    user_id: referrerApplicant.user_id,
                    type: 'reputation_request',
                    title: '지인이 당신 코드로 가입했어요!',
                    body: `${name}님에게 평판을 남겨주세요. 최소 2개의 평판이 모여야 승인 심사로 넘어갑니다.`,
                    related_id: row.id
                }).then(() => {}, () => {});
                // 푸시
                if (typeof sendPushNotifIfPossible === 'function') {
                    sendPushNotifIfPossible(referrerApplicant.user_id, '✨ 지인 추천 도착', `${name}님이 당신의 코드로 가입했어요. 평판을 남겨주세요!`, dashBase + '#tab-my');
                }
            } catch(e) { console.log('notify referrer error:', e.message); }
        }

        // 추천인 인센티브 적용 (원자적 업데이트) — 슈퍼코드 및 초대코드 제외
        if (!insertError && referralCodeInput && !isSuperCode) {
            try {
                const boostUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                // RPC 사용 시도, 없으면 직접 업데이트
                try {
                    await db.rpc('apply_referral_bonus', { referrer_code: referralCodeInput, boost_ts: boostUntil });
                } catch(rpcErr) {
                    // RPC 미설정 시 폴백 (직접 업데이트)
                    const { data: referrer } = await db.from('applicants').select('id').eq('referral_code', referralCodeInput).limit(1);
                    if (referrer?.[0]) {
                        await db.from('applicants').update({
                            referral_count: db.rpc ? undefined : 1, // 폴백용
                            fav_slots: 4,
                            boost_until: boostUntil,
                        }).eq('id', referrer[0].id);
                    }
                }
                // 피추천인(나)도 24시간 상위 노출
                await db.from('applicants').update({ boost_until: boostUntil }).eq('user_id', userId);
            } catch(e) { console.log('referral bonus error:', e.message); }
        }
    }

    setLoading(false);
    btn.disabled = false;
    btn.textContent = origText;

    if (error) { toast('제출 실패: ' + error.message); return; }
    btn.textContent = '제출 완료!';
    toast(existingId
        ? '신청서가 수정되었습니다!'
        : isSuperCode
            ? '신청서가 제출되었습니다! 관리자 승인을 기다려주세요.'
            : '신청서가 제출되었습니다! 추천인과 지인 1명의 평판이 모이면 관리자 심사가 시작됩니다.', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 2200);

    } catch(e) {
        console.error('submitApplication error:', e);
        toast('제출 중 오류가 발생했어요. 다시 시도해주세요.');
    } finally {
        _submitting = false;
        setLoading(false);
        btn.disabled = false;
        if (btn.textContent === '제출 중...') btn.textContent = origText;
    }
}

// (calcHeightScore, calcMatchScore → js/common.js)

// ── 직업명 → 직업군 자동 분류 ──
const JOB_KEYWORDS = {
    '전문직':         ['의사','치과','한의','약사','변호사','판사','검사','회계사','세무사','감정평가','노무사','변리사','관세사','법무사','건축사','파일럿','기장','수의사','간호사'],
    '연구·기술직':     ['연구원','연구','개발자','엔지니어','SW','소프트웨어','프론트','백엔드','풀스택','데이터','AI','DevOps','서버','앱개발','웹개발','IT','프로그래머','CTO'],
    '공공·금융·교육직': ['공무원','공기업','한전','KT','LH','코레일','공단','공사','행정','소방','경찰','군인','장교','부사관','교수','교사','교원','은행','금융','증권','보험'],
    '대기업·중견기업직': ['대기업','중견','삼성','현대','LG','SK','포스코','롯데','기획','마케팅','재무','영업','인사'],
    '사업·전문자유직':  ['대표','CEO','사장','이사','임원','창업','사업','오너','원장','프리랜서','작가','PD','감독','유튜버','크리에이터'],
    '대학생/대학원생': ['학생','대학생','대학원생','취준','취업준비','수험생'],
};
function autoDetectJobCategory(jobText) {
    if (!jobText) return '';
    const t = jobText.trim();
    for (const [category, keywords] of Object.entries(JOB_KEYWORDS)) {
        if (keywords.some(kw => t.includes(kw))) return category;
    }
    return '일반사무·기술직';
}
// (calcMatchScore → js/common.js — 6가중치 개인화 버전으로 통일)
// calcEduScore: 관리자 전용 (상세보기 점수바)
const EDU_SCORES = { '박사':95, '석사':80, '학사':65, '기타':45, '대학원 졸업':95, '대학원':95, '4년제대학교 졸업':65, '4년제 졸업':65, '전문대학교 졸업':55, '전문대':55, '고등학교 졸업':45, '고졸':45, '명문대':90 };
function calcEduScore(education) { return EDU_SCORES[education] || 50; }

// ── 이상형 칩 시스템 ──
// (MBTI_COMPAT, calcMbtiCompat → js/common.js)

// 이상형 키 범위 옵션 (선택자의 성별에 따라 상대의 키 범위)
const HEIGHT_OPTIONS_FOR_FEMALE_TARGET = ['155미만','155~160','160~165','165~170','170이상']; // 선택자가 남자 → 여자 키
const HEIGHT_OPTIONS_FOR_MALE_TARGET   = ['170미만','170~175','175~180','180~185','185이상']; // 선택자가 여자 → 남자 키

function getHeightOptions(myGender) {
    if (myGender === 'male') return HEIGHT_OPTIONS_FOR_FEMALE_TARGET;
    if (myGender === 'female') return HEIGHT_OPTIONS_FOR_MALE_TARGET;
    return []; // 미선택 시 빈 배열
}

const IDEAL_CATEGORIES = [
    { key:'키',     label:'선호하는 키 (복수 선택)',        getOptions:(g) => getHeightOptions(g) },
    { key:'성향',   label:'선호하는 MBTI',                options:['E','I','N','S','F','T','P','J','상관없음'] },
    { key:'지역',   label:'선호하는 지역',                 options:['서울','경기','인천','충청','강원','전라','경상','제주','상관없음'] },
    { key:'흡연',   label:'흡연 여부',                    options:['비흡연자 선호','흡연 OK','전자담배 OK'] },
    { key:'음주',   label:'음주 여부',                    options:['안 마시는 분','가끔 한 잔','자주 즐기는 분','상관없음'] },
    { key:'종교',   label:'선호하는 종교',                 options:['무교','기독교','천주교','불교','상관없음'] },
];

function buildIdealChipsHtml(prefix, idealJson, forcedGender) {
    let selected = {};
    let notes = {};
    if (idealJson) {
        try {
            const d = JSON.parse(idealJson);
            selected = d;
            notes = d.notes || {};
        } catch {}
    }
    const cid = prefix === 'reg' ? 'ideal-chips' : 'edit-ideal-chips';
    // 성별: 명시적 지정 > 현재 선택된 성별 > 기존 프로필의 gender
    const myGender = forcedGender || (prefix === 'reg' ? selectedGender : null);
    // 선호 생년 범위 (기본: 본인 나이 ±5년, 기존 데이터 있으면 그대로)
    const currentYear = new Date().getFullYear();
    const myBirthEl = document.getElementById(prefix === 'reg' ? 'reg-birth' : 'edit-birth');
    const myBirthYear = (myBirthEl && myBirthEl.value) ? new Date(myBirthEl.value).getFullYear() : null;
    const defaultStart = myBirthYear ? myBirthYear - 5 : currentYear - 35;
    const defaultEnd = myBirthYear ? myBirthYear + 5 : currentYear - 20;
    // 하위호환: 기존 나이_연상/연하가 있으면 본인 나이로 환산
    let yearStart = selected['생년_시작'];
    let yearEnd = selected['생년_끝'];
    if (yearStart == null && myBirthYear && selected['나이_연상'] != null) {
        yearStart = myBirthYear - (parseInt(selected['나이_연상']) || 5);
    }
    if (yearEnd == null && myBirthYear && selected['나이_연하'] != null) {
        yearEnd = myBirthYear + (parseInt(selected['나이_연하']) || 5);
    }
    if (yearStart == null) yearStart = defaultStart;
    if (yearEnd == null) yearEnd = defaultEnd;

    const ageHtml = `
        <div class="chip-group">
            <span class="chip-group-label">선호 생년 범위</span>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.88em;">
                <input type="number" id="${prefix}-year-start" value="${yearStart}" min="1950" max="${currentYear-17}" style="width:76px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;font-size:.95em;" oninput="updateScoreBar()">
                <span style="color:#737373;">년생 ~</span>
                <input type="number" id="${prefix}-year-end" value="${yearEnd}" min="1950" max="${currentYear-17}" style="width:76px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;font-size:.95em;" oninput="updateScoreBar()">
                <span style="color:#737373;">년생</span>
            </div>
            <div style="font-size:.72em;color:#9ca3af;margin-top:4px;">상대방의 출생년도 범위를 지정해주세요.</div>
        </div>`;

    return ageHtml + IDEAL_CATEGORIES.map(cat => {
        const opts = cat.getOptions ? cat.getOptions(myGender) : (cat.options || []);
        if (!opts.length) {
            // 키 옵션: 성별이 아직 안 정해졌을 때 안내
            if (cat.key === '키') {
                return `<div class="chip-group">
                    <span class="chip-group-label">${cat.label}</span>
                    <div style="font-size:.78em;color:#9ca3af;padding:8px 0;">← 먼저 위에서 <b>본인 성별</b>을 선택해주세요</div>
                </div>`;
            }
            return '';
        }
        return `<div class="chip-group">
            <span class="chip-group-label">${cat.label}</span>
            <div class="chip-list">
                ${opts.map(opt => {
                    const isOn = selected[cat.key] && Array.isArray(selected[cat.key]) && selected[cat.key].includes(opt);
                    return `<button type="button" class="chip${isOn?' on':''}" data-cat="${cat.key}" data-val="${opt}" onclick="this.classList.toggle('on');updateScoreBar()">${opt}</button>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
}

function getIdealMemo(idealJson) {
    if (!idealJson) return '';
    try { return JSON.parse(idealJson).memo || ''; } catch { return ''; }
}

function collectIdealData(chipsId, memoId) {
    const data = {};
    const notes = {};
    document.querySelectorAll(`#${chipsId} .chip.on`).forEach(c => {
        const cat = c.dataset.cat;
        if (!data[cat]) data[cat] = [];
        data[cat].push(c.dataset.val);
    });
    // 선호 생년 범위 수집 (1950~현재년-17)
    const prefix = chipsId === 'ideal-chips' ? 'reg' : 'edit';
    const yearStartEl = document.getElementById(prefix + '-year-start');
    const yearEndEl = document.getElementById(prefix + '-year-end');
    const currentYear = new Date().getFullYear();
    if (yearStartEl) {
        const v = parseInt(yearStartEl.value);
        if (!isNaN(v)) data['생년_시작'] = Math.max(1950, Math.min(currentYear - 17, v));
    }
    if (yearEndEl) {
        const v = parseInt(yearEndEl.value);
        if (!isNaN(v)) data['생년_끝'] = Math.max(1950, Math.min(currentYear - 17, v));
    }
    // 시작 > 끝이면 swap
    if (data['생년_시작'] != null && data['생년_끝'] != null && data['생년_시작'] > data['생년_끝']) {
        [data['생년_시작'], data['생년_끝']] = [data['생년_끝'], data['생년_시작']];
    }
    const memo = document.getElementById(memoId)?.value.trim();
    if (memo) data.memo = memo;
    return Object.keys(data).length ? JSON.stringify(data) : null;
}

function renderIdealDisplay(idealJson) {
    if (!idealJson) return '';
    let data;
    try { data = JSON.parse(idealJson); } catch { return `<span>${esc(idealJson)}</span>`; }
    const lines = [];
    // 생년 범위 표시
    if (data['생년_시작'] != null || data['생년_끝'] != null) {
        const s = data['생년_시작'] ?? '?';
        const e = data['생년_끝'] ?? '?';
        lines.push(`<div style="margin-bottom:6px;"><span style="font-size:.74em;font-weight:700;color:var(--muted);margin-right:6px;">선호 생년</span><span class="ideal-display-chip">${s} ~ ${e}년생</span></div>`);
    }
    IDEAL_CATEGORIES
        .filter(cat => data[cat.key] && data[cat.key].length)
        .forEach(cat => {
            const chips = (data[cat.key] || []).map(v => `<span class="ideal-display-chip">${esc(v)}</span>`).join('');
            lines.push(`<div style="margin-bottom:6px;"><span style="font-size:.74em;font-weight:700;color:var(--muted);margin-right:6px;">${cat.key}</span>${chips}</div>`);
        });
    if (data.memo) lines.push(`<div style="margin-top:6px;font-size:.82em;color:#6b7280;font-style:italic;padding:8px 10px;background:#f9fafb;border-radius:8px;">"${esc(data.memo)}"</div>`);
    return lines.join('') || '';
}

// ── 관리자: fetch 헬퍼 (Auth 세션 기반) ──
async function adminFetch(table, method='GET', body=null, query='') {
    const url = SUPABASE_URL + '/rest/v1/' + table + query;
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('인증 세션이 없습니다. 다시 로그인해주세요.');
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + session.access_token
    };
    if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        headers['Prefer'] = 'return=minimal';
    }
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    if (method === 'DELETE' || (method === 'PATCH' && res.status === 204)) return null;
    return res.json();
}

// ── 관리자: 푸시 알림 전송 ──
// 일반 유저 세션에서 푸시 발송 (가입/평판 등) - 본인이 로그인 중일 때 쓰임
async function sendPushNotifIfPossible(userId, title, body, url) {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;
        await fetch(SUPABASE_URL + '/functions/v1/send-push', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + session.access_token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId, title, body: body || '', url: url || 'https://kyhwow-rgb.github.io/banjjok/dashboard.html' })
        });
    } catch(e) { console.log('push error:', e.message); }
}

async function sendAdminPush(userId, title, body, url, type) {
    try {
        // 수신자 알림 환경설정 확인
        if (type) {
            const cached = (adminCache || []).find(a => a.user_id === userId);
            const prefs = cached?.notification_prefs;
            if (prefs && prefs[type] === false) return;
        }
        const { data: { session } } = await db.auth.getSession();
        const token = session ? session.access_token : SUPABASE_KEY;
        await fetch(SUPABASE_URL + '/functions/v1/send-push', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId, title, body: body || '', url: url || 'https://kyhwow-rgb.github.io/banjjok/dashboard.html' })
        });
    } catch(e) { console.log('admin push err:', e.message); }
}

// ── 관리자 패널 ──
function renderAdminSkeleton() {
    document.getElementById('filtered-list').innerHTML = Array(4).fill(0).map(() => `
        <div class="skeleton-row skeleton">
            <div class="skeleton-circle skeleton" style="flex-shrink:0;"></div>
            <div style="flex:1;">
                <div class="skeleton skeleton-text w80"></div>
                <div class="skeleton skeleton-text w60"></div>
                <div class="skeleton skeleton-text w40"></div>
            </div>
        </div>`).join('');
}

async function renderAdmin() {
    renderAdminSkeleton();
    let data, error;
    try {
        data = await adminFetch('applicants', 'GET', null, '?select=*&order=created_at.desc');
    } catch(e) { error = e; }
    if (error) {
        console.error('renderAdmin error:', error);
        const isProxyErr = error.message.includes('JSON이 아닌') || error.message.includes('Failed to fetch');
        toast('로드 실패: ' + error.message);
        data = [];
        document.getElementById('filtered-list').innerHTML =
            `<p style="color:#ef4444;text-align:center;padding:24px;"><i class="fa-solid fa-triangle-exclamation"></i> DB 로드 실패<br><span style="font-size:.85em;color:#9ca3af;">네트워크 연결을 확인해주세요.</span></p>`;
    }
    if (data && !Array.isArray(data)) {
        console.error('renderAdmin: unexpected data format', data);
        data = [];
    }

    adminCache = data || [];
    const pending  = adminCache.filter(a => a.status === 'pending');
    const approved = adminCache.filter(a => a.status === 'approved');
    const matched  = adminCache.filter(a => a.status === 'matched');

    // 찜 받은 수 미리 집계 (applicant_id별 카운트)
    try {
        const favs = await adminFetch('favorites', 'GET', null, '?select=applicant_id');
        const counts = {};
        (favs || []).forEach(f => { counts[f.applicant_id] = (counts[f.applicant_id] || 0) + 1; });
        window._adminFavCounts = counts;
    } catch(e) { window._adminFavCounts = {}; }

    document.getElementById('stat-total').textContent   = adminCache.length;
    document.getElementById('stat-pending').textContent = pending.length;
    document.getElementById('stat-male').textContent    = approved.filter(a => a.gender === 'male').length;
    document.getElementById('stat-female').textContent  = approved.filter(a => a.gender === 'female').length;
    document.getElementById('stat-matched').textContent = Math.floor(matched.length / 2);

    // pending 카드 강조 제거 (숫자 색상만 빨간색으로 표시)

    // 첫 로드 시 pending이 있으면 신청자 탭 필터를 pending으로 미리 설정 (탭 전환은 안 함 — 홈 탭 유지)
    if (currentAdminFilter === 'all' && pending.length > 0 && !_adminRendered) {
        _adminRendered = true;
        filterAdmin('pending', { silent: true });
    } else {
        filterAdmin(currentAdminFilter, { silent: true });
    }

    // 매칭 요청 + 상호관심 + 문의 + 위젯 병렬 로드
    renderMatchedCouples(); // sync (uses adminCache)
    await Promise.all([
        loadMatchRequests(),
        loadMutualOverview(),
        loadAdminInquiries(),
        loadAdminTodoWidget(),
        loadAdminHealthMetrics(),
        loadAdminActivityFeed(),
        loadAdminFeedbackWidget(),
    ]);
    renderAiMatchSuggestions(); // depends on _adminMutualPairs from loadMutualOverview
    updateAdminTabBadges();
}

// ── 관리자 탭 전환 ──
function switchAdminTab(name) {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminTab === name));
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'adminPanel-' + name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 탭별 로드 트리거 (이미 renderAdmin에서 로드하지만 안전하게)
    if (name === 'matching') {
        loadMatchRequests(); loadMutualOverview(); renderMatchedCouples();
    }
    if (name === 'network') {
        renderNetworkGraph();
    }
}

function jumpToApplicants(type) {
    switchAdminTab('applicants');
    filterAdmin(type);
}

// 매칭된 커플 리스트 (매칭 탭 전용 섹션)
function renderMatchedCouples() {
    const sec = document.getElementById('matched-couples-section');
    const list = document.getElementById('matched-couples-list');
    const count = document.getElementById('matched-couples-count');
    if (!list) return;
    const seen = new Set();
    const pairs = [];
    for (const a of adminCache.filter(x => x.status === 'matched')) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        if (a.matched_with) seen.add(a.matched_with);
        const partner = adminCache.find(x => x.id === a.matched_with);
        const male   = a.gender === 'male' ? a : partner;
        const female = a.gender === 'female' ? a : partner;
        pairs.push([male, female]);
    }
    count.textContent = pairs.length > 0 ? pairs.length + '쌍' : '';
    list.style.color = '';
    list.style.padding = '';
    list.style.textAlign = '';
    list.innerHTML = pairs.length === 0
        ? '<p style="color:#9ca3af;text-align:center;padding:16px;">매칭된 커플이 없습니다.</p>'
        : pairs.map(([m, f]) => coupleCardHtml(m, f)).join('');
}

// 탭 배지 업데이트
function updateAdminTabBadges() {
    const pending = adminCache.filter(a => a.status === 'pending').length;
    const pendingRep = adminCache.filter(a => a.status === 'pending_reputation').length;
    const mutualBadge = (window._adminMutualPairs || []).length;
    const inquiriesUnread = window._adminUnreadInq || 0;

    const setBadge = (id, n) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.style.display = ''; }
        else el.style.display = 'none';
    };
    setBadge('tab-badge-applicants', pending + pendingRep);
    setBadge('tab-badge-matching', mutualBadge);
    setBadge('tab-badge-inquiries', inquiriesUnread);

    // 신청자 sub-nav 카운트
    const byG = (g) => adminCache.filter(a => a.status === 'approved' && a.gender === g).length;
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    set('sub-cnt-all', adminCache.length);
    set('sub-cnt-pending', pending);
    set('sub-cnt-pending-rep', pendingRep);
    set('sub-cnt-male', byG('male'));
    set('sub-cnt-female', byG('female'));
}

// ── 공지사항 발송 ──
function getBroadcastTargets() {
    const target = document.getElementById('broadcast-target').value;
    return adminCache.filter(a => {
        if (!a.user_id) return false;
        if (target === 'all') return true;
        if (target === 'approved') return a.status === 'approved';
        if (target === 'pending') return a.status === 'pending';
        if (target === 'matched') return a.status === 'matched';
        if (target === 'male') return a.status === 'approved' && a.gender === 'male';
        if (target === 'female') return a.status === 'approved' && a.gender === 'female';
        return false;
    });
}

function previewBroadcast() {
    const targets = getBroadcastTargets();
    const names = targets.slice(0, 10).map(a => a.name).join(', ');
    alert(`총 ${targets.length}명에게 발송됩니다.\n\n예시: ${names}${targets.length > 10 ? ` ...외 ${targets.length - 10}명` : ''}`);
}

let _broadcastSending = false;
async function sendBroadcast() {
    if (_broadcastSending) return;
    const title = document.getElementById('broadcast-title').value.trim();
    const body = document.getElementById('broadcast-body').value.trim();
    const withPush = document.getElementById('broadcast-push').checked;
    if (!title) { toast('제목을 입력해주세요', 'warning'); return; }
    if (!body) { toast('내용을 입력해주세요', 'warning'); return; }
    _broadcastSending = true;

    const targets = getBroadcastTargets();
    if (targets.length === 0) { toast('대상이 없습니다', 'warning'); return; }
    if (!confirm(`총 ${targets.length}명에게 공지를 발송하시겠습니까?`)) return;

    const statusEl = document.getElementById('broadcast-status');
    statusEl.innerHTML = '<span style="color:var(--muted);">발송 중...</span>';
    setLoading(true);

    // 1) notifications 테이블 bulk insert
    const rows = targets.map(t => ({ user_id: t.user_id, type: 'announcement', title, body }));
    try {
        // 50개씩 배치 insert
        const batches = [];
        for (let i = 0; i < rows.length; i += 50) batches.push(rows.slice(i, i + 50));
        let okCount = 0;
        for (const batch of batches) {
            try {
                await adminFetch('notifications', 'POST', batch);
                okCount += batch.length;
            } catch(e) { console.log('notif batch err:', e.message); }
        }
        statusEl.innerHTML = `<span style="color:#059669;">✓ 알림 센터에 ${okCount}건 저장됨</span>`;

        // 2) 푸시 발송 (선택 시)
        if (withPush) {
            statusEl.innerHTML += '<br><span style="color:var(--muted);">푸시 발송 중...</span>';
            let pushOk = 0;
            const URL_HOME = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html';
            for (const t of targets) {
                if (!t.user_id) continue;
                // announcement 환경설정 확인은 edge function이 아니라 여기서 클라이언트 레벨로
                try {
                    const prefs = t.notification_prefs;
                    if (prefs && prefs.announcement === false) continue;
                    await sendAdminPush(t.user_id, '📢 ' + title, body.length > 100 ? body.slice(0, 100) + '...' : body, URL_HOME, 'announcement');
                    pushOk++;
                } catch(e) {}
            }
            statusEl.innerHTML += `<br><span style="color:#059669;">✓ 푸시 ${pushOk}건 발송 완료</span>`;
        }
        toast('공지사항 발송 완료!', 'success');
        setLoading(false);
        _broadcastSending = false;
        document.getElementById('broadcast-title').value = '';
        document.getElementById('broadcast-body').value = '';
    } catch(e) {
        setLoading(false);
        _broadcastSending = false;
        statusEl.innerHTML = '<span style="color:#ef4444;">발송 실패: ' + esc(e.message) + '</span>';
    }
}

// ── AI 매칭 제안 위젯 ──
function renderAiMatchSuggestions() {
    const sec = document.getElementById('ai-match-section');
    const list = document.getElementById('ai-match-list');
    const count = document.getElementById('ai-match-count');
    if (!sec || !list) return;

    const mutuals = window._adminMutualPairs || [];
    if (mutuals.length === 0) { sec.style.display = 'none'; return; }

    // 점수 계산 + 정렬
    const scored = mutuals.map(pair => {
        const [m, f] = pair; // [male, female]
        if (!m || !f) return null;
        const compat = calcPairCompat(m, f);
        return { m, f, compat };
    }).filter(Boolean).sort((a, b) => b.compat.score - a.compat.score);

    const top = scored.slice(0, 5);
    sec.style.display = '';
    count.textContent = `${top.length}쌍`;

    list.innerHTML = top.map((item, idx) => {
        const { m, f, compat } = item;
        const mAge = displayAge(m.birth), fAge = displayAge(f.birth);
        const scoreCls = compat.score >= 80 ? 'match-score-high' : compat.score >= 60 ? 'match-score-mid' : 'match-score-low';
        const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`;
        const warnHtml = compat.warnings.length > 0 ? `<span style="color:#d97706;font-size:.72em;">⚠ ${esc(compat.warnings.join(', '))}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#fafafa;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;flex-wrap:wrap;">
            <div style="font-size:1.1em;font-weight:800;min-width:36px;">${rankIcon}</div>
            <div style="flex:1;min-width:200px;">
                <div style="font-size:.9em;font-weight:700;">
                    <i class="fa-solid fa-mars" style="color:#3b82f6;font-size:.9em;"></i> ${esc(m.name)} (${mAge}세)
                    <span style="color:#ec4899;margin:0 4px;">💘</span>
                    <i class="fa-solid fa-venus" style="color:#ec4899;font-size:.9em;"></i> ${esc(f.name)} (${fAge}세)
                </div>
                <div style="font-size:.72em;color:var(--muted);margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span class="match-score-badge ${scoreCls}">🎯 ${compat.score}점</span>
                    <span>MBTI ${compat.mbti}%</span>
                    ${warnHtml}
                </div>
            </div>
            <button class="btn btn-sm btn-match" onclick="confirmMatch('${m.id}','${f.id}')" style="font-size:.8em;padding:7px 14px;"><i class="fa-solid fa-heart-pulse"></i> 매칭하기</button>
        </div>`;
    }).join('');
}

// ── 오늘 처리할 것 위젯 ──
async function loadAdminTodoWidget() {
    try {
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const pending = adminCache.filter(a => a.status === 'pending');
        const pendingOld = pending.filter(a => now - new Date(a.created_at).getTime() > threeDaysMs);
        const approvedNoLook = adminCache.filter(a => a.status === 'approved' && (a.look_score == null));

        // 매칭 대기 (상호 찜 but not matched) - loadMutualOverview가 세팅
        let mutualCount = 0;
        try {
            const favs = await adminFetch('favorites', 'GET', null, '?select=*');
            const mutuals = new Set();
            const favSet = new Set(favs.map(f => `${f.user_id}:${f.applicant_id}`));
            const userToApp = {};
            adminCache.forEach(a => { if (a.user_id) userToApp[a.user_id] = a.id; });
            for (const f of favs) {
                const myAppId = userToApp[f.user_id];
                if (!myAppId) continue;
                const targetApp = adminCache.find(a => a.id === f.applicant_id);
                if (!targetApp || !targetApp.user_id) continue;
                if (favSet.has(`${targetApp.user_id}:${myAppId}`)) {
                    const pair = [myAppId, f.applicant_id].sort().join(':');
                    mutuals.add(pair);
                }
            }
            // 이미 매칭된 쌍 제외
            for (const pair of Array.from(mutuals)) {
                const [a, b] = pair.split(':');
                const aApp = adminCache.find(x => x.id === a);
                const bApp = adminCache.find(x => x.id === b);
                if (aApp?.status === 'matched' || bApp?.status === 'matched') mutuals.delete(pair);
            }
            mutualCount = mutuals.size;
            window._adminMutualKeys = Array.from(mutuals);
        } catch(e) {}

        // 연락처 공개 대기
        const matched = adminCache.filter(a => a.status === 'matched' && a.contact_released !== true);
        const contactWaitPairs = Math.floor(matched.length / 2);

        // 미답변 문의
        let unreadInquiries = 0;
        try {
            const inq = await adminFetch('inquiries', 'GET', null, '?reply=is.null&select=id');
            unreadInquiries = (inq || []).length;
        } catch(e) {}

        // 신고 (처리 안된 것)
        let unhandledReports = 0;
        try {
            const reports = await adminFetch('reports', 'GET', null, '?select=id&order=created_at.desc');
            unhandledReports = (reports || []).length;
        } catch(e) {}

        const items = [];
        const pendingRep = adminCache.filter(a => a.status === 'pending_reputation');
        if (pending.length > 0) items.push({
            icon: 'fa-user-clock', text: `관리자 승인 대기 ${pending.length}건`,
            sub: pendingOld.length > 0 ? `${pendingOld.length}건은 3일 이상 경과 ⚠️` : '평판 2개 통과 · 승인 검토 필요',
            count: pending.length, action: "filterAdmin('pending')"
        });
        if (pendingRep.length > 0) items.push({
            icon: 'fa-handshake', text: `평판 수집 중 ${pendingRep.length}명`,
            sub: '추천인+지인 평판 모여야 승인 심사 시작 (관리자 액션 불필요)',
            count: pendingRep.length, action: "filterAdmin('pending_reputation')"
        });
        if (mutualCount > 0) items.push({
            icon: 'fa-heart-circle-bolt', text: `매칭 대기 상호찜 ${mutualCount}쌍`,
            sub: '매칭 승인 필요', count: mutualCount,
            action: "filterAdmin('mutual')"
        });
        if (contactWaitPairs > 0) items.push({
            icon: 'fa-paper-plane', text: `연락처 공개 대기 ${contactWaitPairs}쌍`,
            sub: '카카오 ID 전달 필요', count: contactWaitPairs,
            action: "filterAdmin('matched')"
        });
        if (unreadInquiries > 0) items.push({
            icon: 'fa-envelope', text: `미답변 문의 ${unreadInquiries}건`,
            sub: null, count: unreadInquiries,
            action: "filterInquiries('unread')"
        });
        if (unhandledReports > 0) items.push({
            icon: 'fa-triangle-exclamation', text: `신고 ${unhandledReports}건`,
            sub: '검토 필요', count: unhandledReports,
            action: "showReportsModal()"
        });
        if (approvedNoLook.length > 0) items.push({
            icon: 'fa-star', text: `외모 평가 안된 승인자 ${approvedNoLook.length}명`,
            sub: '매칭 점수 품질에 영향', count: approvedNoLook.length,
            action: "applyQuickFilter('no-look')"
        });

        const widget = document.getElementById('todo-widget');
        const list = document.getElementById('todo-list');
        if (items.length === 0) {
            widget.style.display = '';
            document.getElementById('todo-total-count').textContent = '(없음)';
            list.innerHTML = `<div class="todo-empty">✨ 모든 할 일이 처리되었어요!</div>`;
        } else {
            widget.style.display = '';
            const total = items.reduce((s, i) => s + i.count, 0);
            document.getElementById('todo-total-count').textContent = `(${total}건)`;
            list.innerHTML = items.map(item => `
                <div class="todo-item" onclick="${item.action}">
                    <div class="todo-item-left">
                        <div class="todo-icon"><i class="fa-solid ${item.icon}"></i></div>
                        <div>
                            <div class="todo-text">${esc(item.text)}</div>
                            ${item.sub ? `<div class="todo-sub">${esc(item.sub)}</div>` : ''}
                        </div>
                    </div>
                    <div class="todo-count">${item.count}</div>
                </div>
            `).join('');
        }
    } catch(e) { console.log('todo widget error:', e.message); }
}

// ── 건강 지표 ──
async function loadAdminHealthMetrics() {
    try {
        // DAU (오늘 dashboard_open 유니크 user_id)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const yestStart = new Date(todayStart.getTime() - 24*60*60*1000);
        const weekStart = new Date(todayStart.getTime() - 7*24*60*60*1000);

        const dauLogs = await adminFetch('event_logs', 'GET', null,
            `?event_type=eq.dashboard_open&created_at=gte.${todayStart.toISOString()}&select=user_id`);
        const yestLogs = await adminFetch('event_logs', 'GET', null,
            `?event_type=eq.dashboard_open&created_at=gte.${yestStart.toISOString()}&created_at=lt.${todayStart.toISOString()}&select=user_id`);
        const dauSet = new Set((dauLogs || []).map(l => l.user_id).filter(Boolean));
        const yestSet = new Set((yestLogs || []).map(l => l.user_id).filter(Boolean));
        document.getElementById('health-dau').textContent = dauSet.size;
        const dauDelta = dauSet.size - yestSet.size;
        const dauEl = document.getElementById('health-dau-delta');
        if (dauDelta > 0) { dauEl.textContent = `↑ 어제 대비 +${dauDelta}`; dauEl.className = 'health-delta up'; }
        else if (dauDelta < 0) { dauEl.textContent = `↓ 어제 대비 ${dauDelta}`; dauEl.className = 'health-delta down'; }
        else { dauEl.textContent = `어제와 동일`; dauEl.className = 'health-delta'; }

        // 7일 신규 가입 + 차트
        const buckets = Array(7).fill(0);
        const now = Date.now();
        adminCache.forEach(a => {
            const daysAgo = Math.floor((now - new Date(a.created_at).getTime()) / (24*60*60*1000));
            if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo]++;
        });
        const totalSignups = buckets.reduce((s, v) => s + v, 0);
        document.getElementById('health-signups').textContent = totalSignups;
        const maxBar = Math.max(...buckets, 1);
        document.getElementById('health-signup-chart').innerHTML = buckets.map(v =>
            `<div class="health-bar ${v>0?'active':''}" style="height:${Math.max(2, (v/maxBar)*100)}%;" title="${v}명"></div>`
        ).join('');

        // 오늘 메시지
        const todayMsgs = await adminFetch('chat_messages', 'GET', null,
            `?created_at=gte.${todayStart.toISOString()}&select=id`);
        const yestMsgs = await adminFetch('chat_messages', 'GET', null,
            `?created_at=gte.${yestStart.toISOString()}&created_at=lt.${todayStart.toISOString()}&select=id`);
        document.getElementById('health-messages').textContent = (todayMsgs || []).length;
        const msgDelta = (todayMsgs || []).length - (yestMsgs || []).length;
        const msgEl = document.getElementById('health-messages-delta');
        if (msgDelta > 0) { msgEl.textContent = `↑ 어제 대비 +${msgDelta}`; msgEl.className = 'health-delta up'; }
        else if (msgDelta < 0) { msgEl.textContent = `↓ 어제 대비 ${msgDelta}`; msgEl.className = 'health-delta down'; }
        else { msgEl.textContent = `어제와 동일`; msgEl.className = 'health-delta'; }

        // 성비 (승인/매칭 기준)
        const activeUsers = adminCache.filter(a => a.status === 'approved' || a.status === 'matched');
        const mCount = activeUsers.filter(a => a.gender === 'male').length;
        const fCount = activeUsers.filter(a => a.gender === 'female').length;
        const total = mCount + fCount;
        document.getElementById('health-ratio').textContent = `${mCount} : ${fCount}`;
        if (total > 0) {
            const mPct = (mCount / total) * 100;
            document.getElementById('ratio-male-bar').style.width = mPct + '%';
            document.getElementById('ratio-female-bar').style.width = (100 - mPct) + '%';
        }
        const warnEl = document.getElementById('health-ratio-warn');
        if (total === 0) {
            warnEl.textContent = '';
        } else if (mCount === 0 || fCount === 0) {
            warnEl.textContent = '⚠️ 한쪽 성별이 0명';
            warnEl.className = 'health-delta health-warn';
        } else {
            const ratio = Math.max(mCount, fCount) / Math.min(mCount, fCount);
            if (ratio >= 2) {
                const lackSide = mCount < fCount ? '남성' : '여성';
                warnEl.textContent = `⚠️ ${lackSide} 부족 (${ratio.toFixed(1)}:1)`;
                warnEl.className = 'health-delta health-warn';
            } else {
                warnEl.textContent = `균형 양호 (${ratio.toFixed(1)}:1)`;
                warnEl.className = 'health-delta';
            }
        }
    } catch(e) { console.log('health metrics error:', e.message); }
}

// ── 실시간 활동 피드 ──
async function loadAdminActivityFeed() {
    const feed = document.getElementById('activity-feed');
    try {
        const events = await adminFetch('event_logs', 'GET', null,
            '?order=created_at.desc&limit=25&select=*');
        const msgs = await adminFetch('chat_messages', 'GET', null,
            '?order=created_at.desc&limit=10&select=id,sender_id,receiver_id,created_at');

        // applicants의 created_at도 "신규 가입" 이벤트로 취급
        const allItems = [];
        (events || []).forEach(e => allItems.push({ type: 'event', data: e, ts: new Date(e.created_at).getTime() }));
        (msgs || []).forEach(m => allItems.push({ type: 'msg', data: m, ts: new Date(m.created_at).getTime() }));
        adminCache.slice(0, 20).forEach(a => allItems.push({ type: 'signup', data: a, ts: new Date(a.created_at).getTime() }));
        allItems.sort((a, b) => b.ts - a.ts);
        const top = allItems.slice(0, 20);

        if (top.length === 0) {
            feed.innerHTML = '<div style="color:var(--muted);font-size:.82em;padding:12px;text-align:center;">아직 활동이 없어요</div>';
            return;
        }

        const appByUserId = {};
        adminCache.forEach(a => { if (a.user_id) appByUserId[a.user_id] = a; });
        const nameOf = (uid) => appByUserId[uid]?.name || '유저';

        feed.innerHTML = top.map(item => {
            const d = new Date(item.ts);
            const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
            let icon = '', text = '';
            if (item.type === 'signup') {
                const a = item.data;
                icon = '<i class="fa-solid fa-user-plus" style="color:#059669;"></i>';
                text = `<b>${esc(a.name)}</b> 가입 (${a.gender==='male'?'男':'女'}${calcAge(a.birth)?', '+calcAge(a.birth)+'세':''})`;
            } else if (item.type === 'msg') {
                icon = '<i class="fa-solid fa-comment" style="color:#3b82f6;"></i>';
                text = `<b>${esc(nameOf(item.data.sender_id))}</b> → <b>${esc(nameOf(item.data.receiver_id))}</b> 메시지`;
            } else {
                const e = item.data;
                const who = nameOf(e.user_id);
                const meta = e.metadata || {};
                switch(e.event_type) {
                    case 'card_like':
                        const likedName = adminCache.find(a => a.id === meta.liked)?.name;
                        icon = '<i class="fa-solid fa-heart" style="color:#ec4899;"></i>';
                        text = `<b>${esc(who)}</b>${likedName ? ` → <b>${esc(likedName)}</b>` : ''} 찜`;
                        break;
                    case 'chat_send':
                        icon = '<i class="fa-solid fa-paper-plane" style="color:#3b82f6;"></i>';
                        text = `<b>${esc(who)}</b> 메시지 전송`;
                        break;
                    case 'block':
                        icon = '<i class="fa-solid fa-ban" style="color:#ef4444;"></i>';
                        text = `<b>${esc(who)}</b> 차단 실행`;
                        break;
                    case 'report':
                        icon = '<i class="fa-solid fa-flag" style="color:#dc2626;"></i>';
                        text = `<b>${esc(who)}</b> 신고 (${esc(meta.reason || '')})`;
                        break;
                    case 'exit_feedback':
                        icon = '<i class="fa-solid fa-door-open" style="color:#6b7280;"></i>';
                        text = `<b>${esc(who)}</b> 이탈 피드백: ${esc(meta.reason || '(사유 없음)')}`;
                        break;
                    case 'suggestion':
                        icon = '<i class="fa-regular fa-lightbulb" style="color:#f59e0b;"></i>';
                        text = `<b>${esc(who)}</b> 건의: ${esc((meta.text||'').slice(0, 40))}${(meta.text||'').length > 40 ? '...' : ''}`;
                        break;
                    case 'dashboard_open':
                        return '';
                    default:
                        icon = '<i class="fa-solid fa-circle-dot" style="color:#9ca3af;"></i>';
                        text = `<b>${esc(who)}</b> ${esc(e.event_type)}`;
                }
            }
            if (!text) return '';
            return `<div class="activity-item">
                <span class="activity-time">${time}</span>
                <span class="activity-icon">${icon}</span>
                <span class="activity-text">${text}</span>
            </div>`;
        }).filter(Boolean).join('') || '<div style="color:var(--muted);font-size:.82em;padding:12px;text-align:center;">활동 없음</div>';
    } catch(e) { feed.innerHTML = '<div style="color:#ef4444;font-size:.82em;padding:12px;">활동 로드 실패</div>'; }
}

// ── 피드백/건의 집계 ──
async function loadAdminFeedbackWidget() {
    const widget = document.getElementById('feedback-widget');
    try {
        const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
        const events = await adminFetch('event_logs', 'GET', null,
            `?event_type=in.(exit_feedback,suggestion)&created_at=gte.${weekAgo}&select=*&order=created_at.desc`);
        const exits = (events || []).filter(e => e.event_type === 'exit_feedback');
        const suggestions = (events || []).filter(e => e.event_type === 'suggestion');
        const reasonCounts = {};
        exits.forEach(e => {
            const r = e.metadata?.reason || '(사유 없음)';
            reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        });
        const topReasons = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1]).slice(0, 4);

        widget.innerHTML = `
            <div class="feedback-card">
                <div class="feedback-card-title"><i class="fa-solid fa-door-open" style="color:#dc2626;"></i> 이탈 사유 TOP (${exits.length}건)</div>
                ${topReasons.length === 0 ? '<div style="color:var(--muted);font-size:.78em;">아직 없음</div>' :
                  topReasons.map(([r, c]) => `<div class="feedback-row"><span>${esc(r)}</span><span class="cnt">${c}</span></div>`).join('')}
            </div>
            <div class="feedback-card">
                <div class="feedback-card-title"><i class="fa-regular fa-lightbulb" style="color:#f59e0b;"></i> 건의 최근 (${suggestions.length}건)</div>
                ${suggestions.length === 0 ? '<div style="color:var(--muted);font-size:.78em;">아직 없음</div>' :
                  suggestions.slice(0, 4).map(s => {
                    const t = s.metadata?.text || '';
                    return `<div class="feedback-row" style="align-items:flex-start;"><span style="flex:1;font-size:.76em;line-height:1.4;">${esc(t.slice(0, 60))}${t.length > 60 ? '...' : ''}</span></div>`;
                  }).join('')}
            </div>
        `;
    } catch(e) {
        widget.innerHTML = '<div style="color:#ef4444;font-size:.82em;padding:12px;grid-column:1/-1;">피드백 로드 실패</div>';
    }
}

// ── 신고 모달 ──
async function showReportsModal() {
    const overlay = document.getElementById('reports-viewer-overlay');
    const body = document.getElementById('reports-viewer-body');
    overlay.style.display = 'flex';
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">불러오는 중...</div>';
    try {
        const reports = await adminFetch('reports', 'GET', null, '?select=*&order=created_at.desc');
        if (!reports || reports.length === 0) {
            body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);"><i class="fa-solid fa-circle-check" style="font-size:2em;color:#10b981;display:block;margin-bottom:8px;"></i>접수된 신고가 없어요</div>';
            return;
        }
        body.innerHTML = reports.map(r => {
            const reporter = adminCache.find(a => a.user_id === r.reporter_id);
            const reported = adminCache.find(a => a.id === r.reported_applicant_id);
            const d = new Date(r.created_at);
            return `<div style="padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;font-size:.88em;font-weight:700;margin-bottom:6px;">
                    <i class="fa-solid fa-flag" style="color:#dc2626;"></i>
                    <span>${esc(r.reason || '사유 없음')}</span>
                </div>
                <div style="font-size:.82em;color:#374151;margin-bottom:4px;">
                    <b>${esc(reporter?.name || '(알 수 없음)')}</b> → <b>${esc(reported?.name || '(알 수 없음)')}</b>
                </div>
                <div style="font-size:.72em;color:#9ca3af;">${d.toLocaleString('ko-KR')}</div>
                <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                    ${reported ? `<button class="btn btn-sm btn-outline" onclick="closeReportsModal();openAdminDetail('${reported.id}');" style="font-size:.75em;padding:5px 10px;">대상 상세보기</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="resolveReport(${r.id}, this)" style="font-size:.75em;padding:5px 10px;color:#059669;border-color:#10b981;">처리 완료 (삭제)</button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        body.innerHTML = `<div style="padding:20px;color:#ef4444;text-align:center;">신고 로드 실패: ${esc(e.message)}</div>`;
    }
}

function closeReportsModal() {
    const overlay = document.getElementById('reports-viewer-overlay');
    if (overlay) overlay.style.display = 'none';
}

async function resolveReport(id, btn) {
    if (!confirm('이 신고를 처리 완료로 표시하시겠어요? (삭제됩니다)')) return;
    try {
        await adminFetch('reports', 'DELETE', null, `?id=eq.${id}`);
        btn.closest('div[style*="background:#fef2f2"]').remove();
        toast('신고가 처리되었어요', 'success');
        // 위젯 재로드
        loadAdminTodoWidget();
    } catch(e) { toast('처리 실패: ' + e.message, 'error'); }
}

async function loadMatchRequests() {
    try {
        const requests = await adminFetch('match_requests', 'GET', null, '?status=eq.pending&select=*&order=created_at.desc');
        const sec = document.getElementById('match-requests-section');
        const list = document.getElementById('match-requests-list');
        if (!requests || requests.length === 0) { sec.style.display = 'none'; return; }
        sec.style.display = '';
        document.getElementById('match-req-count').textContent = requests.length + '건';
        list.innerHTML = requests.map(r => {
            const from = adminCache.find(a => a.id === r.from_applicant);
            const to   = adminCache.find(a => a.id === r.to_applicant);
            if (!from || !to) return '';
            const fIcon = from.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);"></i>';
            const tIcon = to.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);"></i>';
            const alreadyMatched = from.status === 'matched' || to.status === 'matched';
            const warning = alreadyMatched ? `<div style="font-size:.72em;color:#ef4444;margin-top:4px;">⚠️ ${from.status==='matched'?esc(from.name):esc(to.name)}님은 이미 매칭됨</div>` : '';
            return `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:${alreadyMatched?'#fef2f2':'#faf5ff'};border-radius:12px;margin-bottom:8px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;flex-wrap:wrap;">
                    <span>${fIcon}</span>
                    <span style="font-weight:700;font-size:.9em;">${esc(from.name)}</span>
                    <span style="color:#ec4899;font-size:1.1em;">💘</span>
                    <span>${tIcon}</span>
                    <span style="font-weight:700;font-size:.9em;">${esc(to.name)}</span>
                    ${warning}
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    ${alreadyMatched ? '' : `<button class="btn btn-sm btn-match" onclick="approveMatchRequest('${r.id}','${from.id}','${to.id}')">매칭 승인</button>`}
                    <button class="btn btn-sm btn-delete" onclick="rejectMatchRequest('${r.id}')">거절</button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        console.log('loadMatchRequests error:', e.message);
    }
}

async function approveMatchRequest(reqId, fromId, toId) {
    const fromUser = adminCache.find(x => x.id === fromId);
    const toUser = adminCache.find(x => x.id === toId);
    if (fromUser?.status === 'matched' || toUser?.status === 'matched') {
        toast('이미 매칭된 사용자가 포함되어 있습니다.', 'warning'); return;
    }
    if (!confirm('이 매칭 요청을 승인하시겠습니까?')) return;
    setLoading(true);
    try {
        await adminFetch('applicants', 'PATCH', { status: 'matched', matched_with: toId }, '?id=eq.' + fromId);
        await adminFetch('applicants', 'PATCH', { status: 'matched', matched_with: fromId }, '?id=eq.' + toId);
        // 이 요청 승인
        await adminFetch('match_requests', 'PATCH', { status: 'approved' }, '?id=eq.' + reqId);
        // 이 둘과 관련된 다른 pending 요청들 자동 거절
        await adminFetch('match_requests', 'PATCH', { status: 'rejected' },
            '?status=eq.pending&or=(from_applicant.eq.' + fromId + ',to_applicant.eq.' + fromId + ',from_applicant.eq.' + toId + ',to_applicant.eq.' + toId + ')');
        // 양쪽에 매칭 알림 + 푸시
        const MATCH_URL = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-my';
        try {
            const notifRows = [];
            if (fromUser?.user_id) notifRows.push({ user_id: fromUser.user_id, type: 'matched', title: '매칭 성사!', body: `${toUser?.name || '반쪽'}님과 매칭되었어요! 대화를 시작해보세요.` });
            if (toUser?.user_id) notifRows.push({ user_id: toUser.user_id, type: 'matched', title: '매칭 성사!', body: `${fromUser?.name || '반쪽'}님과 매칭되었어요! 대화를 시작해보세요.` });
            if (notifRows.length) await adminFetch('notifications', 'POST', notifRows);
        } catch(e) {}
        if (fromUser?.user_id) sendAdminPush(fromUser.user_id, '매칭 성사!', `${toUser?.name || '반쪽'}님과 매칭되었어요. 대화를 시작해보세요!`, MATCH_URL, 'matched');
        if (toUser?.user_id) sendAdminPush(toUser.user_id, '매칭 성사!', `${fromUser?.name || '반쪽'}님과 매칭되었어요. 대화를 시작해보세요!`, MATCH_URL, 'matched');
    } catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('매칭이 승인되었습니다!', 'success');
    await renderAdmin();
}

async function rejectMatchRequest(reqId) {
    try {
        await adminFetch('match_requests', 'PATCH', { status: 'rejected' }, '?id=eq.' + reqId);
        toast('매칭 요청이 거절되었습니다.');
        loadMatchRequests();
    } catch(e) { toast('오류: ' + e.message); }
}

// ── 상호 관심 현황 (관리자용) ──
// (MBTI_COMPAT_ADMIN → common.js의 MBTI_COMPAT 사용)

// 두 사람 궁합 집계 (관리자용 빠른 의사결정)
function calcPairCompat(a, b) {
    const warnings = [];
    const aAge = calcAge(a.birth) || 0;
    const bAge = calcAge(b.birth) || 0;
    const ageDiff = Math.abs(aAge - bAge);
    if (ageDiff > 8) warnings.push(`나이차 ${ageDiff}세`);
    const aH = parseInt(a.height) || 0, bH = parseInt(b.height) || 0;
    if (aH && bH) {
        const male = a.gender === 'male' ? a : b;
        const female = a.gender === 'female' ? a : b;
        const diff = (parseInt(male.height) || 0) - (parseInt(female.height) || 0);
        if (diff < 5) warnings.push('키 차이 작음');
    }
    if (a.location && b.location && a.location !== b.location) warnings.push('지역 다름');

    // 점수: MBTI(30%) + 외모평균(20%) + 나이적합(20%) + 지역(15%) + 직업평균(15%)
    const mbtiS = calcMbtiCompat(a.mbti, b.mbti);
    const lookS = ((a.look_score || 50) + (b.look_score || 50)) / 2;
    const ageS = ageDiff <= 3 ? 95 : ageDiff <= 5 ? 80 : ageDiff <= 8 ? 60 : 30;
    const locS = (a.location && b.location && a.location === b.location) ? 90 : 60;
    const jobS = (calcJobScore(a.job_category) + calcJobScore(b.job_category)) / 2;
    const score = Math.round(mbtiS * 0.3 + lookS * 0.2 + ageS * 0.2 + locS * 0.15 + jobS * 0.15);
    return { score, mbti: mbtiS, warnings };
}

async function loadMutualOverview() {
    const sec = document.getElementById('mutual-overview-section');
    const list = document.getElementById('mutual-overview-list');
    try {
        const favs = await adminFetch('favorites', 'GET', null, '?select=user_id,applicant_id');
        if (!favs || favs.length === 0) { sec.style.display = 'none'; return; }

        // 상호 찜 쌍 찾기
        const favMap = new Map();
        favs.forEach(f => {
            const key = f.user_id + '→' + f.applicant_id;
            favMap.set(key, true);
        });

        const pairs = [];
        const seen = new Set();
        for (const f of favs) {
            // f.user_id가 찜한 f.applicant_id의 user_id 찾기
            const target = adminCache.find(a => a.id === f.applicant_id);
            if (!target || !target.user_id) continue;
            // 역방향 찜 확인: target.user_id가 f.user_id의 applicant_id를 찜했는지
            const myApp = adminCache.find(a => a.user_id === f.user_id);
            if (!myApp) continue;
            const reverseKey = target.user_id + '→' + myApp.id;
            if (favMap.has(reverseKey)) {
                const pairKey = [myApp.id, target.id].sort().join('-');
                if (!seen.has(pairKey) && myApp.status === 'approved' && target.status === 'approved') {
                    seen.add(pairKey);
                    const male = myApp.gender === 'male' ? myApp : target;
                    const female = myApp.gender === 'female' ? myApp : target;
                    pairs.push([male, female]);
                }
            }
        }

        document.getElementById('stat-mutual').textContent = pairs.length;
        // pairs는 _adminMutualPairs에서 관리 (탭 배지 + AI 매칭)
        window._adminMutualPairs = pairs; // AI 매칭 제안용 [male, female] 객체 쌍
        if (typeof updateAdminTabBadges === 'function') updateAdminTabBadges();
        if (pairs.length === 0) { sec.style.display = 'none'; return; }
        sec.style.display = '';
        document.getElementById('mutual-overview-count').textContent = pairs.length + '쌍';
        function mutualProfileCard(p, age) {
            var photo = p.photos && p.photos[0] ? '<img loading="lazy" src="'+p.photos[0]+'" style="width:52px;height:52px;border-radius:8px;object-fit:cover;">' : '<div style="width:52px;height:52px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:var(--muted);">?</div>';
            return '<div style="flex:1;min-width:140px;padding:12px;background:#fff;border:1px solid var(--border);border-radius:10px;">' +
                '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">' + photo +
                '<div><div style="font-weight:700;font-size:.88em;">' + esc(p.name) + '</div>' +
                '<div style="font-size:.74em;color:var(--muted);">' + age + '세 · ' + esc(p.job||'') + '</div></div></div>' +
                '<div style="font-size:.78em;color:#374151;line-height:1.6;">' +
                (p.height ? p.height + 'cm · ' : '') + (p.location ? esc(p.location) + ' · ' : '') + (p.mbti||'') +
                (p.education ? ' · ' + esc(p.education) : '') + '</div>' +
                (p.kakao ? '<div style="margin-top:6px;font-size:.74em;color:var(--muted);">카카오: <b>' + esc(p.kakao) + '</b></div>' : '') +
                (p.intro ? '<div style="margin-top:6px;font-size:.76em;color:#6b7280;font-style:italic;">"' + esc(p.intro) + '"</div>' : '') +
            '</div>';
        }
        list.innerHTML = pairs.map(function(pair, idx) {
            var m = pair[0], f = pair[1];
            var mAge = displayAge(m.birth);
            var fAge = displayAge(f.birth);
            var compat = calcPairCompat(m, f);
            var scoreCls = compat.score >= 80 ? 'match-score-high' : compat.score >= 60 ? 'match-score-mid' : 'match-score-low';
            var warnText = compat.warnings.length > 0 ? ' · <span style="color:#d97706;">⚠ ' + esc(compat.warnings.join(', ')) + '</span>' : '';
            return '<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;">' +
                '<div data-toggle="mutual-detail-' + idx + '" style="display:flex;align-items:center;gap:10px;padding:12px;background:#f9fafb;cursor:pointer;flex-wrap:wrap;">' +
                    '<span style="font-weight:700;font-size:.9em;">' + esc(m.name) + '</span>' +
                    '<span style="font-size:.75em;color:var(--muted);">' + mAge + '세</span>' +
                    '<span style="color:#a3a3a3;">↔</span>' +
                    '<span style="font-weight:700;font-size:.9em;">' + esc(f.name) + '</span>' +
                    '<span style="font-size:.75em;color:var(--muted);">' + fAge + '세</span>' +
                    '<span class="match-score-badge ' + scoreCls + '">🎯 ' + compat.score + '점</span>' +
                    '<span style="font-size:.72em;color:var(--muted);">MBTI ' + compat.mbti + '%' + warnText + '</span>' +
                    '<span style="margin-left:auto;font-size:.75em;color:var(--muted);">▾</span>' +
                '</div>' +
                '<div id="mutual-detail-' + idx + '" style="display:none;padding:12px;">' +
                    '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
                        mutualProfileCard(m, mAge) +
                        mutualProfileCard(f, fAge) +
                    '</div>' +
                    '<button class="btn btn-sm" style="background:var(--cta);color:white;width:100%;" data-match="' + m.id + ',' + f.id + '">매칭 승인</button>' +
                '</div>' +
            '</div>';
        }).join('');
        // 이벤트 위임 (한 번만 등록)
        if (!list._mutualListenerAdded) {
            list._mutualListenerAdded = true;
            list.addEventListener('click', function(e) {
                var toggle = e.target.closest('[data-toggle]');
                if (toggle) {
                    var detail = document.getElementById(toggle.dataset.toggle);
                    if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
                }
                var matchBtn = e.target.closest('[data-match]');
                if (matchBtn) {
                    var ids = matchBtn.dataset.match.split(',');
                    confirmMatch(ids[0], ids[1]);
                }
            });
        }
    } catch(e) {
        console.log('loadMutualOverview error:', e.message);
        sec.style.display = 'none';
    }
}

let _searchTimer = null;
function filterAdminSearch() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(_doAdminSearch, 300);
}
function _doAdminSearch() {
    const q = (document.getElementById('admin-search').value || '').trim().toLowerCase();
    if (!q) { filterAdmin(currentAdminFilter); return; }
    const filtered = adminCache.filter(a =>
        (a.name || '').toLowerCase().includes(q)
        || (a.job || '').toLowerCase().includes(q)
        || (a.job_category || '').toLowerCase().includes(q)
        || (a.kakao || '').toLowerCase().includes(q)
        || (a.location || '').toLowerCase().includes(q)
        || (a.mbti || '').toLowerCase().includes(q)
        || (a.education || '').toLowerCase().includes(q)
    );
    document.getElementById('filter-title').innerHTML = `<i class="fa-solid fa-magnifying-glass" style="color:var(--primary);"></i> "${esc(q)}" 검색 결과`;
    document.getElementById('filtered-list').innerHTML = filtered.length === 0
        ? '<p style="color:#9ca3af;text-align:center;padding:16px;">검색 결과가 없습니다.</p>'
        : filtered.map((a, i) => applicantRowHtml(a, i)).join('');
    const batchEl = document.getElementById('batch-actions');
    if (batchEl) batchEl.style.display = 'none';
}

function filterAdmin(type, opts) {
    opts = opts || {};
    // 상호관심/매칭 타입은 매칭 탭으로 리다이렉트
    if (type === 'mutual' || type === 'matched') {
        if (!opts.silent) {
            switchAdminTab('matching');
            setTimeout(() => {
                const targetId = type === 'mutual' ? 'mutual-overview-section' : 'matched-couples-section';
                document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
        return;
    }

    currentAdminFilter = type;
    const searchEl = document.getElementById('admin-search');
    if (searchEl) searchEl.value = '';

    // 사용자 조작 시에만 신청자 탭 자동 전환
    if (!opts.silent) {
        const applicantsPanel = document.getElementById('adminPanel-applicants');
        if (applicantsPanel && !applicantsPanel.classList.contains('active')) {
            switchAdminTab('applicants');
        }
    }

    const titles = { all:'전체 신청', pending_reputation:'평판 대기', pending:'관리자 승인 대기', male:'승인된 남성', female:'승인된 여성' };
    const empty  = { all:'지원자가 없습니다.', pending_reputation:'평판 대기 중인 사람이 없어요.', pending:'승인 대기가 없습니다.', male:'승인된 남성이 없습니다.', female:'승인된 여성이 없습니다.' };

    // 신청자 탭 sub-nav 활성화
    document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === type));

    // 홈 탭 stat card 활성화 표시
    ['card-total','card-pending','card-male','card-female','card-mutual','card-matched'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.remove('active');
    });
    const cardIdMap = { all:'card-total', pending:'card-pending', male:'card-male', female:'card-female' };
    const activeCard = document.getElementById(cardIdMap[type]);
    if (activeCard) activeCard.classList.add('active');

    document.getElementById('filter-title').innerHTML = titles[type] || '전체';

    const filtered = adminCache.filter(a => {
        if (type === 'all')     return true;
        if (type === 'pending_reputation') return a.status === 'pending_reputation';
        if (type === 'pending') return a.status === 'pending';
        if (type === 'male')    return a.status === 'approved' && a.gender === 'male';
        if (type === 'female')  return a.status === 'approved' && a.gender === 'female';
        return true;
    });

    document.getElementById('filtered-list').innerHTML = filtered.length === 0
        ? `<p style="color:#9ca3af;text-align:center;padding:16px;">${empty[type] || '데이터가 없습니다.'}</p>`
        : filtered.map((a, i) => applicantRowHtml(a, i)).join('');

    // pending 필터 시 일괄 승인 버튼 표시
    const batchEl = document.getElementById('batch-actions');
    if (batchEl) batchEl.style.display = (type === 'pending' && filtered.length > 0) ? '' : 'none';

    localStorage.setItem('kj_filter', type);
}

// 프로필 완성도 계산
function calcProfileCompletion(a) {
    const fields = ['name','birth','gender','job','job_category','kakao','height','location','mbti','intro','education','hobby'];
    let filled = 0;
    fields.forEach(f => { if (a[f]) filled++; });
    if (a.photos && a.photos.length > 0) filled += 2;
    if (a.ideal) filled += 1;
    if (a.icebreaker) filled += 1;
    const max = fields.length + 4;
    return Math.round((filled / max) * 100);
}

// 경과 시간 문자열
function relTime(iso) {
    if (!iso) return '한번도 접속 안함';
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return '방금';
    if (min < 60) return min + '분 전';
    const h = Math.floor(min / 60);
    if (h < 24) return h + '시간 전';
    const d = Math.floor(h / 24);
    if (d < 30) return d + '일 전';
    const mo = Math.floor(d / 30);
    return mo + '개월 전';
}

function applicantRowHtml(a, idx=0) {
    const age   = displayAge(a.birth);
    const icon  = a.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);font-size:22px;"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);font-size:22px;"></i>';
    const gBadge = a.gender === 'male' ? '<span class="badge badge-male"><i class="fa-solid fa-mars"></i> 남성</span>' : '<span class="badge badge-female"><i class="fa-solid fa-venus"></i> 여성</span>';
    const sBadge = {
        pending_reputation:'<span class="badge" style="background:#fef3c7;color:#b45309;"><i class="fa-solid fa-handshake"></i> 평판</span>',
        pending:'<span class="badge badge-pending"><i class="fa-solid fa-clock"></i> 승인대기</span>',
        approved:'<span class="badge badge-approved"><i class="fa-solid fa-check"></i> 승인</span>',
        rejected:'<span class="badge badge-rejected"><i class="fa-solid fa-xmark"></i> 거절</span>',
        matched:'<span class="badge badge-matched"><i class="fa-solid fa-heart"></i> 매칭</span>'
    }[a.status] || '';
    const photoBadge = a.photos && a.photos.length > 0 ? `<span class="badge" style="background:#f3f4f6;color:#6b7280;"><i class="fa-solid fa-image"></i> ${a.photos.length}</span>` : '';

    const avg = calcProfileQuality(a);
    const lS = a.look_score || 0;
    const avgColor = avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444';

    // 보조 배지 계산
    const miniBadges = [];
    const ageMs = Date.now() - new Date(a.created_at).getTime();
    const days = ageMs / (24*60*60*1000);
    if (days < 1) miniBadges.push('<span class="app-badge app-badge-new">NEW</span>');
    if ((a.status === 'pending' || a.status === 'pending_reputation') && days >= 3) miniBadges.push(`<span class="app-badge app-badge-wait">대기 ${Math.floor(days)}일</span>`);
    if (!a.look_score && a.status !== 'pending' && a.status !== 'pending_reputation') miniBadges.push('<span class="app-badge app-badge-nolook">외모 미평가</span>');
    if (!a.photos || a.photos.length === 0) miniBadges.push('<span class="app-badge app-badge-nolook">사진 없음</span>');
    if (a.last_seen_at) {
        const lastMs = Date.now() - new Date(a.last_seen_at).getTime();
        const lastH = lastMs / (60*60*1000);
        if (lastH < 24) miniBadges.push(`<span class="app-badge app-badge-online">🟢 ${relTime(a.last_seen_at)}</span>`);
        else if (lastH < 24*7) miniBadges.push(`<span class="app-badge app-badge-idle">${relTime(a.last_seen_at)}</span>`);
    } else if (a.status !== 'pending') {
        miniBadges.push('<span class="app-badge app-badge-idle">미접속</span>');
    }
    // 찜 받은 수 (인기도)
    const popCount = (window._adminFavCounts || {})[a.id] || 0;
    if (popCount >= 3) miniBadges.push(`<span class="app-badge app-badge-pop">💝 ${popCount}</span>`);

    const completion = calcProfileCompletion(a);
    if (completion >= 90) miniBadges.push(`<span class="app-badge app-badge-complete">완성 ${completion}%</span>`);
    else if (completion < 60) miniBadges.push(`<span class="app-badge app-badge-nolook">미완성 ${completion}%</span>`);

    return `
        <div class="applicant-row" onclick="openAdminDetail('${a.id}')" style="animation-delay:${idx * 30}ms;">
            <div class="applicant-row-icon">${icon}</div>
            <div class="applicant-info">
                <div class="applicant-name">${esc(a.name)} ${gBadge} ${sBadge} ${photoBadge}</div>
                <div class="applicant-detail">${age}세 · ${esc(a.job)}${a.height ? ' · '+a.height+'cm' : ''}${a.location ? ' · '+esc(a.location) : ''}${a.mbti ? ' · '+esc(a.mbti) : ''}</div>
                <div class="applicant-date">신청: ${formatDate(a.created_at)}${a.last_seen_at ? ' · 최근 접속: '+relTime(a.last_seen_at) : ''}</div>
                ${miniBadges.length > 0 ? `<div class="applicant-badge-row">${miniBadges.join('')}</div>` : ''}
            </div>
            <div style="text-align:center;flex-shrink:0;padding-top:2px;">
                <div style="font-size:1.1em;font-weight:800;color:${avgColor};">${avg}</div>
                <div style="font-size:.65em;color:#9ca3af;">종합</div>
                ${lS === 0 ? '<div style="font-size:.62em;color:#d97706;margin-top:2px;">★ 없음</div>' : `<div style="font-size:.62em;color:#9ca3af;margin-top:2px;">★${lS}</div>`}
            </div>
        </div>`;
}

// ── 퀵 필터 ──
let _currentQuickFilter = 'none';
function applyQuickFilter(qf) {
    _currentQuickFilter = qf;
    // 신청자 탭이 아니면 자동 전환 (홈/매칭에서 호출되는 경우 대비)
    const appPanel = document.getElementById('adminPanel-applicants');
    if (appPanel && !appPanel.classList.contains('active')) {
        switchAdminTab('applicants');
    }
    document.querySelectorAll('.quickfilter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.qf === qf);
    });
    if (qf === 'none') { filterAdmin(currentAdminFilter); return; }

    let filtered = adminCache;
    if (qf === 'no-look') filtered = filtered.filter(a => a.status === 'approved' && (a.look_score == null));
    else if (qf === 'no-photo') filtered = filtered.filter(a => !a.photos || a.photos.length === 0);
    else if (qf === 'long-wait') {
        const threeDaysAgo = Date.now() - 3*24*60*60*1000;
        filtered = filtered.filter(a => a.status === 'pending' && new Date(a.created_at).getTime() < threeDaysAgo);
    }
    else if (qf === 'online') {
        const dayAgo = Date.now() - 24*60*60*1000;
        filtered = filtered.filter(a => a.last_seen_at && new Date(a.last_seen_at).getTime() >= dayAgo);
    }
    else if (qf === 'inactive') {
        const weekAgo = Date.now() - 7*24*60*60*1000;
        filtered = filtered.filter(a => !a.last_seen_at || new Date(a.last_seen_at).getTime() < weekAgo);
    }

    document.getElementById('filter-title').innerHTML = `<i class="fa-solid fa-filter" style="color:var(--primary);"></i> 필터: ${
        {'no-look':'외모 미평가','no-photo':'사진 없음','long-wait':'대기 3일+','online':'최근 24h 접속','inactive':'7일+ 미접속'}[qf] || ''
    } (${filtered.length}명)`;
    document.getElementById('filtered-list').innerHTML = filtered.length === 0
        ? '<p style="color:#9ca3af;text-align:center;padding:16px;">해당하는 사람이 없습니다.</p>'
        : filtered.map((a, i) => applicantRowHtml(a, i)).join('');
}

// ── 관리자 상세 모달 ──
async function openAdminDetail(id) {
    const a = adminCache.find(x => x.id === id);
    if (!a) return;

    const age     = displayAge(a.birth);
    const gc      = a.gender;
    const icon    = gc === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);font-size:28px;"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);font-size:28px;"></i>';
    const bgColor = gc === 'male' ? 'var(--male-light)' : 'var(--female-light)';
    const photos  = a.photos && a.photos.length > 0 ? a.photos : [];
    const sBadge  = {
        pending_reputation:'<span class="badge" style="background:#fef3c7;color:#b45309;"><i class="fa-solid fa-handshake"></i> 평판 대기</span>',
        pending:'<span class="badge badge-pending"><i class="fa-solid fa-clock"></i> 승인 대기</span>',
        approved:'<span class="badge badge-approved"><i class="fa-solid fa-check"></i> 승인</span>',
        rejected:'<span class="badge badge-rejected"><i class="fa-solid fa-xmark"></i> 거절</span>',
        matched:'<span class="badge badge-matched"><i class="fa-solid fa-heart"></i> 매칭</span>'
    }[a.status] || '';

    // 평판 조회
    let reputations = [];
    let referrer = null;
    try {
        const reps = await adminFetch('reputations', 'GET', null, `?target_applicant_id=eq.${a.id}&select=*&order=created_at.desc`);
        reputations = reps || [];
    } catch(e) {}
    if (a.referred_by) referrer = adminCache.find(x => x.referral_code === a.referred_by);

    const _h = parseInt(a.height) || 0;
    const heightScore = !_h ? 50 : (a.gender === 'male' ? (_h>=185?95:_h>=180?85:_h>=175?75:_h>=170?60:40) : (_h>=168?90:_h>=163?80:_h>=158?70:_h>=153?55:40));
    const jobScore    = calcJobScore(a.job_category);
    const eduScore    = calcEduScore(a.education);
    const lookScore   = a.look_score || 0;

    function scoreBar(score, label) {
        const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
        return `<div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:700;color:${color};min-width:36px;">${score}점</span>
            <div style="flex:1;height:8px;background:#f3f4f6;border-radius:8px;overflow:hidden;">
                <div style="width:${score}%;height:100%;background:${color};border-radius:8px;"></div>
            </div>
        </div>`;
    }

    const rows = [
        ['직업',   `${esc(a.job)}${a.job_category ? ' ('+esc(a.job_category)+')' : ''}`],
        a.company   ? ['직장명', esc(a.company)]  : null,
        a.job_title ? ['직무',   esc(a.job_title)] : null,
        ['직업 점수', scoreBar(jobScore, '직업')],
        a.height    ? ['키',     a.height + 'cm'] : null,
        a.height    ? ['키 점수', scoreBar(heightScore, '키')] : null,
        a.education ? ['학력',   a.education]     : null,
        a.education ? ['학력 점수', scoreBar(eduScore, '학력')] : null,
        lookScore > 0 ? ['외모 점수', scoreBar(lookScore, '외모')] : ['외모 점수', '<span style="color:#9ca3af;font-size:.85em;">미평가</span>'],
        a.location  ? ['거주지', a.location]      : null,
        a.mbti      ? ['MBTI',   a.mbti]          : null,
        a.smoking   ? ['흡연',   a.smoking]       : null,
        a.drinking  ? ['음주',   a.drinking]      : null,
        a.religion  ? ['종교',   a.religion]      : null,
        a.hobby     ? ['취미',   a.hobby]         : null,
        a.referral  ? ['접속경로', a.referral]    : null,
        a.intro     ? ['자기소개', a.intro]       : null,
        ['신청일',  formatDate(a.created_at)],
    ].filter(Boolean);

    // Ice Breaker 표시
    let icebreakerHtml = '';
    if (a.icebreaker) {
        try {
            const ib = JSON.parse(a.icebreaker);
            icebreakerHtml = `
                <div style="background:linear-gradient(135deg,#f5f3ff,#fce7f3);border-radius:12px;padding:14px;margin:12px 0;">
                    <div style="font-size:.75em;color:var(--primary);font-weight:700;margin-bottom:6px;">💬 ${esc(ib.q)}</div>
                    <div style="font-size:.9em;font-weight:600;">${esc(ib.a)}</div>
                </div>`;
        } catch {}
    }

    document.getElementById('admin-detail-content').innerHTML = `
        ${photos.length > 0 ? `
        <div class="photo-gallery">
            ${photos.map(url => `<img loading="lazy" src="${esc(url)}" onclick="openLightbox('${escJs(url)}')">`).join('')}
        </div>` : ''}
        <div class="detail-header">
            ${photos.length === 0 ? `<div class="detail-avatar" style="background:${bgColor}">${icon}</div>` : ''}
            <div class="detail-name">${esc(a.name)} ${sBadge}</div>
            <div class="detail-meta">${age}세 · ${gc === 'male' ? '남성' : '여성'}</div>
        </div>
        ${a.kakao ? `<div class="detail-row detail-contact">
            <div class="detail-label"><i class="fa-solid fa-comment" style="color:#FEE500;"></i> 카카오 ID</div>
            <div class="detail-value">${esc(a.kakao)}</div>
        </div>` : ''}
        ${a.contact ? `<div class="detail-row detail-contact">
            <div class="detail-label"><i class="fa-solid fa-phone" style="color:var(--primary);"></i> 연락처</div>
            <div class="detail-value">${esc(a.contact)}</div>
        </div>` : ''}
        ${rows.map(([label, value]) => `
            <div class="detail-row">
                <div class="detail-label">${label}</div>
                <div class="detail-value">${label.includes('점수') ? value : esc(value)}</div>
            </div>`).join('')}
        <div class="detail-row">
            <div class="detail-label">외모 점수</div>
            <div class="detail-value" style="display:flex;align-items:center;gap:8px;">
                <input type="number" id="look-score-input-${a.id}" min="1" max="100"
                       value="${a.look_score || ''}" placeholder="1-100"
                       style="width:72px;padding:5px 8px;border:2px solid var(--border);border-radius:8px;font-size:.9em;font-family:inherit;">
                <button class="btn btn-sm btn-approve" onclick="saveLookScore('${a.id}')">저장</button>
                ${a.look_score ? `<span style="font-size:.78em;color:var(--muted);">현재 ${a.look_score}점</span>` : ''}
            </div>
        </div>
        ${icebreakerHtml}
        ${a.ideal ? `
            <div class="detail-row" style="flex-direction:column;gap:6px;">
                <div class="detail-label">이상형</div>
                <div class="detail-value">${renderIdealDisplay(a.ideal)}</div>
            </div>` : ''}
        <div style="margin-top:16px;padding:14px;background:#faf5ff;border-radius:10px;">
            <div style="font-size:.82em;font-weight:800;color:#7c3aed;margin-bottom:8px;">
                <i class="fa-solid fa-handshake"></i> 평판 & 추천인
            </div>
            <div style="font-size:.82em;color:#374151;margin-bottom:10px;">
                추천인: ${referrer ? `<b>${esc(referrer.name)}</b> (${esc(a.referred_by)})` : (a.referred_by ? `<code>${esc(a.referred_by)}</code> (탈퇴한 회원)` : '<span style="color:#9ca3af;">없음 (구 시스템 가입자)</span>')}
            </div>
            ${reputations.length === 0 ? '<div style="font-size:.78em;color:#9ca3af;">아직 평판 없음</div>' :
                reputations.map(r => {
                    const writer = adminCache.find(x => x.id === r.writer_applicant_id);
                    return `<div style="padding:10px;background:#fff;border-radius:8px;margin-bottom:6px;border:1px solid #ede9fe;">
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
                            <span style="font-size:.82em;font-weight:700;">${esc(writer?.name || '(알 수 없음)')}</span>
                            ${r.is_referrer ? '<span style="font-size:.68em;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#b45309;font-weight:700;">추천인</span>' : '<span style="font-size:.68em;padding:2px 6px;border-radius:4px;background:#e0e7ff;color:#3730a3;font-weight:700;">지인</span>'}
                            <span style="font-size:.7em;color:#9ca3af;margin-left:auto;">${formatDate(r.created_at)}</span>
                        </div>
                        <div style="font-size:.82em;color:#374151;line-height:1.5;">${esc(r.content)}</div>
                    </div>`;
                }).join('')
            }
            ${a.status === 'pending_reputation' ? `<div style="margin-top:8px;padding:8px;background:#fffbeb;border-radius:6px;font-size:.72em;color:#92400e;">⚠ 평판 대기 중 (${reputations.length}/2). 추천인 평판 ${reputations.filter(r => r.is_referrer).length > 0 ? '있음' : '필요'}</div>` : ''}
        </div>
    `;

    const actions = [];
    if (a.status === 'matched') {
        const partner = adminCache.find(x => x.id === a.matched_with);
        if (partner) actions.push(`<button class="btn btn-outline" onclick="openAdminDetail('${partner.id}');closeAdminDetail();"><i class="fa-solid fa-eye"></i> ${esc(partner.name)} 보기</button>`);
        actions.push(`<button class="btn btn-reject" onclick="unmatch('${a.id}')"><i class="fa-solid fa-heart-crack"></i> 매칭 취소</button>`);
    }
    if (a.status === 'pending_reputation') actions.push(`<button class="btn btn-outline" style="border-color:#f59e0b;color:#b45309;" onclick="updateStatusFromDetail('${a.id}','pending')"><i class="fa-solid fa-forward"></i> 평판 면제 (심사로)</button>`);
    if (a.status !== 'approved' && a.status !== 'matched') actions.push(`<button class="btn btn-approve" onclick="updateStatusFromDetail('${a.id}','approved')"><i class="fa-solid fa-check"></i> 승인</button>`);
    if (a.status === 'pending' || a.status === 'pending_reputation') actions.push(`<button class="btn btn-reject"  onclick="updateStatusFromDetail('${a.id}','rejected')"><i class="fa-solid fa-xmark"></i> 거절</button>`);
    if (a.status === 'approved') actions.push(`<button class="btn btn-match"  onclick="openMatchingView('${a.id}')"><i class="fa-solid fa-heart-circle-bolt"></i> 매칭 후보 보기</button>`);
    actions.push(`<button class="btn btn-outline" onclick="openEditForm('${a.id}')"><i class="fa-solid fa-pen"></i> 수정</button>`);
    actions.push(`<button class="btn btn-delete" onclick="deleteFromDetail('${a.id}')"><i class="fa-solid fa-trash"></i> 삭제</button>`);
    actions.push(`<button class="btn btn-outline" onclick="closeAdminDetail()">닫기</button>`);

    document.getElementById('admin-detail-actions').innerHTML = actions.join('');
    document.getElementById('admin-detail-overlay').classList.add('open');
}

function closeAdminDetail() { document.getElementById('admin-detail-overlay').classList.remove('open'); }

// ── 신청자 수정 ──
function openEditForm(id) {
    const a = adminCache.find(x => x.id === id);
    if (!a) return;
    document.getElementById('admin-detail-content').innerHTML = `
        <div style="font-size:1.05em;font-weight:800;margin-bottom:20px;">✏️ 신청자 수정 — ${esc(a.name)}</div>
        <div class="input-group">
            <label>성별</label>
            <div style="display:flex;gap:10px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;font-size:.92em;">
                    <input type="radio" name="edit-gender" id="edit-gender-male" value="male" ${a.gender==='male'?'checked':''}>
                    <i class="fa-solid fa-mars" style="color:var(--male);"></i> 남성
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;font-size:.92em;">
                    <input type="radio" name="edit-gender" id="edit-gender-female" value="female" ${a.gender==='female'?'checked':''}>
                    <i class="fa-solid fa-venus" style="color:var(--female);"></i> 여성
                </label>
            </div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>이름</label><input type="text" id="edit-name" value="${esc(a.name||'')}"></div>
            <div class="input-group"><label>생년월일</label><input type="text" id="edit-birth" value="${(a.birth||'').replace(/-/g,'.')}" placeholder="2000.01.15" maxlength="10" inputmode="numeric"></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>직업</label><input type="text" id="edit-job" value="${esc(a.job||'')}"></div>
            <div class="input-group"><label>키 (cm)</label><input type="number" id="edit-height" value="${a.height||''}" min="140" max="220"></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>직장명</label><input type="text" id="edit-company" value="${esc(a.company||'')}"></div>
            <div class="input-group"><label>직무</label><input type="text" id="edit-job-title" value="${esc(a.job_title||'')}"></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>학력</label><input type="text" id="edit-education" value="${esc(a.education||'')}"></div>
            <div class="input-group"><label>거주지</label><input type="text" id="edit-location" value="${esc(a.location||'')}"></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>MBTI</label><select id="edit-mbti">
                <option value="">선택...</option>
                ${['ENFP','ENFJ','ENTP','ENTJ','INFP','INFJ','INTP','INTJ','ESFP','ESFJ','ESTP','ESTJ','ISFP','ISFJ','ISTP','ISTJ'].map(m => '<option value="'+m+'" '+(a.mbti===m?'selected':'')+'>'+m+'</option>').join('')}
            </select></div>
            <div class="input-group"><label>카카오 ID</label><input type="text" id="edit-kakao" value="${esc(a.kakao||'')}"></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>흡연</label><select id="edit-smoking">
                <option value="">선택...</option>
                ${['비흡연','흡연','전자담배'].map(v => '<option value="'+v+'" '+(a.smoking===v?'selected':'')+'>'+v+'</option>').join('')}
            </select></div>
            <div class="input-group"><label>음주</label><select id="edit-drinking">
                <option value="">선택...</option>
                ${['안 마심','가끔','자주'].map(v => '<option value="'+v+'" '+(a.drinking===v?'selected':'')+'>'+v+'</option>').join('')}
            </select></div>
        </div>
        <div class="form-row">
            <div class="input-group"><label>종교</label><select id="edit-religion">
                <option value="">선택...</option>
                ${['무교','기독교','천주교','불교','기타'].map(v => '<option value="'+v+'" '+(a.religion===v?'selected':'')+'>'+v+'</option>').join('')}
            </select></div>
            <div class="input-group"><label>취미</label><input type="text" id="edit-hobby" value="${esc(a.hobby||'')}"></div>
        </div>
        <div class="input-group"><label>연락처 <span style="color:#9ca3af;font-weight:400;">(선택)</span></label><input type="tel" id="edit-contact" value="${esc(a.contact||'')}"></div>
        <div class="input-group"><label>접속경로</label><input type="text" id="edit-referral" value="${esc(a.referral||'')}"></div>
        <div class="input-group">
            <label>Ice Breaker 💬</label>
            <select id="edit-icebreaker-q" style="margin-bottom:6px;">
                <option value="">질문 선택...</option>
                <option value="휴일에 주로 뭐 해요?">휴일에 주로 뭐 해요?</option>
                <option value="인생 최고의 여행지는?">인생 최고의 여행지는?</option>
                <option value="요즘 빠져있는 것은?">요즘 빠져있는 것은?</option>
                <option value="첫 데이트로 어디가 좋아요?">첫 데이트로 어디가 좋아요?</option>
                <option value="나를 한 마디로 표현하면?">나를 한 마디로 표현하면?</option>
                <option value="좋아하는 음식 BEST 3는?">좋아하는 음식 BEST 3는?</option>
            </select>
            <input type="text" id="edit-icebreaker-a" placeholder="답변..." value="">
        </div>
        <div class="form-row">
            <div class="input-group">
                <label>직업군</label>
                <select id="edit-job-category">
                    <option value="">선택...</option>
                    <option value="전문직" ${a.job_category==='전문직'?'selected':''}>전문직</option>
                    <option value="연구·기술직" ${a.job_category==='연구·기술직'?'selected':''}>연구·기술직</option>
                    <option value="공공·금융·교육직" ${a.job_category==='공공·금융·교육직'?'selected':''}>공공·금융·교육직</option>
                    <option value="대기업·중견기업직" ${a.job_category==='대기업·중견기업직'?'selected':''}>대기업·중견기업직</option>
                    <option value="사업·전문자유직" ${a.job_category==='사업·전문자유직'?'selected':''}>사업·전문자유직</option>
                    <option value="일반사무·기술직" ${a.job_category==='일반사무·기술직'?'selected':''}>일반사무·기술직</option>
                    <option value="대학생/대학원생" ${(a.job_category==='학생'||a.job_category==='대학생/대학원생'||a.job_category==='대학생'||a.job_category==='대학원생')?'selected':''}>대학생/대학원생</option>
                    <option value="기타" ${a.job_category==='기타'?'selected':''}>기타</option>
                </select>
            </div>
            <div class="input-group">
                <label>외모 점수 <span style="color:#9ca3af;font-weight:400;">(1-100)</span></label>
                <input type="number" id="edit-look-score" value="${a.look_score||''}" min="1" max="100" placeholder="50">
            </div>
        </div>
        <div class="input-group"><label>자기소개</label><textarea id="edit-intro" rows="3">${esc(a.intro||'')}</textarea></div>
        <div class="input-group"><label>이상형</label><div id="edit-ideal-chips">${buildIdealChipsHtml('edit', a.ideal, a.gender)}</div><textarea id="edit-ideal-memo" class="ideal-memo" placeholder="추가로 하고 싶은 말이 있다면 자유롭게 적어주세요...">${getIdealMemo(a.ideal)}</textarea></div>
    `;
    // Ice Breaker 값 로드
    if (a.icebreaker) {
        try {
            const ib = JSON.parse(a.icebreaker);
            document.getElementById('edit-icebreaker-q').value = ib.q || '';
            document.getElementById('edit-icebreaker-a').value = ib.a || '';
        } catch {}
    }
    // edit-birth 자동 포맷 (YYYY.MM.DD)
    const editBirthEl = document.getElementById('edit-birth');
    if (editBirthEl) {
        editBirthEl.addEventListener('input', function() {
            let v = this.value.replace(/[^\d]/g, '');
            if (v.length > 8) v = v.slice(0, 8);
            if (v.length >= 5) v = v.slice(0,4) + '.' + v.slice(4);
            if (v.length >= 8) v = v.slice(0,7) + '.' + v.slice(7);
            this.value = v;
        });
    }

    document.getElementById('admin-detail-actions').innerHTML = `
        <button class="btn btn-approve" onclick="saveEdit('${id}')"><i class="fa-solid fa-floppy-disk"></i> 저장</button>
        <button class="btn btn-outline" onclick="openAdminDetail('${id}')">취소</button>
    `;
}

async function saveEdit(id) {
    const gender    = document.querySelector('input[name="edit-gender"]:checked')?.value;
    const name      = document.getElementById('edit-name').value.trim();
    const birthRaw  = document.getElementById('edit-birth').value.trim();
    const birth     = birthRaw.replace(/\./g, '-');
    const job       = document.getElementById('edit-job').value.trim();
    const heightVal = document.getElementById('edit-height').value;
    const education = document.getElementById('edit-education').value.trim();
    const location  = document.getElementById('edit-location').value.trim();
    const mbti      = document.getElementById('edit-mbti').value.trim().toUpperCase();
    const kakao     = document.getElementById('edit-kakao').value.trim();
    const contact   = document.getElementById('edit-contact').value.trim();
    const referral  = document.getElementById('edit-referral').value.trim();
    const intro     = document.getElementById('edit-intro').value.trim();
    const ideal     = collectIdealData('edit-ideal-chips', 'edit-ideal-memo');

    if (!gender)  { toast('성별을 선택해주세요.'); return; }
    if (!name)    { toast('이름을 입력해주세요.'); return; }
    if (!isValidBirth(birth)) { toast('생년월일을 정확히 입력해주세요. (예: 2000.01.15)'); return; }
    if (!job)     { toast('직업을 입력해주세요.'); return; }

    // Ice Breaker
    const editIbQ = document.getElementById('edit-icebreaker-q').value;
    const editIbA = document.getElementById('edit-icebreaker-a').value.trim();
    const editIcebreaker = (editIbQ && editIbA) ? JSON.stringify({ q: editIbQ, a: editIbA }) : null;

    setLoading(true);
    try {
        await adminFetch('applicants', 'PATCH', {
            gender, name, birth, job,
            kakao: kakao || null, contact: contact || null, referral: referral || null,
            height: heightVal ? parseInt(heightVal) : null, education: education || null,
            location: location || null, mbti: mbti || null, intro: intro || null,
            ideal: ideal || null,
            job_category: document.getElementById('edit-job-category')?.value || job || null,
            smoking: document.getElementById('edit-smoking').value || null,
            drinking: document.getElementById('edit-drinking').value || null,
            religion: document.getElementById('edit-religion').value || null,
            company: document.getElementById('edit-company')?.value.trim() || null,
            job_title: document.getElementById('edit-job-title')?.value.trim() || null,
            hobby: document.getElementById('edit-hobby')?.value.trim() || null,
            look_score: document.getElementById('edit-look-score').value ? parseInt(document.getElementById('edit-look-score').value) : null,
            icebreaker: editIcebreaker,
        }, `?id=eq.${id}`);
    } catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('수정되었습니다.', 'success');
    await renderAdmin();
    openAdminDetail(id);
}

async function saveLookScore(id) {
    const input = document.getElementById(`look-score-input-${id}`);
    if (!input) return;
    const score = parseInt(input.value);
    if (!score || score < 1 || score > 100) { toast('1~100 사이 점수를 입력해주세요.'); return; }
    setLoading(true);
    try { await adminFetch('applicants', 'PATCH', { look_score: score }, `?id=eq.${id}`); }
    catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    const idx = adminCache.findIndex(a => a.id === id);
    if (idx >= 0) adminCache[idx].look_score = score;
    toast(`✅ 외모 점수 ${score}점 저장`);
    openAdminDetail(id);
}

// ── 매칭 후보 보기 ──
function profileMiniHtml(a) {
    const icon = a.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);font-size:26px;"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);font-size:26px;"></i>';
    return `
        <div style="font-size:28px;margin-bottom:6px;">${icon}</div>
        <div class="match-split-name">${esc(a.name)}</div>
        <div class="match-split-meta">
            ${displayAge(a.birth)}세 · ${esc(a.job)}<br>
            ${a.height ? a.height + 'cm' : ''}${a.location ? (a.height ? ' · ' : '') + esc(a.location) : ''}<br>
            ${a.mbti ? `<span style="color:var(--primary);font-weight:700;">${a.mbti}</span>` : ''}
            ${a.ideal ? `<div style="margin-top:4px;font-size:.78em;">${renderIdealDisplay(a.ideal)}</div>` : ''}
        </div>`;
}

function openMatchingView(id) {
    closeAdminDetail();
    const a = adminCache.find(x => x.id === id);
    if (!a) return;

    const oppGender  = a.gender === 'male' ? 'female' : 'male';
    const oppLabel   = a.gender === 'male' ? '여성' : '남성';
    const oppIcon    = oppGender === 'male' ? '<i class="fa-solid fa-mars" style="color:var(--male);"></i>' : '<i class="fa-solid fa-venus" style="color:var(--female);"></i>';
    const candidates = adminCache.filter(x => x.status === 'approved' && x.gender === oppGender);

    const listHtml = candidates.length === 0
        ? `<p style="color:#9ca3af;text-align:center;padding:24px 0;">승인된 ${oppLabel}이 없습니다.</p>`
        : candidates.map(c => `
            <div class="applicant-row" onclick="selectMatchCandidate('${a.id}','${c.id}')">
                <div class="applicant-row-icon">${oppIcon}</div>
                <div class="applicant-info">
                    <div class="applicant-name">${esc(c.name)}${c.mbti ? ` <span style="font-size:.78em;color:var(--primary);font-weight:700;">${c.mbti}</span>` : ''}</div>
                    <div class="applicant-detail">${displayAge(c.birth)}세 · ${esc(c.job)}${c.height ? ' · ' + c.height + 'cm' : ''}${c.location ? ' · ' + esc(c.location) : ''}</div>
                    ${c.ideal ? `<div style="font-size:.76em;margin-top:3px;">${renderIdealDisplay(c.ideal)}</div>` : ''}
                </div>
                <div style="font-size:.8em;color:#9ca3af;flex-shrink:0;padding-top:4px;">선택 →</div>
            </div>`).join('');

    document.getElementById('matching-content').innerHTML = `
        <div style="font-size:1.05em;font-weight:800;margin-bottom:16px;"><i class="fa-solid fa-heart-circle-bolt" style="color:#ec4899;"></i> ${esc(a.name)}님의 매칭 후보</div>
        <div class="matching-list-title">${oppIcon} 승인된 ${oppLabel} · ${candidates.length}명 — 후보를 선택하세요</div>
        ${listHtml}
    `;
    document.getElementById('matching-overlay').classList.add('open');
}

function selectMatchCandidate(subjectId, candidateId) {
    const a = adminCache.find(x => x.id === subjectId);
    const c = adminCache.find(x => x.id === candidateId);
    if (!a || !c) return;

    const male   = a.gender === 'male' ? a : c;
    const female = a.gender === 'female' ? a : c;

    document.getElementById('matching-content').innerHTML = `
        <div style="font-size:1.05em;font-weight:800;margin-bottom:16px;"><i class="fa-solid fa-heart-circle-bolt" style="color:#ec4899;"></i> 매칭 확인</div>
        <div class="match-split">
            <div class="match-split-card selected">${profileMiniHtml(male)}</div>
            <div class="match-split-divider"><i class="fa-solid fa-heart" style="color:#ec4899;"></i></div>
            <div class="match-split-card selected">${profileMiniHtml(female)}</div>
        </div>
        <button class="btn btn-do-match" onclick="confirmMatch('${male.id}','${female.id}')"><i class="fa-solid fa-heart-pulse"></i> 매칭하기</button>
        <button class="btn btn-outline" onclick="openMatchingView('${subjectId}')" style="margin-top:10px;">← 목록으로</button>
    `;
}

async function confirmMatch(maleId, femaleId) {
    setLoading(true);
    try {
        // 매칭 전 상태 재확인 (동시성 충돌 방지)
        const checkM = await adminFetch('applicants', 'GET', null, `?id=eq.${maleId}&select=status`);
        const checkF = await adminFetch('applicants', 'GET', null, `?id=eq.${femaleId}&select=status`);
        if (!checkM?.[0] || !checkF?.[0] || checkM[0].status === 'matched' || checkF[0].status === 'matched') {
            setLoading(false);
            toast('이미 매칭된 사용자가 포함되어 있어요. 새로고침합니다.');
            await renderAdmin(); return;
        }
        await adminFetch('applicants', 'PATCH', { status: 'matched', matched_with: femaleId }, `?id=eq.${maleId}`);
        await adminFetch('applicants', 'PATCH', { status: 'matched', matched_with: maleId }, `?id=eq.${femaleId}`);
        // 관련 pending 매칭 요청 자동 거절
        await adminFetch('match_requests', 'PATCH', { status: 'rejected' },
            `?status=eq.pending&or=(from_applicant.eq.${maleId},to_applicant.eq.${maleId},from_applicant.eq.${femaleId},to_applicant.eq.${femaleId})`);
        // 양쪽에 매칭 알림 + 푸시
        const male = adminCache.find(a => a.id === maleId);
        const female = adminCache.find(a => a.id === femaleId);
        const MATCH_URL = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-my';
        try {
            const notifRows = [];
            if (male?.user_id) notifRows.push({ user_id: male.user_id, type: 'matched', title: '매칭 성사!', body: `${female?.name || '반쪽'}님과 매칭되었어요! 대화를 시작해보세요.` });
            if (female?.user_id) notifRows.push({ user_id: female.user_id, type: 'matched', title: '매칭 성사!', body: `${male?.name || '반쪽'}님과 매칭되었어요! 대화를 시작해보세요.` });
            if (notifRows.length) await adminFetch('notifications', 'POST', notifRows);
        } catch(e) {}
        if (male?.user_id) sendAdminPush(male.user_id, '매칭 성사!', `${female?.name || '반쪽'}님과 매칭되었어요. 대화를 시작해보세요!`, MATCH_URL, 'matched');
        if (female?.user_id) sendAdminPush(female.user_id, '매칭 성사!', `${male?.name || '반쪽'}님과 매칭되었어요. 대화를 시작해보세요!`, MATCH_URL, 'matched');
    } catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('매칭이 완료되었습니다!', 'success');
    closeMatchingView();
    await renderAdmin();
    filterAdmin('matched');
}

async function unmatch(id) {
    if (!confirm('매칭을 취소하시겠습니까?')) return;
    const a = adminCache.find(x => x.id === id);
    if (!a) return;

    setLoading(true);
    try {
        await adminFetch('applicants', 'PATCH', { status: 'approved', matched_with: null, contact_released: false }, `?id=eq.${id}`);
        if (a.matched_with) {
            await adminFetch('applicants', 'PATCH', { status: 'approved', matched_with: null, contact_released: false }, `?id=eq.${a.matched_with}`);
        }
    } catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('매칭이 취소되었습니다.');
    closeAdminDetail();
    await renderAdmin();
}

function coupleCardHtml(male, female) {
    const mName = male   ? esc(male.name)   : '?';
    const fName = female ? esc(female.name) : '?';
    const mMeta = male   ? `${displayAge(male.birth)}세 · ${esc(male.job)}${male.mbti ? ' · ' + male.mbti : ''}` : '';
    const fMeta = female ? `${displayAge(female.birth)}세 · ${esc(female.job)}${female.mbti ? ' · ' + female.mbti : ''}` : '';
    const mId   = male   ? male.id   : '';
    const fId   = female ? female.id : '';
    const mReleased = male && male.contact_released;
    const fReleased = female && female.contact_released;
    const bothReleased = mReleased && fReleased;
    return `
        <div class="couple-card">
            <div class="couple-profiles">
                <div class="couple-profile" onclick="openAdminDetail('${mId}')" style="cursor:pointer;">
                    <div class="couple-profile-icon"><i class="fa-solid fa-mars" style="color:var(--male);"></i></div>
                    <div class="couple-profile-name">${mName}</div>
                    <div class="couple-profile-meta">${mMeta}</div>
                </div>
                <div class="couple-heart"><i class="fa-solid fa-heart" style="color:#ec4899;"></i></div>
                <div class="couple-profile" onclick="openAdminDetail('${fId}')" style="cursor:pointer;">
                    <div class="couple-profile-icon"><i class="fa-solid fa-venus" style="color:var(--female);"></i></div>
                    <div class="couple-profile-name">${fName}</div>
                    <div class="couple-profile-meta">${fMeta}</div>
                </div>
            </div>
            <div style="text-align:center;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
                ${bothReleased
                    ? `<span style="font-size:.82em;color:#10b981;font-weight:700;"><i class="fa-solid fa-circle-check"></i> 연락처 공개됨</span>`
                    : `<button class="btn btn-sm btn-primary" onclick="releaseContact('${mId}','${fId}')" style="font-size:.82em;"><i class="fa-solid fa-paper-plane"></i> 연락처 공개하기</button>`
                }
                <button class="btn btn-sm btn-outline" onclick="viewConversation('${mId}','${fId}')" style="font-size:.82em;"><i class="fa-solid fa-comments"></i> 대화 보기</button>
            </div>
        </div>`;
}

// ── 연락처 공개 (관리자 승인) ──
async function releaseContact(maleId, femaleId) {
    if (!confirm('이 커플의 카카오 ID를 서로에게 공개하시겠습니까?')) return;
    setLoading(true);
    try {
        await adminFetch('applicants', 'PATCH', { contact_released: true }, `?id=eq.${maleId}`);
        await adminFetch('applicants', 'PATCH', { contact_released: true }, `?id=eq.${femaleId}`);
        // 양쪽에 연락처 공개 푸시
        const male = adminCache.find(a => a.id === maleId);
        const female = adminCache.find(a => a.id === femaleId);
        const URL_MY = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-my';
        if (male?.user_id) sendAdminPush(male.user_id, '📬 연락처가 공개되었어요', `${female?.name || '반쪽'}님의 카카오 ID를 확인하세요`, URL_MY, 'match');
        if (female?.user_id) sendAdminPush(female.user_id, '📬 연락처가 공개되었어요', `${male?.name || '반쪽'}님의 카카오 ID를 확인하세요`, URL_MY, 'match');
    } catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('연락처가 공개되었습니다. 양쪽에 카카오 ID가 전달됩니다.', 'success');
    await renderAdmin();
    filterAdmin('matched');
}

function closeMatchingView() { document.getElementById('matching-overlay').classList.remove('open'); }

// ── 대화 보기 (관리자) ──
async function viewConversation(maleId, femaleId) {
    const male = adminCache.find(a => a.id === maleId);
    const female = adminCache.find(a => a.id === femaleId);
    if (!male || !female || !male.user_id || !female.user_id) {
        toast('사용자 정보를 찾을 수 없습니다.');
        return;
    }
    const mName = male.name, fName = female.name;
    const uid1 = male.user_id, uid2 = female.user_id;
    const matchKey = uid1 < uid2 ? uid1 + '_' + uid2 : uid2 + '_' + uid1;

    document.getElementById('chat-viewer-title').textContent = `${mName} ♡ ${fName} 대화`;
    document.getElementById('chat-viewer-messages').innerHTML = '<div style="text-align:center;padding:40px;color:#a3a3a3;">불러오는 중...</div>';
    document.getElementById('chat-viewer-stats').textContent = '';
    document.getElementById('chat-viewer-overlay').style.display = 'flex';

    try {
        const res = await adminFetch('chat_messages', 'GET', null, `?match_key=eq.${matchKey}&order=created_at.asc&limit=500`);
        const messages = Array.isArray(res) ? res : [];
        const container = document.getElementById('chat-viewer-messages');

        if (messages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#a3a3a3;"><i class="fa-regular fa-comment-dots" style="font-size:2em;display:block;margin-bottom:8px;"></i>아직 대화가 없습니다</div>';
            document.getElementById('chat-viewer-stats').textContent = '메시지 0건';
            return;
        }

        let html = '';
        let lastDate = '';
        for (const msg of messages) {
            const d = new Date(msg.created_at);
            const dateStr = `${d.getMonth()+1}월 ${d.getDate()}일`;
            if (dateStr !== lastDate) {
                html += `<div style="text-align:center;padding:8px 0;font-size:.72em;color:#a3a3a3;font-weight:600;">${dateStr}</div>`;
                lastDate = dateStr;
            }
            const isMale = msg.sender_id === uid1;
            const senderName = isMale ? mName : fName;
            const bgColor = isMale ? '#111' : '#f3f4f6';
            const textColor = isMale ? '#fff' : '#111';
            const align = isMale ? 'flex-end' : 'flex-start';
            const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
            html += `<div style="max-width:80%;padding:10px 14px;border-radius:16px;font-size:.85em;word-break:break-word;line-height:1.5;background:${bgColor};color:${textColor};align-self:${align};">`;
            html += `<div style="font-size:.7em;font-weight:700;margin-bottom:3px;opacity:.6;">${esc(senderName)}</div>`;
            html += esc(msg.content).replace(/\n/g, '<br>');
            html += `<div style="font-size:.65em;margin-top:3px;opacity:.5;">${time}${msg.read_at ? ' · 읽음' : ''}</div>`;
            html += `</div>`;
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;

        // 통계
        const first = new Date(messages[0].created_at);
        const last = new Date(messages[messages.length - 1].created_at);
        document.getElementById('chat-viewer-stats').textContent =
            `총 ${messages.length}건 · 첫 메시지: ${first.getMonth()+1}/${first.getDate()} ${first.getHours()}:${first.getMinutes().toString().padStart(2,'0')} · 마지막: ${last.getMonth()+1}/${last.getDate()} ${last.getHours()}:${last.getMinutes().toString().padStart(2,'0')}`;
    } catch(e) {
        document.getElementById('chat-viewer-messages').innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">대화 로드 실패: ${esc(e.message)}</div>`;
    }
}

function closeChatViewer() { document.getElementById('chat-viewer-overlay').style.display = 'none'; }

async function updateStatusFromDetail(id, status) {
    setLoading(true);
    const target = adminCache.find(a => a.id === id);
    try { await adminFetch('applicants', 'PATCH', { status }, `?id=eq.${id}`); }
    catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    // 승인/거절 푸시
    if (target?.user_id) {
        if (status === 'approved') {
            sendAdminPush(target.user_id, '✅ 신청서가 승인되었어요!', '이제 매칭을 시작할 수 있어요. 추천 반쪽을 확인해보세요.',
                'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-discover', 'approved');
        } else if (status === 'rejected') {
            // rejected 알림도 DB에 수동 insert (trigger가 처리 안 함)
            try {
                await adminFetch('notifications', 'POST', {
                    user_id: target.user_id, type: 'rejected',
                    title: '신청서 검토 결과', body: '안타깝게도 이번 신청은 승인되지 않았어요. 프로필을 보완해서 다시 신청해보세요.'
                });
            } catch(e) {}
            sendAdminPush(target.user_id, '신청서 검토 결과', '프로필을 보완해서 다시 신청해주세요',
                'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-my', 'approved');
        }
    }
    setLoading(false);
    toast(status === 'approved' ? '✅ 승인되었습니다.' : '❌ 거절되었습니다.');
    closeAdminDetail();
    renderAdmin();
}

// ── 일괄 승인 ──
async function batchApproveAll() {
    const pending = adminCache.filter(a => a.status === 'pending');
    if (pending.length === 0) { toast('대기 중인 신청이 없습니다.'); return; }
    if (!confirm(`대기 중인 ${pending.length}명을 전체 승인하시겠습니까?`)) return;
    setLoading(true, `${pending.length}명 승인 중...`);
    let success = 0, fail = 0;
    for (const a of pending) {
        try {
            await adminFetch('applicants', 'PATCH', { status: 'approved' }, `?id=eq.${a.id}`);
            success++;
            if (a.user_id) {
                sendAdminPush(a.user_id, '✅ 신청서가 승인되었어요!', '이제 매칭을 시작할 수 있어요. 추천 반쪽을 확인해보세요.',
                    'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-discover', 'approved');
            }
        } catch { fail++; }
    }
    setLoading(false);
    toast(`${success}명 승인 완료${fail > 0 ? `, ${fail}명 실패` : ''}`);
    await renderAdmin();
}

async function deleteFromDetail(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    closeAdminDetail();
    setLoading(true);
    try {
        // Storage 사진 정리
        const target = adminCache.find(a => a.id === id);
        if (target?.photos) await deletePhotosFromStorage(target.photos);
        if (target?.user_id) await deleteUserPhotosFromStorage(target.user_id);
        await adminFetch('applicants', 'DELETE', null, `?id=eq.${id}`);
    }
    catch(e) { setLoading(false); toast('오류: ' + e.message); return; }
    setLoading(false);
    toast('삭제되었습니다.');
    renderAdmin();
}

// ── 문의사항 관리 ──
let _inquiryCache = [];
let _inquiryFilter = 'all';

async function loadAdminInquiries() {
    const list = document.getElementById('admin-inquiries-list');
    try {
        _inquiryCache = await adminFetch('inquiries', 'GET', null, '?select=*&order=created_at.desc&limit=50') || [];
        window._adminUnreadInq = _inquiryCache.filter(q => !q.reply).length;
        renderAdminInquiries();
        if (typeof updateAdminTabBadges === 'function') updateAdminTabBadges();
    } catch(e) { list.innerHTML = '<div style="color:#ef4444;">로드 실패</div>'; }
}

function filterInquiries(filter) {
    _inquiryFilter = filter;
    // 문의 탭이 아니면 자동 전환 (홈/다른 탭에서 호출되는 경우 대비)
    const inqPanel = document.getElementById('adminPanel-inquiries');
    if (inqPanel && !inqPanel.classList.contains('active')) {
        switchAdminTab('inquiries');
    }
    ['all','unread','replied'].forEach(f => {
        const btn = document.getElementById('inq-filter-' + f);
        if (!btn) return;
        if (f === filter) { btn.style.background = '#111'; btn.style.color = '#fff'; btn.className = 'btn btn-sm'; }
        else { btn.style.background = ''; btn.style.color = ''; btn.className = 'btn btn-sm btn-outline'; }
    });
    renderAdminInquiries();
}

function renderAdminInquiries() {
    const list = document.getElementById('admin-inquiries-list');
    let data = _inquiryCache;
    const totalUnread = data.filter(q => !q.reply).length;
    document.getElementById('inquiry-count').textContent = totalUnread > 0 ? totalUnread + '건 미답변' : data.length + '건';

    if (_inquiryFilter === 'unread') data = data.filter(q => !q.reply);
    else if (_inquiryFilter === 'replied') data = data.filter(q => q.reply);

    if (data.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">' +
            (_inquiryFilter === 'all' ? '문의가 없습니다.' : _inquiryFilter === 'unread' ? '미답변 문의가 없습니다.' : '답변 완료된 문의가 없습니다.') + '</div>';
        return;
    }

    // 유저별 그룹핑
    const grouped = new Map();
    data.forEach(q => {
        const name = q.user_name || '익명';
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(q);
    });

    let html = '';
    grouped.forEach((items, userName) => {
        const unreadCount = items.filter(q => !q.reply).length;
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:.78em;font-weight:700;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:6px;">' +
            '<i class="fa-regular fa-user"></i> ' + esc(userName) +
            ' <span style="color:#9ca3af;">(' + items.length + '건)</span>' +
            (unreadCount > 0 ? ' <span style="background:var(--cta);color:#fff;font-size:.8em;padding:1px 6px;border-radius:99px;">' + unreadCount + '</span>' : '') +
        '</div>';
        items.forEach(q => {
            const timeAgo = adminTimeAgo(q.created_at);
            const isUnread = !q.reply;
            html += '<div style="padding:12px;background:' + (isUnread ? '#fef3c7' : '#fff') + ';border:1px solid ' + (isUnread ? '#fde68a' : 'var(--border)') + ';border-radius:10px;margin-bottom:6px;' + (isUnread ? 'border-left:3px solid var(--cta);' : '') + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
                    '<div style="font-size:.88em;color:#111;flex:1;">' + esc(q.message) + '</div>' +
                    '<div style="display:flex;gap:4px;flex-shrink:0;margin-left:8px;">' +
                        '<button onclick="deleteInquiryAdmin(' + q.id + ')" style="background:none;border:none;color:#d1d5db;cursor:pointer;padding:2px 4px;font-size:.75em;" title="삭제"><i class="fa-regular fa-trash-can"></i></button>' +
                    '</div>' +
                '</div>' +
                '<div style="font-size:.7em;color:var(--muted);margin-bottom:6px;">' + timeAgo + '</div>';
            if (q.reply) {
                html += '<div style="padding:8px 10px;background:#f0fdf4;border-radius:8px;font-size:.82em;color:#065f46;border-left:3px solid #10b981;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                        '<div style="flex:1;">' + esc(q.reply) + '</div>' +
                        '<button onclick="editReply(' + q.id + ')" style="background:none;border:none;color:#6b7280;cursor:pointer;padding:2px 4px;font-size:.85em;flex-shrink:0;" title="수정"><i class="fa-solid fa-pen-to-square"></i></button>' +
                    '</div>' +
                    '<div style="font-size:.72em;color:#6b7280;margin-top:3px;">' + adminTimeAgo(q.replied_at) + ' 답변</div>' +
                '</div>';
            } else {
                html += '<div style="display:flex;gap:6px;">' +
                    '<input type="text" id="reply-' + q.id + '" placeholder="답변 입력..." style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.85em;font-family:inherit;" onkeydown="if(event.key===\'Enter\')replyInquiry(' + q.id + ')">' +
                    '<button class="btn btn-sm btn-primary" onclick="replyInquiry(' + q.id + ')" style="flex-shrink:0;">답변</button>' +
                '</div>';
            }
            html += '</div>';
        });
        html += '</div>';
    });
    list.innerHTML = html;
}

function adminTimeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return mins + '분 전';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + '시간 전';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + '일 전';
    return new Date(dateStr).toLocaleDateString('ko-KR');
}

async function replyInquiry(id) {
    const input = document.getElementById('reply-' + id);
    if (!input) return;
    const reply = input.value.trim();
    if (!reply) { toast('답변을 입력해주세요.', 'warning'); return; }
    const q = _inquiryCache.find(x => x.id === id);
    try {
        await adminFetch('inquiries', 'PATCH', { reply: reply, is_read: true, replied_at: new Date().toISOString(), user_read: false }, '?id=eq.' + id);
        // 푸시 알림 (in-app notification은 DB trigger가 처리)
        if (q?.user_id) {
            sendAdminPush(q.user_id, '💬 문의에 답변이 달렸어요',
                reply.length > 60 ? reply.slice(0, 60) + '...' : reply,
                'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-my', 'inquiry_reply');
        }
        toast('답변 완료', 'success');
        loadAdminInquiries();
    } catch(e) { toast('오류: ' + e.message, 'error'); }
}

async function editReply(id) {
    const q = _inquiryCache.find(x => x.id === id);
    if (!q) return;
    const newReply = prompt('답변 수정:', q.reply);
    if (newReply === null || newReply.trim() === '') return;
    try {
        await adminFetch('inquiries', 'PATCH', { reply: newReply.trim(), replied_at: new Date().toISOString(), user_read: false }, '?id=eq.' + id);
        toast('답변 수정 완료', 'success');
        loadAdminInquiries();
    } catch(e) { toast('오류: ' + e.message, 'error'); }
}

async function deleteInquiryAdmin(id) {
    if (!confirm('이 문의를 삭제하시겠습니까?')) return;
    try {
        await adminFetch('inquiries', 'DELETE', null, '?id=eq.' + id);
        toast('삭제 완료');
        loadAdminInquiries();
    } catch(e) { toast('오류: ' + e.message, 'error'); }
}

async function savePasswords() {
    const vPw = document.getElementById('new-viewer-pw').value.trim();
    const aPw = document.getElementById('new-admin-pw').value.trim();
    if (!vPw && !aPw) { toast('변경할 비밀번호를 입력해주세요.'); return; }
    if ((vPw && vPw.length < 4) || (aPw && aPw.length < 4)) { toast('비밀번호는 4자 이상이어야 합니다.', 'warning'); return; }
    const upserts = [];
    if (vPw) upserts.push({ key: 'viewer_password', value: vPw });
    if (aPw) upserts.push({ key: 'admin_password',  value: aPw });
    setLoading(true);
    const { error } = await db.from('settings').upsert(upserts);
    setLoading(false);
    if (error) { toast('오류: ' + error.message); return; }
    document.getElementById('new-viewer-pw').value = '';
    document.getElementById('new-admin-pw').value  = '';
    toast('비밀번호가 변경되었습니다.');
}

// ── 라이트박스 ──
function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-overlay').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox-overlay').classList.remove('open'); }

// ── 유틸 ──
// calcAge → js/common.js (returns number|null)
// 관리자 표시용 래퍼: null → '?'
function displayAge(birth) { return calcAge(birth) ?? '?'; }

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)    return '방금 전';
    if (diff < 3600)  return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }
// esc, toast → js/common.js

// ── 추천 인맥 네트워크 시각화 ──
let _networkNodes = [], _networkEdges = [], _networkDrag = null, _networkPan = { x: 0, y: 0 }, _networkScale = 1;

function renderNetworkGraph() {
    if (!adminCache || adminCache.length === 0) return;
    const canvas = document.getElementById('network-canvas');
    const wrap = document.getElementById('network-canvas-wrap');
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = wrap.clientWidth, H = wrap.clientHeight;

    // 노드/엣지 빌드
    const codeToId = {};
    adminCache.forEach(a => { if (a.referral_code) codeToId[a.referral_code.toUpperCase()] = a.id; });

    const nodes = [];
    const edges = [];
    const idToNode = {};
    const childCount = {};

    adminCache.forEach((a, i) => {
        if (a.referred_by) {
            const parentId = codeToId[a.referred_by.toUpperCase()];
            if (parentId) {
                childCount[parentId] = (childCount[parentId] || 0) + 1;
            }
        }
    });

    adminCache.forEach((a, i) => {
        const statusColors = { approved: '#10b981', pending: '#f59e0b', matched: '#ec4899', rejected: '#ef4444', pending_reputation: '#9ca3af' };
        const node = {
            id: a.id,
            name: a.name || '?',
            status: a.status,
            gender: a.gender,
            color: statusColors[a.status] || '#d1d5db',
            referral_code: a.referral_code,
            referred_by: a.referred_by,
            referral_count: a.referral_count || childCount[a.id] || 0,
            created_at: a.created_at,
            x: 0, y: 0, vx: 0, vy: 0,
            r: Math.min(24, 12 + (childCount[a.id] || 0) * 3),
        };
        nodes.push(node);
        idToNode[a.id] = node;
    });

    adminCache.forEach(a => {
        if (a.referred_by) {
            const parentId = codeToId[a.referred_by.toUpperCase()];
            if (parentId && idToNode[parentId]) {
                edges.push({ from: parentId, to: a.id });
            }
        }
    });

    // 초기 위치: 루트는 중앙, 자식은 주변에 배치
    const roots = nodes.filter(n => !n.referred_by || !codeToId[(n.referred_by || '').toUpperCase()]);
    const nonRoots = nodes.filter(n => n.referred_by && codeToId[(n.referred_by || '').toUpperCase()]);

    roots.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(roots.length, 1);
        n.x = W / 2 + Math.cos(angle) * Math.min(W, H) * 0.2;
        n.y = H / 2 + Math.sin(angle) * Math.min(W, H) * 0.2;
    });

    nonRoots.forEach(n => {
        const parentId = codeToId[n.referred_by.toUpperCase()];
        const parent = idToNode[parentId];
        if (parent) {
            n.x = parent.x + (Math.random() - 0.5) * 80;
            n.y = parent.y + (Math.random() - 0.5) * 80;
        } else {
            n.x = Math.random() * W;
            n.y = Math.random() * H;
        }
    });

    _networkNodes = nodes;
    _networkEdges = edges;

    // Force-directed simulation (간단 버전)
    for (let iter = 0; iter < 120; iter++) {
        // 반발력 (모든 노드 쌍)
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                let dx = nodes[j].x - nodes[i].x;
                let dy = nodes[j].y - nodes[i].y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                let force = 800 / (dist * dist);
                let fx = dx / dist * force;
                let fy = dy / dist * force;
                nodes[i].vx -= fx; nodes[i].vy -= fy;
                nodes[j].vx += fx; nodes[j].vy += fy;
            }
        }
        // 인력 (연결된 노드 쌍)
        edges.forEach(e => {
            const a = idToNode[e.from], b = idToNode[e.to];
            if (!a || !b) return;
            let dx = b.x - a.x, dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let force = (dist - 80) * 0.05;
            let fx = dx / dist * force, fy = dy / dist * force;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
        });
        // 중심 인력
        nodes.forEach(n => {
            n.vx += (W / 2 - n.x) * 0.001;
            n.vy += (H / 2 - n.y) * 0.001;
            n.x += n.vx * 0.3;
            n.y += n.vy * 0.3;
            n.vx *= 0.8;
            n.vy *= 0.8;
            n.x = Math.max(20, Math.min(W - 20, n.x));
            n.y = Math.max(20, Math.min(H - 20, n.y));
        });
    }

    drawNetwork(ctx, W, H);

    // 통계
    const stats = document.getElementById('network-stats');
    if (stats) {
        const totalNodes = nodes.length;
        const totalEdges = edges.length;
        const maxDepth = calcMaxDepth(nodes, edges, codeToId, idToNode);
        const topReferrers = [...nodes].sort((a, b) => b.referral_count - a.referral_count).slice(0, 3);
        stats.innerHTML = `총 ${totalNodes}명 · 추천 연결 ${totalEdges}건 · 최대 깊이 ${maxDepth}단계 ·
            탑 추천인: ${topReferrers.map(n => `<b>${esc(n.name)}</b>(${n.referral_count}명)`).join(', ')}`;
    }

    // 클릭 이벤트
    canvas.onclick = function(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left - _networkPan.x) / _networkScale;
        const my = (e.clientY - rect.top - _networkPan.y) / _networkScale;
        const tooltip = document.getElementById('network-tooltip');
        let hit = null;
        for (const n of nodes) {
            const dist = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
            if (dist <= n.r + 4) { hit = n; break; }
        }
        if (hit) {
            const age = hit.created_at ? Math.floor((Date.now() - new Date(hit.created_at).getTime()) / 86400000) : '?';
            const statusLabels = { approved: '활동 중', pending: '심사 대기', matched: '매칭됨', rejected: '거절', pending_reputation: '평판 대기' };
            const children = nodes.filter(n => n.referred_by && codeToId[(n.referred_by || '').toUpperCase()] === hit.id);
            tooltip.style.display = 'block';
            tooltip.style.left = Math.min(e.clientX - rect.left + 10, W - 270) + 'px';
            tooltip.style.top = Math.min(e.clientY - rect.top + 10, H - 150) + 'px';
            tooltip.innerHTML = `
                <div style="font-weight:800;font-size:1em;margin-bottom:6px;">${esc(hit.name)} <span style="font-size:.75em;color:${hit.color};">${hit.gender === 'male' ? '♂' : '♀'}</span></div>
                <div style="font-size:.82em;color:var(--muted);line-height:1.7;">
                    상태: <b style="color:${hit.color};">${statusLabels[hit.status] || hit.status}</b><br>
                    추천 코드: <code>${esc(hit.referral_code || '-')}</code><br>
                    추천한 수: <b>${children.length}</b>명<br>
                    가입일: ${hit.created_at ? new Date(hit.created_at).toLocaleDateString('ko-KR') : '-'} (${age}일 전)
                </div>
                ${children.length > 0 ? `<div style="margin-top:6px;font-size:.78em;color:var(--muted);">추천한 사람: ${children.map(c => esc(c.name)).join(', ')}</div>` : ''}
                <button class="btn btn-outline" onclick="openAdminDetail('${hit.id}');document.getElementById('network-tooltip').style.display='none';" style="margin-top:8px;font-size:.78em;width:100%;">상세 보기</button>
            `;
        } else {
            tooltip.style.display = 'none';
        }
    };

    // 드래그로 패닝
    let dragStart = null;
    canvas.onmousedown = canvas.ontouchstart = function(e) {
        const t = e.touches ? e.touches[0] : e;
        dragStart = { x: t.clientX - _networkPan.x, y: t.clientY - _networkPan.y };
    };
    canvas.onmousemove = canvas.ontouchmove = function(e) {
        if (!dragStart) return;
        const t = e.touches ? e.touches[0] : e;
        _networkPan.x = t.clientX - dragStart.x;
        _networkPan.y = t.clientY - dragStart.y;
        drawNetwork(ctx, W, H);
    };
    canvas.onmouseup = canvas.ontouchend = function() { dragStart = null; };

    // 스크롤 줌
    canvas.onwheel = function(e) {
        e.preventDefault();
        _networkScale *= e.deltaY > 0 ? 0.9 : 1.1;
        _networkScale = Math.max(0.3, Math.min(3, _networkScale));
        drawNetwork(ctx, W, H);
    };
}

function drawNetwork(ctx, W, H) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(_networkPan.x, _networkPan.y);
    ctx.scale(_networkScale, _networkScale);

    // 엣지
    _networkEdges.forEach(e => {
        const a = _networkNodes.find(n => n.id === e.from);
        const b = _networkNodes.find(n => n.id === e.to);
        if (!a || !b) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 화살표
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const arrowX = b.x - Math.cos(angle) * (b.r + 4);
        const arrowY = b.y - Math.sin(angle) * (b.r + 4);
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - Math.cos(angle - 0.4) * 8, arrowY - Math.sin(angle - 0.4) * 8);
        ctx.lineTo(arrowX - Math.cos(angle + 0.4) * 8, arrowY - Math.sin(angle + 0.4) * 8);
        ctx.closePath();
        ctx.fillStyle = '#d1d5db';
        ctx.fill();
    });

    // 노드
    _networkNodes.forEach(n => {
        // 원
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 이름
        ctx.fillStyle = '#111';
        ctx.font = `${Math.max(9, n.r * 0.7)}px 'Pretendard Variable', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.name, n.x, n.y + n.r + 3);
    });

    ctx.restore();
}

function calcMaxDepth(nodes, edges, codeToId, idToNode) {
    const parentMap = {};
    edges.forEach(e => { parentMap[e.to] = e.from; });
    let max = 0;
    nodes.forEach(n => {
        let depth = 0, cur = n.id;
        while (parentMap[cur]) { cur = parentMap[cur]; depth++; if (depth > 50) break; }
        if (depth > max) max = depth;
    });
    return max;
}

document.getElementById('admin-login-overlay').addEventListener('click', function(e) { if(e.target===this) closeAdminModal(); });
document.getElementById('admin-detail-overlay').addEventListener('click', function(e) { if(e.target===this) closeAdminDetail(); });
// ESC로 모달 닫기 + 관리자 단축키
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (document.getElementById('admin-detail-overlay').classList.contains('open')) closeAdminDetail();
        else if (document.getElementById('admin-login-overlay').classList.contains('open')) closeAdminModal();
        else if (document.getElementById('matching-overlay').classList.contains('open')) closeMatchingView();
        else if (document.getElementById('lightbox-overlay').classList.contains('open')) closeLightbox();
        else if (document.getElementById('chat-viewer-overlay')?.style.display === 'flex') closeChatViewer();
        else if (document.getElementById('reports-viewer-overlay')?.style.display === 'flex') closeReportsModal();
        return;
    }
    // 입력 필드에선 단축키 비활성
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    // 관리자 화면에서만 단축키
    const adminScreen = document.getElementById('screen-admin');
    if (!adminScreen || !adminScreen.classList.contains('active')) return;
    const detailOpen = document.getElementById('admin-detail-overlay').classList.contains('open');

    if (e.key === '/') {
        const searchEl = document.getElementById('admin-search');
        if (searchEl) { e.preventDefault(); switchAdminTab('applicants'); setTimeout(() => searchEl.focus(), 100); }
        return;
    }
    if (e.key === '?') { alert('관리자 단축키:\n1~5 : 탭 전환 (홈·신청자·매칭·문의·설정)\n/ : 검색 포커스\nR : 새로고침\nEsc : 모달 닫기\n\n상세 모달 열린 상태:\nA : 승인, X : 거절'); return; }
    if (e.key === 'r' || e.key === 'R') { if (!detailOpen) renderAdmin(); return; }
    // 1~5: 메인 탭 전환
    const tabMap = {'1':'home','2':'applicants','3':'matching','4':'inquiries','5':'settings'};
    if (tabMap[e.key] && !detailOpen) { switchAdminTab(tabMap[e.key]); return; }

    // 상세 모달에서 A(승인), X(거절)
    if (detailOpen) {
        if (e.key === 'a' || e.key === 'A') {
            const btn = document.querySelector('#admin-detail-overlay .btn-approve, #admin-detail-overlay [onclick*="approved"]');
            if (btn) btn.click();
        } else if (e.key === 'x' || e.key === 'X') {
            const btn = document.querySelector('#admin-detail-overlay .btn-reject, #admin-detail-overlay [onclick*="rejected"]');
            if (btn) btn.click();
        }
    }
});

// ── 프로필 데이터로 폼 채우기 (DB 조회 없이) ──
async function prefillFromData(p) {
    if (!p || !p.name) return false;
    return _doPrefill(p);
}

// ── DB에서 기존 신청서 데이터 prefill ──
async function prefillRegisterForm(userId) {
    const { data } = await db.from('applicants').select('*').eq('user_id', userId).limit(1);
    if (!data || !data.length) return false;
    const p = data[0];
    return _doPrefill(p);
}

function _doPrefill(p) {
    if (p.gender) selectGender(p.gender);
    const fields = [
        ['reg-name', p.name], ['reg-birth', p.birth ? p.birth.replace(/-/g, '.') : null], ['reg-job', normalizeJobCategory(p.job_category || p.job)],
        ['reg-height', p.height], ['reg-location', p.location], ['reg-mbti', p.mbti],
        ['reg-kakao', p.kakao], ['reg-intro', p.intro], ['reg-contact', p.contact],
        ['reg-referral', p.referral], ['reg-education', p.education],
        ['reg-smoking', p.smoking], ['reg-drinking', p.drinking],
        ['reg-religion', p.religion], ['reg-company', p.company], ['reg-job-title', p.job_title],
        ['reg-hobby', p.hobby],
    ];
    fields.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val != null) el.value = val;
    });
    // 추천인 코드 프리필 (수정 시 표시용)
    if (p.referred_by) {
        const refCodeEl = document.getElementById('reg-referral-code');
        if (refCodeEl) refCodeEl.value = p.referred_by;
    }
    if (p.icebreaker) {
        try {
            const ib = JSON.parse(p.icebreaker);
            document.getElementById('reg-icebreaker-q').value = ib.q || '';
            document.getElementById('reg-icebreaker-a').value = ib.a || '';
        } catch {}
    }
    if (p.ideal) {
        // 본인 성별에 맞는 키 옵션으로 빌드
        document.getElementById('ideal-chips').innerHTML = buildIdealChipsHtml('reg', p.ideal, p.gender);
        document.getElementById('reg-ideal-memo').value = getIdealMemo(p.ideal);
        // 점수 이벤트 재연결 (중복 방지: 기존 리스너 제거 후 등록)
        SCORE_BASIC.forEach(id => { const el = document.getElementById(id); if (el) { el.removeEventListener('input', updateScoreBar); el.addEventListener('input', updateScoreBar); } });
    } else if (p.gender) {
        // ideal 없지만 성별 있음 → 키 옵션이라도 성별 기반으로
        document.getElementById('ideal-chips').innerHTML = buildIdealChipsHtml('reg', null, p.gender);
    }
    // 기존 사진 프리필
    if (p.photos && p.photos.length > 0) {
        p.photos.forEach((photoUrl, i) => {
            if (i >= 3 || !photoUrl) return;
            const preview = document.getElementById(`photo-preview-${i}`);
            if (preview) {
                preview.src = photoUrl;
                preview.style.display = 'block';
                document.getElementById(`photo-ph-${i}`).style.display = 'none';
                document.getElementById(`photo-slot-${i}`).classList.add('has-photo');
                const rmBtn = document.getElementById(`photo-rm-${i}`);
                if (rmBtn) rmBtn.style.display = 'block';
            }
        });
        // 사진 변경 안 하면 기존 사진 유지하도록 마커 설정
        window._existingPhotos = p.photos;
    }
    updateScoreBar();
    return true; // 데이터 prefill 완료
}

// ── 세션 복원 (새로고침) ──
window.addEventListener('DOMContentLoaded', async () => {
    // ?ref=CODE URL 파라미터 → 로컬스토리지에 임시 저장 → 신청서에 자동 prefill
    try {
        const urlParams = new URLSearchParams(location.search);
        const refParam = urlParams.get('ref');
        if (refParam) {
            localStorage.setItem('bj_pending_ref_code', refParam.toUpperCase());
            // URL cleanup
            const cleanUrl = location.pathname + location.hash;
            history.replaceState({}, '', cleanUrl);
        }
    } catch(e) {}

    const role   = localStorage.getItem('kj_role');
    const screen = localStorage.getItem('kj_screen') || (role === 'admin' ? 'admin' : 'home');
    const filter = localStorage.getItem('kj_filter') || 'all';

    // 프로필 수정 진입 (localStorage에서 프로필 데이터 직접 수신)
    const { data: { session } } = await db.auth.getSession();
    const editData = localStorage.getItem('bj_edit_profile');
    if (session && (location.hash === '#register' || editData)) {
        localStorage.removeItem('bj_edit_profile');
        saveSession(role || 'viewer', 'register');
        // localStorage에 프로필 JSON이 있으면 직접 prefill (DB 의존 제거)
        let prefilled = false;
        try {
            if (editData && editData !== '1' && editData.startsWith('{')) {
                const p = JSON.parse(editData);
                prefilled = await prefillFromData(p);
            }
            if (!prefilled) {
                prefilled = await prefillRegisterForm(session.user.id);
            }
        } catch(e) { console.error('prefill error:', e); }
        _skipRegisterReset = true; // 무조건 리셋 방지
        showScreen('register');
        return;
    }

    // 관리자 세션 복원
    if (role === 'admin') {
        currentAdminFilter = filter;
        _historyNav = true; showScreen('admin'); _historyNav = false;
        history.replaceState({ screen: 'admin' }, '', location.pathname);
        return;
    }

    // Supabase Auth 세션 확인
    if (session) {
        // 신청서 유무 확인
        let profileName = null;
        try {
            const { data: existing } = await db.from('applicants').select('id,name').eq('user_id', session.user.id).limit(1);
            if (existing && existing.length > 0) profileName = existing[0].name;
        } catch(e) {}

        if (!profileName) {
            // 신청서 없음 → 바로 신청서 작성 화면
            saveSession('viewer', 'register');
            showScreen('register');
            return;
        }

        // 신청서 있음 → 환영 화면
        const loginCard = document.getElementById('auth-invite');
        loginCard.innerHTML = `
            <div class="login-logo"><img src="icons/icon-192.png" style="width:72px;height:72px;border-radius:16px;"></div>
            <div class="login-title" style="margin-top:12px;line-height:1.5;">${esc(profileName)}님,<br>안녕하세요!</div>
            <div class="login-sub" style="margin-bottom:28px;">오늘도 반쪽을 찾으러 오셨군요</div>
            <button class="btn btn-primary" onclick="window.location.href='dashboard.html'" style="margin-bottom:12px;width:100%;max-width:280px;">
                <i class="fa-solid fa-heart"></i>&nbsp; 반쪽 찾으러 가기
            </button>
            <button class="btn btn-outline" onclick="db.auth.signOut().then(()=>{clearSession();location.reload();});" style="width:100%;max-width:280px;">
                다른 계정으로 로그인
            </button>
        `;
        showScreen('login');
        history.replaceState({ screen: 'login' }, '', location.pathname);
        return;
    }

    showAuthView('invite');
    history.replaceState({ screen: 'login' }, '', location.pathname);
});

// ── 뒤로가기/앞으로가기 ──
window.addEventListener('popstate', e => {
    const role   = localStorage.getItem('kj_role');
    const target = e.state?.screen || 'login';

    if (!role) {
        _historyNav = true; showScreen('login'); _historyNav = false;
        return;
    }
    if (target === 'login') {
        // 로그인 상태에서 로그인 화면으로 뒤로가기 방지
        history.go(1);
        return;
    }
    _historyNav = true; showScreen(target); _historyNav = false;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ── PWA 설치 스플래시 ──
let _deferredInstallPrompt = null;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const _splashKey = 'pwa-splash-seen';
const _ua = navigator.userAgent;
const _isIOS = /iPhone|iPad|iPod/.test(_ua);
const _isAndroid = /Android/.test(_ua);
// 인앱 브라우저 감지 (카카오톡, 인스타, 페이스북, 라인, 네이버 등)
const _isInApp = /KAKAOTALK|Instagram|FBAN|FBAV|Line|NAVER/i.test(_ua);

if (!_isStandalone && !sessionStorage.getItem(_splashKey)) {
    const splash = document.getElementById('install-splash');
    splash.classList.remove('hidden');

    if (_isIOS) {
        // iOS: 인앱 브라우저 vs Safari 분기
        document.getElementById('splash-ios-guide').style.display = 'block';
        if (_isInApp) {
            document.getElementById('splash-ios-step-inapp').style.display = 'block';
        } else {
            document.getElementById('splash-ios-step-safari').style.display = 'block';
        }
    } else if (_isAndroid && _isInApp) {
        // Android 인앱 브라우저: beforeinstallprompt 안 뜰 수 있음 → 가이드 표시
        document.getElementById('splash-android-guide').style.display = 'block';
    }
    // Android Chrome / PC Chrome: beforeinstallprompt 이벤트로 설치 버튼 표시 (아래에서 처리)
}

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    const btn = document.getElementById('splash-install-btn');
    if (btn) {
        btn.style.display = 'block';
        // beforeinstallprompt가 뜨면 수동 가이드는 숨김
        const ag = document.getElementById('splash-android-guide');
        if (ag) ag.style.display = 'none';
    }
});
window.addEventListener('appinstalled', () => { splashDismiss(); });

async function splashInstall() {
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    const result = await _deferredInstallPrompt.userChoice;
    _deferredInstallPrompt = null;
    splashDismiss();
}
function splashDismiss() {
    sessionStorage.setItem(_splashKey, '1');
    const splash = document.getElementById('install-splash');
    splash.style.opacity = '0';
    splash.style.transition = 'opacity .3s ease';
    setTimeout(() => splash.classList.add('hidden'), 300);
}

// ── 스크롤 시 navbar 글래스모피즘 ──
document.addEventListener('scroll', () => {
    document.querySelectorAll('.navbar').forEach(nav => {
        nav.classList.toggle('scrolled', window.scrollY > 10);
    });
}, { passive: true });
