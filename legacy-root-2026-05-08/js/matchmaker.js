'use strict';

// ══════════════════════════════════════
//  반쪽 — 주선자 대시보드 로직
// ══════════════════════════════════════

let myProfile = null;
let myParticipants = [];
let myIntroductions = [];
let allApproved = [];
let proposing = false; // double-submit guard

// ── 탭 전환 ──
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    const content = document.getElementById('tab-' + tab);
    const btn = document.getElementById('tab-btn-' + tab);
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tab === 'participants') loadParticipants();
    if (tab === 'introduce') loadIntroduceTab();
    if (tab === 'history') loadHistory();
    if (tab === 'my') renderMyTab();
}

// ── 초기화 ──
async function init() {
    setLoading(true);
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) { window.location.href = 'index.html'; return; }

        document.getElementById('user-email').textContent = user.email || '';

        // 프로필 로드
        const { data: profile } = await db.from('applicants')
            .select('*')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (!profile) { window.location.href = 'index.html'; return; }

        // 주선 권한 확인
        const hasAccess = await canManageIntros(profile);
        if (!hasAccess) {
            window.location.href = 'dashboard.html';
            return;
        }

        myProfile = profile;
        document.getElementById('my-referral-code').textContent = profile.referral_code || '-';

        // 참가자 역할이면 참가자 대시보드 링크 표시
        if (profile.role === 'participant') {
            document.getElementById('link-participant-dashboard').style.display = '';
        }

        await loadParticipants();
        // MY탭 데이터를 위해 소개 이력 미리 로드 (렌더링 없이)
        const { data: introData } = await db.from('introductions')
            .select('*')
            .eq('matchmaker_id', myProfile.id)
            .order('created_at', { ascending: false });
        myIntroductions = introData || [];
        loadNotifications();
    } catch (e) {
        console.error('init error:', e);
        toast('초기화 중 오류가 발생했어요.');
    } finally {
        setLoading(false);
    }
}

// ── 로딩 ──
function setLoading(on) {
    document.getElementById('loading-overlay').style.display = on ? 'flex' : 'none';
}

// ── 추천 참가자 목록 로드 ──
let loadingParticipants = false;
async function loadParticipants() {
    if (loadingParticipants) return;
    loadingParticipants = true;
    try {
    const { data, error } = await db.from('applicants')
        .select('id,name,gender,birth,photos,status,role,job,location,mbti,height,referred_by,referral_code')
        .eq('referred_by', myProfile.referral_code)
        .order('created_at', { ascending: false });

    if (error) { console.error('loadParticipants:', error); return; }
    myParticipants = data || [];

    const container = document.getElementById('participants-list');
    const countEl = document.getElementById('participant-count');
    countEl.textContent = myParticipants.length + '명';

    if (myParticipants.length === 0) {
        container.innerHTML = '<div class="empty-state">추천한 참가자가 없습니다.<br>추천 코드를 공유해보세요!</div>';
        return;
    }

    container.innerHTML = myParticipants.map(p => {
        const age = calcAge(p.birth);
        const photo = p.photos && p.photos.length > 0 ? p.photos[0] : null;
        const statusBadge = {
            'approved': '<span class="badge badge-green">승인됨</span>',
            'pending': '<span class="badge badge-yellow">심사중</span>',
            'pending_reputation': '<span class="badge badge-gray">평판대기</span>',
            'matched': '<span class="badge badge-pink">매칭됨</span>',
            'rejected': '<span class="badge badge-red">거절됨</span>',
        }[p.status] || '';
        const genderIcon = p.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>'
            : p.gender === 'female' ? '<i class="fa-solid fa-venus" style="color:#FF6B6B;"></i>' : '';

        return `<div class="participant-row">
            <div class="participant-photo">${photo ? `<img src="${esc(photo)}" alt="">` : '<i class="fa-solid fa-user" style="color:#d1d5db;font-size:1.2em;"></i>'}</div>
            <div class="participant-info">
                <div class="participant-name">${esc(p.name)} ${genderIcon} ${age ? `<span style="color:var(--muted);font-size:.82em;">${age}세</span>` : ''}</div>
                <div class="participant-detail">${esc(p.job || '')} ${p.location ? '· ' + esc(p.location) : ''}</div>
            </div>
            <div class="participant-status">${statusBadge}</div>
        </div>`;
    }).join('');
    } finally { loadingParticipants = false; }
}

// ── 소개하기 탭 ──
let todayIntroducedIds = new Set(); // 오늘 이미 소개한 참가자 ID
let loadingIntroduce = false; // 중복 로드 방지

async function loadIntroduceTab() {
    if (loadingIntroduce) return;
    loadingIntroduce = true;
    try { await _loadIntroduceTabInner(); } finally { loadingIntroduce = false; }
}

async function _loadIntroduceTabInner() {
    const myApproved = myParticipants.filter(p => p.status === 'approved' && p.role !== 'matchmaker');

    // 기존 안내 메시지 항상 제거 (중복 삽입 방지)
    const oldMsg = document.getElementById('no-approved-msg');
    if (oldMsg) oldMsg.remove();

    // 승인된 참가자가 없으면 안내 메시지 표시
    if (myApproved.length === 0) {
        document.getElementById('recommendations').innerHTML = '';
        document.getElementById('intro-note-area').style.display = 'none';
        document.getElementById('daily-limit').textContent = '';
        document.getElementById('pick-person-a').innerHTML = '<option value="">선택...</option>';
        document.getElementById('intro-form').insertAdjacentHTML('afterbegin',
            '<div class="empty-state" id="no-approved-msg">아직 소개할 수 있는 참가자가 없습니다.<br>추천한 참가자가 승인되면 소개를 시작할 수 있어요.</div>');
        return;
    }

    // 로딩 표시
    document.getElementById('recommendations').innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div></div>';

    // 전체 approved 참가자 로드 (기본정보 + 사진)
    const { data: allData } = await db.from('applicants')
        .select('id,name,gender,birth,photos,job,location,mbti,height,referred_by,user_id,ideal,ideal_weights,look_score,job_category,religion')
        .eq('status', 'approved')
        .neq('role', 'matchmaker')
        .neq('id', myProfile.id);
    allApproved = allData || [];

    // 오늘 이미 소개한 참가자 확인
    const todayStart = new Date(new Date().setHours(0,0,0,0)).toISOString();
    const { data: todayIntros } = await db.from('introductions')
        .select('person_a_id,person_b_id')
        .eq('matchmaker_id', myProfile.id)
        .gte('created_at', todayStart);
    // 인당 오늘 소개 횟수 카운트
    todayIntroducedIds = new Set();
    todayIntroducedIds._counts = {};
    (todayIntros || []).forEach(i => {
        todayIntroducedIds.add(i.person_a_id);
        todayIntroducedIds.add(i.person_b_id);
        todayIntroducedIds._counts[i.person_a_id] = (todayIntroducedIds._counts[i.person_a_id] || 0) + 1;
        todayIntroducedIds._counts[i.person_b_id] = (todayIntroducedIds._counts[i.person_b_id] || 0) + 1;
    });

    // 드롭다운: 내 풀 approved 참가자만 (인당 제한 초과 시 disabled)
    const dailyLimitVal = myProfile.intro_daily_limit || 1;
    const selectA = document.getElementById('pick-person-a');
    selectA.innerHTML = '<option value="">선택...</option>' + myApproved.map(p => {
        const age = calcAge(p.birth);
        const g = p.gender === 'male' ? '남' : p.gender === 'female' ? '여' : '';
        const cnt = todayIntroducedIds._counts[p.id] || 0;
        const done = cnt >= dailyLimitVal;
        return `<option value="${p.id}" ${done ? 'disabled' : ''}>${esc(p.name)} (${g}${age ? ', ' + age + '세' : ''})${done ? ' - 오늘 ' + cnt + '/' + dailyLimitVal + '완료' : ''}</option>`;
    }).join('');

    // 일일 현황 (tier별 인당 제한 반영)
    const dailyLimit = myProfile.intro_daily_limit || 1;
    const usedCount = (todayIntros || []).length;
    const maxCount = myApproved.length * dailyLimit;
    const tierLabel = { beginner: '초보 주선자', skilled: '실력파 주선자', golden: '골든 주선자' }[myProfile.matchmaker_tier] || '';
    document.getElementById('daily-limit').textContent = `오늘 ${usedCount}/${maxCount}건 소개 (인당 ${dailyLimit}회/일)${tierLabel ? ' · ' + tierLabel : ''}`;

    // 추천 영역 초기화
    document.getElementById('recommendations').innerHTML = '';
    document.getElementById('intro-note-area').style.display = 'none';
}

// ── 추천 상대 3명 표시 ──
function showRecommendations() {
    const aId = document.getElementById('pick-person-a').value;
    const recsEl = document.getElementById('recommendations');
    const noteArea = document.getElementById('intro-note-area');

    if (!aId) {
        recsEl.innerHTML = '';
        noteArea.style.display = 'none';
        return;
    }

    const personA = myParticipants.find(p => p.id === aId);
    if (!personA) return;

    // 인당 일일 제한 체크 (tier별 동적)
    const dailyLimit = myProfile.intro_daily_limit || 1;
    const todayCountForA = (todayIntroducedIds._counts || {})[aId] || 0;
    if (todayCountForA >= dailyLimit) {
        recsEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:.85em;">오늘 이 참가자의 소개 한도를 채웠습니다. (' + todayCountForA + '/' + dailyLimit + ')</div>';
        noteArea.style.display = 'none';
        return;
    }

    const oppositeGender = personA.gender === 'male' ? 'female' : 'male';

    // 이성 필터 + 점수 계산 + 정렬 → 상위 3명
    const candidates = allApproved
        .filter(c => c.gender === oppositeGender && c.id !== aId)
        .map(c => {
            const s1 = calcMatchScore(personA, c);
            const s2 = calcMatchScore(c, personA);
            return { ...c, _score: Math.round((s1 + s2) / 2) };
        })
        .sort((a, b) => b._score - a._score)
        .slice(0, myProfile.intro_rec_count || 3);

    if (candidates.length === 0) {
        recsEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:.85em;">추천할 이성 참가자가 없습니다.</div>';
        noteArea.style.display = 'none';
        return;
    }

    // 카드 렌더링
    recsEl.innerHTML = '<div class="rec-header"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i> ' + esc(personA.name) + '님에게 어울리는 상대</div>'
        + candidates.map((c, i) => {
            const age = calcAge(c.birth);
            const photo = c.photos && c.photos.length > 0 ? c.photos[0] : null;
            const rank = ['🥇', '🥈', '🥉'][i] || '';
            return `<div class="rec-card">
                <div class="rec-card-photo">
                    ${photo ? `<img src="${esc(photo)}" alt="">` : '<i class="fa-solid fa-user" style="color:#d1d5db;font-size:1.2em;"></i>'}
                </div>
                <div class="rec-card-info">
                    <div class="rec-card-name">${rank} ${esc(c.name)}</div>
                    <div class="rec-card-detail">${age ? age + '세' : ''} ${c.job ? '· ' + esc(c.job) : ''} ${c.location ? '· ' + esc(c.location) : ''}</div>
                    <div class="rec-card-sub">${c.mbti || ''} ${c.height ? '· ' + c.height + 'cm' : ''}</div>
                </div>
                <div class="rec-card-action">
                    <div class="rec-card-score">${c._score}%</div>
                    <button class="btn btn-primary rec-card-btn" onclick="event.stopPropagation();proposeIntroduction('${aId}','${c.id}')">
                        <i class="fa-solid fa-paper-plane"></i> 소개하기
                    </button>
                </div>
            </div>`;
        }).join('');

    noteArea.style.display = '';
}

// ── 소개 제안 ──
async function proposeIntroduction(aId, bId) {
    if (proposing) return; // double-submit guard
    proposing = true;

    const note = document.getElementById('intro-note').value.trim() || null;

    if (!aId || !bId) {
        toast('소개할 참가자를 선택해주세요.');
        proposing = false;
        return;
    }

    // 모든 소개하기 버튼 비활성화
    document.querySelectorAll('.rec-card button').forEach(b => { b.disabled = true; b.textContent = '제안 중...'; });

    try {
        const { data: introId, error } = await db.rpc('propose_introduction', {
            p_person_a_id: aId,
            p_person_b_id: bId,
            p_note: note
        });

        if (error) throw error;

        // 양쪽에 알림 발송
        const a = allApproved.find(p => p.id === aId);
        const b = allApproved.find(p => p.id === bId);
        const dashUrl = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html#tab-interest';

        const notifRows = [];
        if (a?.user_id) notifRows.push({
            user_id: a.user_id,
            type: 'introduction_proposed',
            title: '소개가 도착했어요!',
            body: `${esc(myProfile.name)}님이 ${esc(b.name)}님을 소개해드려요. 확인해보세요!`,
            related_id: introId
        });
        if (b?.user_id) notifRows.push({
            user_id: b.user_id,
            type: 'introduction_proposed',
            title: '소개가 도착했어요!',
            body: `${esc(myProfile.name)}님이 ${esc(a.name)}님을 소개해드려요. 확인해보세요!`,
            related_id: introId
        });
        if (notifRows.length > 0) {
            await db.from('notifications').insert(notifRows);
        }

        try {
            if (a?.user_id) await sendPushNotifSimple(a.user_id, '소개가 도착했어요!', `${myProfile.name}님이 소개를 제안했어요.`, dashUrl);
            if (b?.user_id) await sendPushNotifSimple(b.user_id, '소개가 도착했어요!', `${myProfile.name}님이 소개를 제안했어요.`, dashUrl);
        } catch (e) { console.log('push error:', e.message); }

        toast('소개를 제안했습니다!', 'success');
        document.getElementById('pick-person-a').value = '';
        document.getElementById('intro-note').value = '';
        document.getElementById('recommendations').innerHTML = '';
        document.getElementById('intro-note-area').style.display = 'none';
        loadIntroduceTab();
    } catch (e) {
        console.error('proposeIntroduction:', e);
        const msg = e.message || '소개 제안 실패';
        if (msg.includes('already introduced')) toast('오늘 이미 이 참가자를 소개했습니다.', 'warning');
        else if (msg.includes('active introduction')) toast('이미 활성 소개가 있는 쌍입니다.', 'warning');
        else if (msg.includes('not in your referral') || msg.includes('at least one participant')) toast('최소 1명은 내 네트워크 참가자여야 합니다.', 'warning');
        else if (msg.includes('already matched')) toast('이미 매칭된 참가자입니다.', 'warning');
        else toast(msg, 'error');
    } finally {
        proposing = false;
        document.querySelectorAll('.rec-card button').forEach(b => { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 소개하기'; });
    }
}

// ── 소개 현황 로드 ──
async function loadHistory() {
    const { data, error } = await db.from('introductions')
        .select('*')
        .eq('matchmaker_id', myProfile.id)
        .order('created_at', { ascending: false });

    if (error) { console.error('loadHistory:', error); return; }
    myIntroductions = data || [];

    const container = document.getElementById('history-list');
    const countEl = document.getElementById('history-count');
    countEl.textContent = myIntroductions.length + '건';

    if (myIntroductions.length === 0) {
        container.innerHTML = '<div class="empty-state">아직 소개한 내역이 없습니다.</div>';
        return;
    }

    // 통계 요약
    const matched = myIntroductions.filter(i => i.status === 'matched').length;
    const declined = myIntroductions.filter(i => i.status === 'declined').length;
    const pending = myIntroductions.filter(i => i.status === 'proposed').length;
    const expired = myIntroductions.filter(i => i.status === 'expired').length;
    const rate = myIntroductions.length > 0 ? Math.round((matched / myIntroductions.length) * 100) : 0;

    const statsHtml = `<div class="stat-cards">
        <div class="stat-card stat-card--success">
            <div class="stat-card-value">${matched}</div>
            <div class="stat-card-label">성사</div>
        </div>
        <div class="stat-card stat-card--pending">
            <div class="stat-card-value">${pending}</div>
            <div class="stat-card-label">대기중</div>
        </div>
        <div class="stat-card stat-card--failed">
            <div class="stat-card-value">${declined + expired}</div>
            <div class="stat-card-label">불발</div>
        </div>
        <div class="stat-card stat-card--rate">
            <div class="stat-card-value">${rate}%</div>
            <div class="stat-card-label">성공률</div>
        </div>
    </div>`;

    // 참가자 이름 조회
    const personIds = [...new Set(myIntroductions.flatMap(i => [i.person_a_id, i.person_b_id]))];
    const { data: persons } = await db.from('applicants')
        .select('id,name,gender,photos')
        .in('id', personIds);
    const personMap = {};
    (persons || []).forEach(p => personMap[p.id] = p);

    container.innerHTML = statsHtml + myIntroductions.map(intro => {
        const a = personMap[intro.person_a_id] || {};
        const b = personMap[intro.person_b_id] || {};
        const statusInfo = {
            'proposed': { label: '응답 대기중', color: '#f59e0b', icon: 'fa-hourglass-half' },
            'matched': { label: '매칭 성사!', color: '#10b981', icon: 'fa-heart' },
            'declined': { label: '불발', color: '#ef4444', icon: 'fa-xmark' },
            'expired': { label: '만료됨', color: '#9ca3af', icon: 'fa-clock' },
        }[intro.status] || { label: intro.status, color: '#6b7280', icon: 'fa-question' };

        const aStatus = intro.a_response === 'yes' ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>'
            : intro.a_response === 'no' ? '<i class="fa-solid fa-xmark" style="color:#ef4444;"></i>'
            : '<i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i>';
        const bStatus = intro.b_response === 'yes' ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>'
            : intro.b_response === 'no' ? '<i class="fa-solid fa-xmark" style="color:#ef4444;"></i>'
            : '<i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i>';

        const dateStr = new Date(intro.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

        const isMatched = intro.status === 'matched';
        return `<div class="history-row${isMatched ? ' history-row--matched' : ''}">
            <div class="history-pair">
                <span class="history-name">${esc(a.name || '?')}</span>
                ${aStatus}
                <i class="fa-solid ${isMatched ? 'fa-heart' : 'fa-arrows-left-right'}" style="color:${isMatched ? '#FF6B6B' : '#d1d5db'};font-size:.7em;margin:0 4px;"></i>
                ${bStatus}
                <span class="history-name">${esc(b.name || '?')}</span>
            </div>
            <div class="history-meta">
                <span class="history-status" style="color:${statusInfo.color};"><i class="fa-solid ${statusInfo.icon}"></i> ${statusInfo.label}</span>
                <span style="color:var(--muted);font-size:.75em;">${dateStr}</span>
            </div>
            ${intro.matchmaker_note ? `<div class="history-note">${esc(intro.matchmaker_note)}</div>` : ''}
        </div>`;
    }).join('');
}

// ── MY 탭 ──
function renderMyTab() {
    const el = document.getElementById('my-profile-info');
    if (!myProfile) return;

    const tier = myProfile.matchmaker_tier;
    const successCount = myProfile.intro_success_count || 0;
    const tierBadge = tier === 'golden'
        ? '<span class="badge badge-gold"><i class="fa-solid fa-crown"></i> 골든 주선자</span>'
        : tier === 'skilled'
        ? '<span class="badge badge-purple"><i class="fa-solid fa-star"></i> 실력파 주선자</span>'
        : tier === 'beginner'
        ? '<span class="badge badge-green"><i class="fa-solid fa-seedling"></i> 초보 주선자</span>'
        : '';

    // 성공률 계산
    const totalIntros = myIntroductions ? myIntroductions.length : 0;
    const successRate = totalIntros > 0 ? Math.round((successCount / totalIntros) * 100) : 0;

    // 다음 tier까지 남은 횟수
    const nextTier = tier === 'golden' ? null : tier === 'skilled' ? { name: '골든', need: 5 } : tier === 'beginner' ? { name: '실력파', need: 3 } : { name: '초보', need: 1 };
    const remaining = nextTier ? nextTier.need - successCount : 0;

    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-weight:800;font-size:1.1em;">${esc(myProfile.name)}</div>
            <div style="font-size:.85em;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                ${myProfile.role === 'matchmaker' ? '<span class="badge badge-green"><i class="fa-solid fa-handshake-angle"></i> 소개자</span>' : '<span class="badge badge-purple"><i class="fa-solid fa-user"></i> 참가자 + 주선자</span>'}
                ${tierBadge}
            </div>
            ${successCount > 0 ? `<div style="font-size:.85em;color:var(--muted);">소개 성사: <strong>${successCount}쌍</strong>${totalIntros > 0 ? ` (성공률 ${successRate}%)` : ''}</div>` : ''}
            ${nextTier && remaining > 0 ? `<div style="font-size:.78em;color:#FF6B6B;">${nextTier.name} 주선자까지 ${remaining}회 성사 남음</div>` : ''}
            <div style="font-size:.85em;color:var(--muted);">추천 코드: <strong>${esc(myProfile.referral_code)}</strong></div>
            <div style="font-size:.85em;color:var(--muted);">추천한 참가자: <strong>${myParticipants.length}명</strong></div>
            <div style="font-size:.78em;color:var(--muted);">일일 소개: 인당 ${myProfile.intro_daily_limit || 1}회 · 추천 후보 ${myProfile.intro_rec_count || 3}명</div>
        </div>
    `;
}

// ── 추천 코드 복사 ──
function copyReferralCode() {
    const code = myProfile?.referral_code;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        toast('추천 코드가 복사되었습니다!', 'success');
    }).catch(() => {
        // 클립보드 API 실패 시 폴백
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        toast('추천 코드가 복사되었습니다!', 'success');
    });
}

// ── 알림 ──
async function loadNotifications() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    const { data } = await db.from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
    const notifs = data || [];
    const unread = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    badge.style.display = unread > 0 ? '' : 'none';
    badge.textContent = unread;

    const list = document.getElementById('notif-list');
    if (notifs.length === 0) {
        list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:.85em;">알림이 없습니다.</div>';
        return;
    }
    list.innerHTML = notifs.map(n => {
        const time = new Date(n.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<div class="notif-item${n.is_read ? '' : ' unread'}" onclick="markRead('${n.id}')">
            <div style="font-weight:${n.is_read ? 500 : 700};font-size:.88em;">${esc(n.title || '')}</div>
            <div style="font-size:.8em;color:var(--muted);margin-top:2px;">${esc(n.body || '')}</div>
            <div style="font-size:.7em;color:#bbb;margin-top:4px;">${time}</div>
        </div>`;
    }).join('');
}

async function markRead(id) {
    await db.from('notifications').update({ is_read: true }).eq('id', id);
    loadNotifications();
}

async function markAllRead() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    await db.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    loadNotifications();
}

function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-backdrop');
    const open = panel.classList.toggle('open');
    backdrop.style.display = open ? '' : 'none';
}

function closeNotifPanel() {
    document.getElementById('notif-panel').classList.remove('open');
    document.getElementById('notif-backdrop').style.display = 'none';
}

// ── 푸시 알림 (간단 버전) ──
async function sendPushNotifSimple(userId, title, body, url) {
    const { data: subs } = await db.from('push_subscriptions')
        .select('subscription')
        .eq('user_id', userId);
    if (!subs || subs.length === 0) return;
    try {
        await db.functions.invoke('send-push', {
            body: { subscriptions: subs.map(s => s.subscription), title, body, url }
        });
    } catch (e) { console.log('push send error:', e.message); }
}

// ── 로그아웃 ──
async function doLogout() {
    await db.auth.signOut();
    localStorage.removeItem('kj_role');
    localStorage.removeItem('kj_screen');
    window.location.href = 'index.html';
}

// ── 시작 ──
document.addEventListener('DOMContentLoaded', init);
