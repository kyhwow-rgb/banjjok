'use strict';

// ══════════════════════════════════════
//  반쪽 — 주선자 대시보드 로직
// ══════════════════════════════════════

let myProfile = null;
let myParticipants = [];
let myIntroductions = [];

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
async function loadParticipants() {
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
            : p.gender === 'female' ? '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>' : '';

        return `<div class="participant-row">
            <div class="participant-photo">${photo ? `<img src="${esc(photo)}" alt="">` : '<i class="fa-solid fa-user" style="color:#d1d5db;font-size:1.2em;"></i>'}</div>
            <div class="participant-info">
                <div class="participant-name">${esc(p.name)} ${genderIcon} ${age ? `<span style="color:var(--muted);font-size:.82em;">${age}세</span>` : ''}</div>
                <div class="participant-detail">${esc(p.job || '')} ${p.location ? '· ' + esc(p.location) : ''}</div>
            </div>
            <div class="participant-status">${statusBadge}</div>
        </div>`;
    }).join('');
}

// ── 소개하기 탭 ──
async function loadIntroduceTab() {
    // 승인된 참가자만 소개 가능
    const approved = myParticipants.filter(p => p.status === 'approved');
    const selectA = document.getElementById('pick-person-a');
    const selectB = document.getElementById('pick-person-b');

    const options = '<option value="">선택...</option>' +
        approved.map(p => {
            const age = calcAge(p.birth);
            const gLabel = p.gender === 'male' ? '남' : p.gender === 'female' ? '여' : '';
            return `<option value="${p.id}">${esc(p.name)} (${gLabel}${age ? ', ' + age + '세' : ''})</option>`;
        }).join('');

    selectA.innerHTML = options;
    selectB.innerHTML = options;

    // 일일 사용량
    const { count } = await db.from('introductions')
        .select('id', { count: 'exact', head: true })
        .eq('matchmaker_id', myProfile.id)
        .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
    document.getElementById('daily-limit').textContent = `오늘 ${count || 0}/10 소개 사용`;

    updateMatchPreview();
}

// ── 매칭 점수 미리보기 ──
function updateMatchPreview() {
    const aId = document.getElementById('pick-person-a').value;
    const bId = document.getElementById('pick-person-b').value;
    const preview = document.getElementById('match-preview');
    const btn = document.getElementById('propose-btn');

    if (!aId || !bId || aId === bId) {
        preview.style.display = 'none';
        btn.disabled = true;
        return;
    }

    const a = myParticipants.find(p => p.id === aId);
    const b = myParticipants.find(p => p.id === bId);
    if (!a || !b) { preview.style.display = 'none'; btn.disabled = true; return; }

    const score = calcMatchScore(a, b);
    const reverseScore = calcMatchScore(b, a);
    const avg = Math.round((score + reverseScore) / 2);

    document.getElementById('match-preview-score').textContent = avg + '%';
    preview.style.display = '';
    btn.disabled = false;
}

// ── 소개 제안 ──
async function proposeIntroduction() {
    const aId = document.getElementById('pick-person-a').value;
    const bId = document.getElementById('pick-person-b').value;
    const note = document.getElementById('intro-note').value.trim() || null;

    if (!aId || !bId || aId === bId) {
        toast('두 사람을 선택해주세요.');
        return;
    }

    const btn = document.getElementById('propose-btn');
    btn.disabled = true;
    btn.textContent = '제안 중...';

    try {
        const { data: introId, error } = await db.rpc('propose_introduction', {
            p_person_a_id: aId,
            p_person_b_id: bId,
            p_note: note
        });

        if (error) throw error;

        // 양쪽에 알림 발송
        const a = myParticipants.find(p => p.id === aId);
        const b = myParticipants.find(p => p.id === bId);
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

        // 푸시 알림 (가능한 경우)
        try {
            if (a?.user_id) await sendPushNotifSimple(a.user_id, '소개가 도착했어요!', `${myProfile.name}님이 소개를 제안했어요.`, dashUrl);
            if (b?.user_id) await sendPushNotifSimple(b.user_id, '소개가 도착했어요!', `${myProfile.name}님이 소개를 제안했어요.`, dashUrl);
        } catch (e) { console.log('push error:', e.message); }

        toast('소개를 제안했습니다!', 'success');
        document.getElementById('pick-person-a').value = '';
        document.getElementById('pick-person-b').value = '';
        document.getElementById('intro-note').value = '';
        updateMatchPreview();
        loadIntroduceTab();
    } catch (e) {
        console.error('proposeIntroduction:', e);
        const msg = e.message || '소개 제안 실패';
        if (msg.includes('daily proposal limit')) toast('오늘 소개 제안 한도(10건)를 초과했습니다.', 'warning');
        else if (msg.includes('active introduction')) toast('이미 활성 소개가 있는 쌍입니다.', 'warning');
        else if (msg.includes('not in your referral')) toast('내 추천 네트워크의 참가자만 소개할 수 있습니다.', 'warning');
        else if (msg.includes('already matched')) toast('이미 매칭된 참가자입니다.', 'warning');
        else toast(msg, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 소개 제안하기';
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

    // 참가자 이름 조회
    const personIds = [...new Set(myIntroductions.flatMap(i => [i.person_a_id, i.person_b_id]))];
    const { data: persons } = await db.from('applicants')
        .select('id,name,gender,photos')
        .in('id', personIds);
    const personMap = {};
    (persons || []).forEach(p => personMap[p.id] = p);

    container.innerHTML = myIntroductions.map(intro => {
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

        return `<div class="history-row">
            <div class="history-pair">
                <span class="history-name">${esc(a.name || '?')}</span>
                ${aStatus}
                <i class="fa-solid fa-arrows-left-right" style="color:#d1d5db;font-size:.7em;margin:0 4px;"></i>
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
    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-weight:800;font-size:1.1em;">${esc(myProfile.name)}</div>
            <div style="font-size:.85em;color:var(--muted);">
                ${myProfile.role === 'matchmaker' ? '<span class="badge badge-green"><i class="fa-solid fa-handshake-angle"></i> 소개자</span>' : '<span class="badge badge-purple"><i class="fa-solid fa-user"></i> 참가자 + 주선자</span>'}
            </div>
            <div style="font-size:.85em;color:var(--muted);">추천 코드: <strong>${esc(myProfile.referral_code)}</strong></div>
            <div style="font-size:.85em;color:var(--muted);">추천한 참가자: <strong>${myParticipants.length}명</strong></div>
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
