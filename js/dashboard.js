'use strict';

// (SUPABASE_URL, SUPABASE_KEY, db, esc, toast, calcAge → js/common.js)

function setLoading(on) {
    document.getElementById('loading-overlay').classList.toggle('hide', !on);
}

function calcScore(p) {
    const fields = ['name','birth','job','height','location','mbti','kakao','intro','education','contact','referral'];
    let score = 0;
    if (p.gender) score += 10;
    fields.forEach(f => { if (p[f]) score += 10; });
    if (p.photos && p.photos.length > 0) score += 10;
    const max = fields.length * 10 + 10 + 10 + 14 * 5;
    return { pct: Math.min(100, Math.round((score / max) * 100)), score };
}

// (MBTI_COMPAT, calcMbtiCompat → js/common.js)

// ── 티어 배지 (Bumble 스타일) ──
function getTierBadge(pct) {
    if (pct >= 90) return { label:'<i class="fa-solid fa-gem"></i> 다이아몬드', cls:'tier-diamond' };
    if (pct >= 70) return { label:'💠 사파이어', cls:'tier-sapphire' };
    if (pct >= 50) return { label:'🟢 에메랄드', cls:'tier-emerald' };
    if (pct >= 30) return { label:'🔴 루비', cls:'tier-ruby' };
    return { label:'🪨 브론즈', cls:'tier-bronze' };
}

// ── 매칭 점수 계산 (이상형 선호 반영) ──
// (JOB_SCORES, calcJobScore → js/common.js)

// (heightInRange, calcMatchScore → js/common.js)

function gemIcon(pct) {
    if (pct >= 96) return { icon:'<i class="fa-solid fa-gem"></i>', filter:'none', cls:'max', color:'#7c3aed' };
    if (pct >= 70) return { icon:'<i class="fa-solid fa-gem"></i>', filter:'none', cls:'', color:'#7c3aed' };
    if (pct >= 45) return { icon:'<i class="fa-solid fa-gem"></i>', filter:'none', cls:'', color:'#a78bfa' };
    if (pct >= 20) return { icon:'<i class="fa-solid fa-gem"></i>', filter:'none', cls:'', color:'#c4b5fd' };
    return { icon:'<i class="fa-solid fa-gem"></i>', filter:'none', cls:'', color:'#d1d5db' };
}

// 내 프로필에 받은 평판 표시
async function loadMyReputations(myId) {
    const box = document.getElementById('my-reputation-box');
    if (!box || !myId) return;
    try {
        const { data: reps } = await db.from('reputations').select('*').eq('target_applicant_id', myId).order('created_at', { ascending: false });
        if (!reps || reps.length === 0) {
            box.innerHTML = '<div style="padding:14px;background:#fafafa;border-radius:10px;font-size:.82em;color:var(--muted);text-align:center;"><i class="fa-solid fa-handshake" style="color:#d1d5db;"></i> 아직 받은 평판이 없어요</div>';
            return;
        }
        const writerIds = [...new Set(reps.map(r => r.writer_applicant_id))];
        const { data: writers } = await db.from('applicants').select('id,name,gender,photos').in('id', writerIds);
        const writerMap = {};
        (writers || []).forEach(w => { writerMap[w.id] = w; });
        box.innerHTML = `
            <div style="font-size:.82em;font-weight:700;margin-bottom:10px;"><i class="fa-solid fa-handshake" style="color:var(--primary);"></i> 나를 보증한 사람들 (${reps.length})</div>
            ${reps.map(r => {
                const w = writerMap[r.writer_applicant_id] || {};
                const wPhoto = (w.photos && w.photos[0])
                    ? `<img loading="lazy" src="${w.photos[0]}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
                    : `<div style="width:32px;height:32px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:.8em;">${w.gender==='male'?'<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>':'<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
                return `<div style="display:flex;gap:10px;padding:10px;background:var(--bg);border-radius:10px;margin-bottom:6px;align-items:flex-start;">
                    ${wPhoto}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.78em;font-weight:700;display:flex;align-items:center;gap:4px;">
                            ${esc(w.name || '익명')}
                            ${r.is_referrer ? '<span style="font-size:.66em;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#b45309;">추천인</span>' : ''}
                        </div>
                        <div style="font-size:.78em;color:#374151;margin-top:3px;line-height:1.5;">"${esc(r.content)}"</div>
                    </div>
                </div>`;
            }).join('')}`;
    } catch(e) { console.log('load reputations error:', e.message); toast('평판 정보를 불러오지 못했어요.', 'error'); }
}

// ── 평판 (보증) 시스템 ──
let _currentRepTargetId = null;
let _currentRepTargetName = '';
let _currentMyRepId = null;

async function openReputationModal(targetId, targetName) {
    _currentRepTargetId = targetId;
    _currentRepTargetName = targetName;
    _currentMyRepId = null;
    document.getElementById('reputation-target-info').innerHTML = `<i class="fa-solid fa-user" style="color:var(--primary);"></i> <b>${esc(targetName)}</b>님에 대한 평판`;
    // 기존 내 평판 조회
    try {
        const { data: { user } } = await db.auth.getUser();
        const { data } = await db.from('reputations').select('id,content').eq('target_applicant_id', targetId).eq('writer_user_id', user.id).limit(1);
        if (data && data[0]) {
            _currentMyRepId = data[0].id;
            document.getElementById('reputation-content').value = data[0].content || '';
            document.getElementById('reputation-counter').textContent = (data[0].content || '').length + '/500';
            document.getElementById('reputation-delete-wrap').style.display = '';
        } else {
            document.getElementById('reputation-content').value = '';
            document.getElementById('reputation-counter').textContent = '0/500';
            document.getElementById('reputation-delete-wrap').style.display = 'none';
        }
    } catch(e) {
        document.getElementById('reputation-content').value = '';
    }
    document.getElementById('reputation-modal-overlay').classList.add('open');
}

function closeReputationModal() {
    document.getElementById('reputation-modal-overlay').classList.remove('open');
    _currentRepTargetId = null;
    _currentMyRepId = null;
}

async function saveReputation() {
    if (!_currentRepTargetId || !window._myProfile) return;
    const content = document.getElementById('reputation-content').value.trim();
    if (content.length < 20) {
        toast('최소 20자 이상 작성해주세요', 'warning');
        return;
    }
    const myApplicantId = window._myProfile.id;
    if (myApplicantId === _currentRepTargetId) {
        toast('본인 평판은 작성할 수 없어요', 'error');
        return;
    }
    try {
        const { data: { user } } = await db.auth.getUser();
        if (_currentMyRepId) {
            // 수정
            const { error } = await db.from('reputations').update({ content }).eq('id', _currentMyRepId);
            if (error) throw error;
            toast('평판이 수정되었어요', 'success');
        } else {
            // is_referrer 판별: 내 referral_code가 대상의 referred_by와 일치하면 추천인
            let isReferrer = false;
            try {
                const { data: tgtInfo } = await db.from('applicants').select('referred_by').eq('id', _currentRepTargetId).limit(1);
                if (tgtInfo?.[0]?.referred_by && window._myProfile.referral_code) {
                    isReferrer = tgtInfo[0].referred_by.toUpperCase() === window._myProfile.referral_code.toUpperCase();
                }
            } catch(e) {}

            // 신규
            const { error } = await db.from('reputations').insert({
                target_applicant_id: _currentRepTargetId,
                writer_applicant_id: myApplicantId,
                writer_user_id: user.id,
                content,
                is_referrer: isReferrer
            });
            if (error) {
                if (error.message.includes('duplicate') || error.code === '23505') {
                    toast('이미 이 사람에 대한 평판을 작성했어요', 'warning');
                } else throw error;
                return;
            }
            toast(`${_currentRepTargetName}님에게 평판을 남겼어요 💐`, 'success');
            // 대상자에게 알림
            try {
                const { data: target } = await db.from('applicants').select('user_id,status').eq('id', _currentRepTargetId).limit(1);
                if (target?.[0]?.user_id) {
                    await db.from('notifications').insert({
                        user_id: target[0].user_id,
                        type: 'reputation_received',
                        title: '평판이 도착했어요 🤝',
                        body: `${window._myProfile.name}님이 당신에 대한 평판을 남겼어요`,
                    });
                    sendPushNotif(target[0].user_id, '🤝 평판이 도착했어요', `${window._myProfile.name}님이 평판을 남겼어요`, dashUrl('my'), 'approved');

                    // 평판 자동 전환: 추천인 평판 1개면 pending으로 전환
                    if (target[0].status === 'pending_reputation') {
                        const { data: reps } = await db.from('reputations').select('is_referrer').eq('target_applicant_id', _currentRepTargetId);
                        const hasReferrerRep = (reps || []).some(r => r.is_referrer);
                        if (hasReferrerRep) {
                            await db.from('applicants').update({ status: 'pending' }).eq('id', _currentRepTargetId).eq('status', 'pending_reputation');
                            await db.from('notifications').insert({
                                user_id: target[0].user_id,
                                type: 'reputation_complete',
                                title: '평판 수집 완료! 🎉',
                                body: '평판이 모두 모였어요! 관리자 심사가 시작됩니다.',
                            });
                            sendPushNotif(target[0].user_id, '🎉 평판 수집 완료', '관리자 심사가 시작됩니다!', dashUrl('my'), 'approved');
                        }
                    }
                }
            } catch(e) {}
        }
        closeReputationModal();
        closeProfileModal();
    } catch(e) {
        toast('평판 저장 실패: ' + e.message, 'error');
    }
}

async function deleteReputation() {
    if (!_currentMyRepId) return;
    if (!confirm('평판을 삭제하시겠어요?')) return;
    try {
        const { error } = await db.from('reputations').delete().eq('id', _currentMyRepId);
        if (error) throw error;
        toast('평판이 삭제되었어요');
        closeReputationModal();
        closeProfileModal();
    } catch(e) { toast('삭제 실패: ' + e.message, 'error'); }
}

// ── 추천 코드 복사 ──
function copyMyReferralCode() {
    const code = window._myProfile?.referral_code;
    if (!code) return;
    const txt = `반쪽(Banjjok)에 초대할게!\n내 추천 코드: ${code}\n가입 링크: https://kyhwow-rgb.github.io/banjjok/\n가입할 때 추천 코드를 직접 입력해줘!`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => toast('추천 코드 복사 완료! 지인에게 보내주세요', 'success'));
    } else {
        const ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('추천 코드 복사 완료!', 'success'); } catch { toast('복사 실패', 'error'); }
        document.body.removeChild(ta);
    }
}

// 평판 요청 링크 공유 (이미 활동 중인 지인에게 보증 부탁용)
function shareReputationRequestLink() {
    const p = window._myProfile;
    if (!p) return;
    const link = `https://kyhwow-rgb.github.io/banjjok/dashboard.html#reputation=${p.id}`;
    const txt = `반쪽(Banjjok) 가입했는데 네 평판이 필요해!\n승인 심사 조건이라 20자 이상 짧게 보증 써줄 수 있어?\n\n${link}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => toast('평판 요청 링크 복사 완료! 지인에게 보내주세요', 'success'));
    } else {
        const ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('링크 복사 완료!', 'success'); } catch { toast('복사 실패', 'error'); }
        document.body.removeChild(ta);
    }
}

// ── 상태별 온보딩 화면 ──
async function showOnboarding(status, candidateCount) {
    const overlay = document.getElementById('onboard-overlay');
    // 평판 대기: 추천인 평판 1개 필요
    if (status === 'pending_reputation') {
        const profile = window._myProfile;
        let reps = [];
        let referrerName = '(알 수 없음)';
        try {
            const { data } = await db.from('reputations').select('id,is_referrer,content,writer_applicant_id,created_at').eq('target_applicant_id', profile.id);
            reps = data || [];
        } catch(e) {}
        if (profile.referred_by) {
            try {
                const { data: ref } = await db.from('applicants').select('name').eq('referral_code', profile.referred_by).limit(1);
                if (ref && ref[0]) referrerName = ref[0].name;
            } catch(e) {}
        }
        const hasReferrerRep = reps.some(r => r.is_referrer);
        const progress = hasReferrerRep ? 100 : 0;

        overlay.style.display = 'flex';
        overlay.innerHTML = `<div class="onboard-content">
            <div class="onboard-icon">🤝</div>
            <div class="onboard-title">추천인 평판 대기 중</div>
            <div class="onboard-sub">반쪽은 지인 추천제예요.<br><b>${esc(referrerName)}</b>님의 추천으로 가입하셨어요!</div>
            <div style="background:var(--bg);border-radius:16px;padding:18px;margin:20px 0;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="font-size:.88em;font-weight:800;">승인 진행</span>
                    <span style="font-size:.88em;font-weight:800;color:var(--primary);">${hasReferrerRep ? '1' : '0'} / 1</span>
                </div>
                <div style="height:10px;background:#ede9fe;border-radius:10px;overflow:hidden;">
                    <div style="height:100%;width:${progress}%;background:linear-gradient(135deg,#7c3aed,#ec4899);transition:width .4s;"></div>
                </div>
                <div style="margin-top:14px;font-size:.82em;line-height:1.7;text-align:left;">
                    <div>${hasReferrerRep ? '✅' : '⏳'} 추천인 <b>${esc(referrerName)}</b>님의 평판</div>
                </div>
            </div>
            <div style="background:linear-gradient(135deg,#f5f3ff,#fdf2f8);padding:14px;border-radius:12px;margin-bottom:20px;">
                <div style="font-size:.82em;font-weight:700;margin-bottom:6px;">💡 승인 절차</div>
                <div style="font-size:.76em;color:var(--muted);line-height:1.6;text-align:left;">
                    1. 추천인 <b>${esc(referrerName)}</b>님이 평판을 작성<br>
                    2. 관리자가 신청서를 검토 후 승인
                </div>
            </div>
            <button class="btn btn-outline" onclick="copyMyReferralCode()" style="margin-bottom:8px;"><i class="fa-solid fa-copy"></i> 내 추천 코드 복사하기</button>
            <br>
            <button class="btn btn-nav" onclick="document.getElementById('onboard-overlay').style.display='none';" style="margin-top:8px;font-size:.82em;color:var(--muted);">둘러보기로 이동</button>
        </div>`;
        return;
    }
    if (status === 'pending') {
        // 첫 방문만 전체 화면 안내, 이후엔 상단 배너만
        if (!localStorage.getItem('bj_pending_seen')) {
            overlay.style.display = 'flex';
            overlay.innerHTML = `<div class="onboard-content">
                <div class="onboard-icon">⏳</div>
                <div class="onboard-title">심사 중이에요</div>
                <div class="onboard-sub">관리자가 신청서를 검토하고 있어요.<br>승인 전에도 추천 반쪽을 미리 볼 수 있어요!</div>
                <div class="waiting-progress">
                    <div class="waiting-dot"></div>
                    <div class="waiting-dot"></div>
                    <div class="waiting-dot"></div>
                </div>
                <div style="margin-top:24px;padding:16px;background:var(--bg);border-radius:14px;text-align:left;">
                    <div style="font-size:.82em;font-weight:700;color:var(--text);"><i class="fa-solid fa-eye" style="color:var(--primary);"></i> 지금 할 수 있는 것</div>
                    <div style="font-size:.78em;color:var(--muted);line-height:1.6;">
                        · 이성 참가자 프로필 둘러보기<br>
                        · 관심 가는 사람 기억해두기
                    </div>
                    <div style="font-size:.82em;font-weight:700;color:var(--text);margin-top:12px;"><i class="fa-solid fa-lock" style="color:var(--muted);"></i> 승인 후 가능</div>
                    <div style="font-size:.78em;color:var(--muted);line-height:1.6;">
                        · 찜하기 / 상호 매칭<br>
                        · 매칭된 반쪽과 대화하기
                    </div>
                </div>
                <div style="margin-top:20px;">
                    <button class="onboard-btn" onclick="localStorage.setItem('bj_pending_seen','1');document.getElementById('onboard-overlay').style.display='none';">
                        <i class="fa-solid fa-eye"></i> 둘러보기 시작
                    </button>
                </div>
            </div>`;
        } else {
            overlay.style.display = 'none';
        }
    } else if (status === 'approved' && !localStorage.getItem('kj_onboarded')) {
        overlay.style.display = 'flex';
        overlay.innerHTML = `<div class="onboard-content">
            <div class="onboard-icon">🎉</div>
            <div class="onboard-title">승인되었어요!</div>
            <div class="onboard-sub">반쪽을 찾을 준비가 되었어요.<br>3단계로 매칭을 시작해보세요.</div>
            <div class="onboard-steps">
                <div class="onboard-step">
                    <div class="onboard-step-num">1</div>
                    <div>
                        <div class="onboard-step-text">매칭 우선순위 설정</div>
                        <div class="onboard-step-desc">키 · 외모 · 직업 중 뭘 더 중요하게 볼지 조절해요</div>
                    </div>
                </div>
                <div class="onboard-step">
                    <div class="onboard-step-num">2</div>
                    <div>
                        <div class="onboard-step-text">추천 반쪽 탐색</div>
                        <div class="onboard-step-desc">AI가 추천하는 이성 프로필을 확인해요</div>
                    </div>
                </div>
                <div class="onboard-step">
                    <div class="onboard-step-num">3</div>
                    <div>
                        <div class="onboard-step-text">좋아요 & 매칭 신청</div>
                        <div class="onboard-step-desc">마음에 드는 분을 찜하면 상호 관심 시 매칭을 신청할 수 있어요</div>
                    </div>
                </div>
            </div>
            <button class="onboard-btn" onclick="localStorage.setItem('kj_onboarded','1');document.getElementById('onboard-overlay').style.display='none';showConfetti();">매칭 시작하기 <i class="fa-solid fa-heart"></i></button>
        </div>`;
    } else if (status === 'rejected') {
        overlay.style.display = 'flex';
        overlay.innerHTML = `<div class="onboard-content">
            <div class="onboard-icon">😢</div>
            <div class="onboard-title">신청서가 반려되었어요</div>
            <div class="onboard-sub">걱정 마세요! 신청서를 수정해서 다시 제출할 수 있어요.</div>
            <div style="margin-top:8px;">
                <button class="onboard-btn" style="background:linear-gradient(135deg,#f59e0b,#ec4899);" onclick="editMyProfile();">신청서 수정하기 ✏️</button>
            </div>
            <div style="margin-top:16px;">
                <button class="btn btn-nav" onclick="document.getElementById('onboard-overlay').style.display='none'">닫기</button>
            </div>
        </div>`;
    } else {
        overlay.style.display = 'none';
    }
}

function renderProfile(p) {
    const sec = document.getElementById('my-profile-section');
    const mySec = null; // 홈 탭 제거됨 — sec이 MY 프로필
    if (!p) {
        const emptyHtml = `
            <div class="no-profile">
                <div class="no-profile-title">아직 신청서가 없어요</div>
                <div class="no-profile-sub">소개팅 신청서를 작성하면 보석 순도가 올라가요!</div>
                <a href="index.html"><button class="btn btn-primary">신청서 작성하기</button></a>
            </div>`;
        sec.innerHTML = emptyHtml;
        if (mySec) mySec.innerHTML = emptyHtml;
        return;
    }
    const myEditBtn = document.getElementById('edit-profile-btn-my');
    if (myEditBtn) myEditBtn.style.display = '';
    const { pct } = calcScore(p);
    const age = calcAge(p.birth);
    const gem = gemIcon(pct);
    const scoreMsg = pct >= 96 ? '완벽한 보석이에요! ✨' : pct >= 70 ? '멋진 보석이에요!' : pct >= 45 ? '조금만 더 채워봐요' : '정보를 더 입력해보세요';
    const myPhoto = p.photos && p.photos[0];
    const myPhotoHtml = myPhoto
        ? `<img loading="lazy" src="${myPhoto}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        : `<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ede9fe,#fce7f3);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${p.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
    sec.innerHTML = `
        ${window._popularityCount > 0 ? `<div style="margin-bottom:12px;"><span class="popularity-badge"><i class="fa-solid fa-fire"></i> ${window._popularityCount}명이 관심</span></div>` : ''}
        <div class="score-wrap">
            ${myPhotoHtml}
            <div class="score-info" style="flex:1;">
                <div class="score-pct-text">${pct}% 순도</div>
                <div class="score-msg">${pct >= 100 ? '프로필 완성! 매칭 확률이 가장 높아요' : '프로필을 더 채우면 매칭 확률이 높아져요'}</div>
            </div>
        </div>
        <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%"></div></div>
        <div class="profile-grid">
            ${p.name     ? `<div class="profile-item"><div class="profile-label">이름</div><div class="profile-value">${esc(p.name)}</div></div>` : ''}
            ${age        ? `<div class="profile-item"><div class="profile-label">나이</div><div class="profile-value">${age}세</div></div>` : ''}
            ${p.job      ? `<div class="profile-item"><div class="profile-label">직업</div><div class="profile-value">${esc(p.job)}</div></div>` : ''}
            ${p.company  ? `<div class="profile-item"><div class="profile-label">직장명</div><div class="profile-value">${esc(p.company)}</div></div>` : ''}
            ${p.job_title? `<div class="profile-item"><div class="profile-label">직무</div><div class="profile-value">${esc(p.job_title)}</div></div>` : ''}
            ${p.location ? `<div class="profile-item"><div class="profile-label">사는 곳</div><div class="profile-value">${esc(p.location)}</div></div>` : ''}
            ${p.height   ? `<div class="profile-item"><div class="profile-label">키</div><div class="profile-value">${p.height}cm</div></div>` : ''}
            ${p.mbti     ? `<div class="profile-item"><div class="profile-label">MBTI</div><div class="profile-value">${esc(p.mbti)}</div></div>` : ''}
            ${p.education? `<div class="profile-item"><div class="profile-label">학력</div><div class="profile-value">${esc(p.education)}</div></div>` : ''}
            ${p.smoking  ? `<div class="profile-item"><div class="profile-label">흡연</div><div class="profile-value">${esc(p.smoking)}</div></div>` : ''}
            ${p.drinking ? `<div class="profile-item"><div class="profile-label">음주</div><div class="profile-value">${esc(p.drinking)}</div></div>` : ''}
            ${p.religion ? `<div class="profile-item"><div class="profile-label">종교</div><div class="profile-value">${esc(p.religion)}</div></div>` : ''}
            ${p.hobby    ? `<div class="profile-item"><div class="profile-label">취미</div><div class="profile-value">${esc(p.hobby)}</div></div>` : ''}
            ${p.status   ? `<div class="profile-item"><div class="profile-label">상태</div><div class="profile-value">${{pending_reputation:'평판 대기 🤝',pending:'승인 대기 ⏳',approved:'활동 중 ✅',rejected:'거절',matched:'매칭됨 💑'}[p.status]||p.status}</div></div>` : ''}
        </div>
        ${p.status === 'pending_reputation' ? `<div style="margin-top:16px;padding:14px 18px;background:#fef3c7;border-radius:12px;font-size:.85em;color:#92400e;line-height:1.6;">
            🤝 평판 수집 중이에요. 추천인과 지인 1명의 평판(20자+)이 모이면 승인 심사로 넘어갑니다.
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
                <button onclick="shareReputationRequestLink()" style="background:#92400e;color:#fff;border:none;padding:7px 12px;border-radius:8px;font-weight:700;font-size:.82em;cursor:pointer;"><i class="fa-solid fa-share"></i> 평판 요청 링크 복사</button>
                <button onclick="copyMyReferralCode()" style="background:#fff;color:#92400e;border:1px solid #fcd34d;padding:7px 12px;border-radius:8px;font-weight:700;font-size:.82em;cursor:pointer;"><i class="fa-solid fa-copy"></i> 추천 코드</button>
            </div>
        </div>` : ''}
        ${p.status === 'pending' ? `<div style="margin-top:16px;padding:14px 18px;background:#fef3c7;border-radius:12px;font-size:.85em;color:#92400e;">⏳ 관리자가 신청서를 확인 중이에요. 승인되면 추천 반쪽을 볼 수 있어요!</div>` : ''}
        ${p.status === 'rejected' ? `<div style="margin-top:16px;padding:14px 18px;background:#fee2e2;border-radius:12px;font-size:.85em;color:#991b1b;">신청서가 반려되었어요. <a href="#" onclick="event.preventDefault();editMyProfile();" style="color:#7c3aed;font-weight:700;">신청서를 수정</a>해서 다시 제출해보세요.</div>` : ''}
        <div id="my-reputation-box" style="margin-top:16px;"></div>`;
    loadMyReputations(p.id);
    if (mySec) {
        mySec.innerHTML = sec.innerHTML;
        // 추천인 코드 & 찜 슬롯 표시
        if (p.referral_code) {
            const maxFav = p.fav_slots || 3;
            mySec.innerHTML += `
                <div style="margin-top:16px;padding:14px 18px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
                    <div style="font-size:.82em;font-weight:700;">내 추천인 코드</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.1em;font-weight:800;letter-spacing:.08em;color:var(--primary);font-family:monospace;">${esc(p.referral_code)}</span>
                        <button onclick="navigator.clipboard.writeText('${esc(p.referral_code)}');toast('복사됨!','success');" style="background:#f3f4f6;border:none;padding:5px 12px;border-radius:6px;font-size:.78em;cursor:pointer;">복사</button>
                    </div>
                    <div style="font-size:.72em;color:var(--muted);margin-top:8px;">친구에게 이 코드를 알려주면 서로 찜 슬롯이 늘어나고 24시간 상위 노출돼요!</div>
                    <div style="font-size:.78em;margin-top:6px;">추천 ${p.referral_count || 0}명 · 찜 슬롯 ${maxFav}명</div>
                </div>`;
        }
        // 찜 슬롯 라벨 업데이트
        const favLabel = document.getElementById('fav-max-label');
        if (favLabel) favLabel.textContent = (p.fav_slots || 3) + '명까지';
    }
}

function renderFavorites(favApplicants) {
    const sec = document.getElementById('favorites-section');
    document.getElementById('fav-count').textContent = favApplicants.length ? `${favApplicants.length}명` : '';
    if (!favApplicants.length) {
        sec.innerHTML = `<div class="fav-empty"><div style="font-size:2.5em;margin-bottom:10px;"><i class="fa-solid fa-heart" style="color:#ede9fe;"></i></div>아직 찜한 사람이 없어요<br><span style="font-size:.8em;color:#d1d5db;">추천 탭에서 마음에 드는 반쪽을 찜해보세요</span></div>`;
        updateInterestEmptyState();
        return;
    }
    sec.innerHTML = `<div class="fav-list">${favApplicants.map(a => {
        const age = calcAge(a.birth);
        const photo = a.photos && a.photos[0];
        const photoHtml = photo
            ? `<div class="fav-photo"><img loading="lazy" src="${photo}" alt=""></div>`
            : `<div class="fav-photo">${a.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
        const tags = [age ? `${age}세` : null, a.job, a.location, a.mbti].filter(Boolean)
            .map(t => `<span class="fav-tag">${t}</span>`).join('');
        return `<div class="fav-item" style="cursor:pointer;" onclick="openProfileModal('${a.id}')">
            ${photoHtml}
            <div class="fav-info">
                <div class="fav-tags">${tags}</div>
            </div>
            <button class="btn-unfav" onclick="event.stopPropagation();removeFav('${a.id}')" title="찜 해제">✕</button>
        </div>`;
    }).join('')}</div>`;
    updateInterestEmptyState();
}

// ── 가중치 슬라이더 (6항목 자동 밸런싱) ──
const WEIGHT_KEYS = ['height','looks','job','location','age','mbti'];
const WEIGHT_DEFAULTS = { height:20, looks:20, job:15, location:15, age:15, mbti:15 };

function onWeightChange(which) {
    const vals = {};
    WEIGHT_KEYS.forEach(k => { vals[k] = parseInt(document.getElementById('w-' + k).value); });
    const total = WEIGHT_KEYS.reduce((s, k) => s + vals[k], 0);
    if (total > 100 && which) {
        const excess = total - 100;
        const others = WEIGHT_KEYS.filter(k => k !== which);
        const otherSum = others.reduce((s, k) => s + vals[k], 0);
        if (otherSum > 0) {
            let remaining = 100 - vals[which];
            others.forEach((k, i) => {
                if (i < others.length - 1) {
                    vals[k] = Math.max(0, Math.round(vals[k] - excess * (vals[k] / otherSum)));
                    remaining -= vals[k];
                } else {
                    vals[k] = Math.max(0, remaining);
                }
                document.getElementById('w-' + k).value = vals[k];
            });
        }
    }
    WEIGHT_KEYS.forEach(k => {
        vals[k] = parseInt(document.getElementById('w-' + k).value);
        document.getElementById('w-' + k + '-pct').textContent = vals[k] + '%';
    });
    const finalTotal = WEIGHT_KEYS.reduce((s, k) => s + vals[k], 0);
    const el = document.getElementById('weight-total');
    el.textContent = finalTotal + '%';
    el.className = 'weight-total-num ' + (finalTotal === 100 ? 'ok' : 'over');
}

function loadWeights(idealWeightsJson) {
    let w = Object.assign({}, WEIGHT_DEFAULTS);
    if (idealWeightsJson) { try { Object.assign(w, JSON.parse(idealWeightsJson)); } catch {} }
    WEIGHT_KEYS.forEach(k => { document.getElementById('w-' + k).value = w[k] || 0; });
    onWeightChange(null);
}

async function saveWeights() {
    const vals = {};
    WEIGHT_KEYS.forEach(k => { vals[k] = parseInt(document.getElementById('w-' + k).value); });
    let total = WEIGHT_KEYS.reduce((s, k) => s + vals[k], 0);
    if (total === 0) { Object.assign(vals, WEIGHT_DEFAULTS); total = 100; }
    else if (total !== 100) {
        const scale = 100 / total;
        let sum = 0;
        WEIGHT_KEYS.forEach((k, i) => {
            if (i < WEIGHT_KEYS.length - 1) { vals[k] = Math.round(vals[k] * scale); sum += vals[k]; }
            else { vals[k] = 100 - sum; }
        });
        WEIGHT_KEYS.forEach(k => { document.getElementById('w-' + k).value = vals[k]; });
        onWeightChange(null);
    }
    const weightsJson = JSON.stringify(vals);
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from('applicants').update({ ideal_weights: weightsJson }).eq('user_id', user.id);
    if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
    window._myProfile = { ...window._myProfile, ideal_weights: weightsJson };
    renderMatchRanking(window._allCandidates || []);
    const btn = document.getElementById('save-weights-btn');
    btn.textContent = '저장됨';
    setTimeout(() => { btn.textContent = '저장'; }, 1500);
}

// ── 추천 반쪽 목록 렌더 ──
let _currentView = 'card';
let _cardIndex = 0;
let _scoredCandidates = [];
let _swipedCount = 0;
let _isCardAnimating = false;

// 일일 리셋: 날짜가 바뀌면 스와이프 카운트 초기화
function getDailySwipeKey() { return 'bj_swiped_' + new Date().toISOString().slice(0, 10); }
function loadDailySwipeCount() {
    const key = getDailySwipeKey();
    // 어제 이전 키 정리
    Object.keys(localStorage).filter(k => k.startsWith('bj_swiped_') && k !== key).forEach(k => localStorage.removeItem(k));
    return parseInt(localStorage.getItem(key) || '0');
}
function saveDailySwipeCount() {
    localStorage.setItem(getDailySwipeKey(), String(_swipedCount));
}

// ── 탭 전환 ──
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    const content = document.getElementById('tab-' + tab);
    const btn = document.getElementById('tab-btn-' + tab);
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');
    // 추천 탭 전환 시 카드 렌더 보장
    if (tab === 'discover' && window._allCandidates) {
        renderCardView(document.getElementById('match-ranking-section'), window._favSet || new Set());
    }
    // 관심 탭 전환 시 찜 목록 + 방문 흔적 동기화
    if (tab === 'interest') {
        (async () => { const { data:{user} } = await db.auth.getUser(); if(user) { await loadFavorites(user.id); loadMutualInterests(user.id); } })();
        loadProfileVisitors();
    }
    // MY 탭 전환 시 문의 내역 새로고침 (관리자 답변 반영)
    if (tab === 'my') {
        loadInquiries();
        updatePushToggleUI();
    }
    // 대화 탭 전환 시 채팅방 목록 새로고침
    if (tab === 'chat') {
        renderChatRoomList();
    }
}

function editMyProfile() {
    if (window._myProfile) {
        try { localStorage.setItem('bj_edit_profile', JSON.stringify(window._myProfile)); } catch(e) {}
    }
    localStorage.setItem('bj_edit_return_dashboard', '1');
    window.location.href = 'index.html#register';
}

function updateInterestBadge() {
    const likedMe = (window._likedMeData || []).length;
    const badge = document.getElementById('interest-badge');
    if (likedMe > 0) {
        badge.style.display = 'flex';
        badge.textContent = likedMe > 9 ? '9+' : likedMe;
    } else {
        badge.style.display = 'none';
    }
}

function updateInterestEmptyState() {
    // 관심 탭에 3개 섹션이 항상 표시되므로 빈 상태는 더 이상 필요 없음
    const emptyEl = document.getElementById('interest-empty');
    if (emptyEl) emptyEl.style.display = 'none';
}

function renderMatchRanking(candidates) {
    const sec = document.getElementById('match-ranking-section');
    const card = document.getElementById('match-ranking-card');
    if (!window._myProfile || !candidates.length) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';
    const favSet = window._favSet || new Set();
    const blockedSet = window._blockedSet || new Set();
    // 필터 적용
    const f = _discoverFilters;
    const filtered = candidates.filter(c => {
        if (blockedSet.has(c.id)) return false;
        if (favSet.has(c.id)) return false; // 이미 찜한 사람은 추천에서 제외
        if (f.ageMin || f.ageMax) {
            const age = calcAge(c.birth);
            if (age == null) return false;
            if (f.ageMin && age < f.ageMin) return false;
            if (f.ageMax && age > f.ageMax) return false;
        }
        if (f.regions && f.regions.length && !f.regions.includes(c.location)) return false;
        if (f.mbtis && f.mbtis.length && !f.mbtis.includes(c.mbti)) return false;
        return true;
    });
    const now = new Date();
    _scoredCandidates = filtered.map(c => ({
        ...c,
        _score: calcMatchScore(window._myProfile, c),
        _mbtiCompat: calcMbtiCompat(window._myProfile.mbti, c.mbti),
        _favCount: (window._favCounts || {})[c.id] || 0,
        _matchProb: calcMatchProbability(window._myProfile, c, { favCount: (window._favCounts || {})[c.id] || 0 }),
        _boosted: c.boost_until && new Date(c.boost_until) > now
    }));
    _scoredCandidates.sort((a, b) => {
        if (a._boosted && !b._boosted) return -1;
        if (!a._boosted && b._boosted) return 1;
        return b._score - a._score;
    });
    // 일일 추천 3명 고정: 하루 동안 같은 3명을 계속 열람 가능
    const dailyKey = 'bj_daily_recs_' + new Date().toISOString().slice(0, 10);
    const savedIds = JSON.parse(localStorage.getItem(dailyKey) || 'null');
    if (savedIds && savedIds.length > 0) {
        // 저장된 ID 기준으로 복원 (차단된 사람 제외)
        const idMap = {};
        _scoredCandidates.forEach(c => { idMap[c.id] = c; });
        const restored = savedIds.map(id => idMap[id]).filter(Boolean);
        if (restored.length > 0) {
            _scoredCandidates = restored;
        } else {
            _scoredCandidates = _scoredCandidates.slice(0, 3);
            localStorage.setItem(dailyKey, JSON.stringify(_scoredCandidates.map(c => c.id)));
        }
    } else {
        _scoredCandidates = _scoredCandidates.slice(0, 3);
        localStorage.setItem(dailyKey, JSON.stringify(_scoredCandidates.map(c => c.id)));
        // 이전 날짜 키 정리
        Object.keys(localStorage).filter(k => k.startsWith('bj_daily_recs_') && k !== dailyKey).forEach(k => localStorage.removeItem(k));
    }
    document.getElementById('match-count').textContent = '';

    if (!_isCardAnimating) renderCardView(sec, favSet);
}

function renderListView(sec, favSet) {
    sec.innerHTML = `<div class="match-list">${_scoredCandidates.map((c, i) => {
        const age = calcAge(c.birth);
        const photo = c.photos && c.photos[0];
        const photoHtml = photo
            ? `<div class="match-photo"><img loading="lazy" src="${photo}" alt=""></div>`
            : `<div class="match-photo">${c.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        const mbtiLabel = c._mbtiCompat >= 80 ? '<i class="fa-solid fa-fire" style="color:#ef4444;font-size:.7em;"></i>' : c._mbtiCompat >= 65 ? '<i class="fa-solid fa-star" style="color:#f59e0b;font-size:.7em;"></i>' : '';
        const tags = [age ? `${age}세` : null, c.location, c.mbti ? c.mbti + mbtiLabel : null, c.job_category].filter(Boolean)
            .map(t => `<span class="match-tag">${t}</span>`).join('');
        const isFav = favSet.has(c.id);
        const isMutual = (window._mutualSet || new Set()).has(c.id);
        const popHtml = c._favCount > 0 ? `<span class="popularity-badge" style="font-size:.65em;padding:2px 6px;"><i class="fa-solid fa-fire"></i>${c._favCount}</span>` : '';
        const mutualHtml = isMutual ? `<span class="mutual-badge"><i class="fa-solid fa-heart-circle-bolt"></i> 상호 관심</span>` : '';
        return `<div class="match-item" style="animation-delay:${i * 50}ms;${isMutual ? 'background:linear-gradient(135deg,#faf5ff,#fdf2f8);border:1px solid #ede9fe;' : ''}cursor:pointer;" onclick="openProfileModal('${c.id}')">
            <div class="match-rank">${rankIcon}</div>
            ${photoHtml}
            <div class="match-info">
                <div style="font-size:.85em;font-weight:700;">${popHtml} ${mutualHtml}</div>
                <div class="match-tags">${tags}</div>
            </div>
            <button class="btn-fav" onclick="event.stopPropagation();toggleFav('${c.id}')" title="${isFav ? '찜 해제' : '찜하기'}">${isFav ? '💜' : '🤍'}</button>
        </div>`;
    }).join('')}</div>`;
}

function renderCardView(sec, favSet) {
    const _isActiveUser = window._myProfile && (window._myProfile.status === 'approved' || window._myProfile.status === 'matched');
    // 추천 대상 없음
    if (!_scoredCandidates || _scoredCandidates.length === 0) {
        sec.innerHTML = `<div style="text-align:center;padding:48px 20px;">
            <div style="font-size:3em;margin-bottom:12px;"><i class="fa-solid fa-heart" style="color:#ede9fe;"></i></div>
            <div style="font-size:1em;font-weight:700;margin-bottom:6px;">추천할 반쪽이 없어요</div>
            <div style="font-size:.82em;color:var(--muted);">새로운 참가자가 등록되면 추천해드릴게요!</div>
        </div>`;
        return;
    }
    // 3장 모두 스와이프 완료 → 처음부터 다시 보기
    if (_swipedCount >= _scoredCandidates.length && _scoredCandidates.length > 0) {
        sec.innerHTML = `
            <div style="text-align:center;padding:48px 20px;">
                <div style="font-size:3.5em;margin-bottom:16px;"><i class="fa-solid fa-heart-circle-check" style="color:var(--primary);"></i></div>
                <div style="font-size:1.15em;font-weight:800;color:var(--text);">오늘의 추천을 모두 확인했어요</div>
                <div style="font-size:.88em;color:var(--muted);line-height:1.6;margin-bottom:20px;">
                    다시 보면서 찜 여부를 변경할 수 있어요
                </div>
                <div onclick="_swipedCount=0;_cardIndex=0;renderCardView(document.getElementById('match-ranking-section'),window._favSet||new Set());" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:var(--primary);color:#fff;border-radius:14px;font-size:.88em;font-weight:700;cursor:pointer;transition:transform .15s;margin-bottom:12px;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
                    <i class="fa-solid fa-rotate"></i> 다시 보기
                </div>
                <br>
                <div onclick="switchTab('interest')" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#f5f3ff,#fce7f3);border-radius:14px;font-size:.85em;font-weight:700;color:var(--primary);cursor:pointer;transition:transform .15s;margin-top:8px;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
                    <i class="fa-solid fa-gem"></i> 찜 목록 확인하기
                </div>
            </div>`;
        return;
    }
    if (_cardIndex >= _scoredCandidates.length) _cardIndex = 0;
    const c = _scoredCandidates[_cardIndex];
    if (!c) { sec.innerHTML = '<div class="match-empty">추천할 반쪽이 없어요</div>'; return; }
    // 새 카드이면 사진 인덱스 리셋
    if (window._lastRenderedCardId !== c.id) { _cardPhotoIdx = 0; window._lastRenderedCardId = c.id; }

    const age = calcAge(c.birth);
    const photos = c.photos || [];
    const photoIdx = Math.min(_cardPhotoIdx, Math.max(0, photos.length - 1));
    const mainPhoto = photos[photoIdx];
    const blurClass = _isActiveUser ? '' : ' card-photo-blurred';
    const photoHtml = mainPhoto
        ? `<img loading="lazy" src="${mainPhoto}" alt="" id="card-main-photo" class="${blurClass}">`
        : `<div class="card-photo-placeholder">${c.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
    const photoDotsHtml = photos.length > 1
        ? `<div class="photo-dots">${photos.map((_, i) => `<div class="photo-dot ${i === photoIdx ? 'active' : ''}"></div>`).join('')}</div>`
        : '';
    const photoTapsHtml = photos.length > 1
        ? `<div class="photo-tap photo-tap-left" onclick="cardPrevPhoto(event)"></div><div class="photo-tap photo-tap-right" onclick="cardNextPhoto(event)"></div>`
        : '';

    const isFav = favSet.has(c.id);
    const isMutual = (window._mutualSet || new Set()).has(c.id);
    const mbtiCompat = c._mbtiCompat;
    const mbtiLabel = mbtiCompat >= 80 ? 'MBTI 찰떡궁합! <i class="fa-solid fa-fire" style="color:#ef4444;"></i>' : mbtiCompat >= 65 ? 'MBTI 궁합 좋아요 <i class="fa-solid fa-star" style="color:#f59e0b;"></i>' : mbtiCompat >= 50 ? 'MBTI 보통' : 'MBTI 약간 다른 스타일';
    const tags = [age ? `${age}세` : null, c.location, c.job_category].filter(Boolean);

    // 매칭 점수 배지
    const scoreCls = c._score >= 80 ? 'high' : c._score >= 60 ? 'mid' : 'low';
    const scoreBadge = `<span class="match-score-card-badge ${scoreCls}"><i class="fa-solid fa-gem"></i> ${c._score}% 궁합</span>`;
    // 최근 접속 배지
    const seenBadge = buildSeenBadge(c.last_seen_at);

    // Ice Breaker
    let ibHtml = '';
    if (c.icebreaker) {
        try {
            const ib = JSON.parse(c.icebreaker);
            ibHtml = `<div class="card-icebreaker"><div class="card-ib-q"><i class="fa-solid fa-comment" style="color:var(--primary);"></i> ${esc(ib.q)}</div><div class="card-ib-a">${esc(ib.a)}</div></div>`;
        } catch {}
    }

    const popHtml = c._favCount > 0 ? `<span class="popularity-badge" style="margin-bottom:12px;"><i class="fa-solid fa-fire"></i> ${c._favCount}명이 관심을 보이고 있어요</span>` : '';
    const mutualCardHtml = isMutual ? `<div style="text-align:center;padding:10px;background:linear-gradient(135deg,#faf5ff,#fdf2f8);border-radius:12px;margin-bottom:12px;"><span class="mutual-badge" style="font-size:.85em;"><i class="fa-solid fa-heart-circle-bolt"></i> 이 사람도 당신에게 관심이 있어요!</span></div>` : '';

    sec.innerHTML = `
        <div class="card-view">
            <div class="profile-card" id="current-card">
                <div class="card-photo-area">
                    ${photoHtml}
                    ${photoDotsHtml}
                    ${photoTapsHtml}
                    ${!_isActiveUser ? '<div class="card-blur-notice"><i class="fa-solid fa-lock"></i><div>승인 후 사진이 공개됩니다</div></div>' : ''}
                    <div class="card-top-badges">
                        <div>${seenBadge}</div>
                        <div>${scoreBadge}</div>
                    </div>
                    <div class="card-photo-overlay">
                        <div class="card-age-badge">${age ? age + '세' : ''}</div>
                        ${c.mbti ? `<div class="card-mbti">${c.mbti}</div>` : ''}
                    </div>
                </div>
                <div class="card-body">
                    ${mutualCardHtml}
                    ${popHtml}
                    <div class="card-tags">${tags.map(t => `<span class="card-tag">${t}</span>`).join('')}</div>
                    <div class="card-compat">
                        <div class="card-compat-bar" style="flex:1;"><div class="card-compat-fill" style="width:${c._score}%"></div></div>
                        <span style="font-size:.72em;color:var(--muted);white-space:nowrap;">${mbtiLabel} ${mbtiCompat}%</span>
                    </div>
                    <div style="text-align:center;"><span class="match-prob-badge"><i class="fa-solid fa-chart-line"></i> 매칭 확률 ${c._matchProb}%</span></div>
                    ${ibHtml}
                </div>
                ${_isActiveUser ? `<div class="card-actions">
                    <button class="card-btn card-btn-pass" onclick="cardPass()" title="패스"><i class="fa-solid fa-xmark"></i></button>
                    <button class="card-btn card-btn-like" onclick="cardLike('${c.id}')" title="${isFav ? '이미 찜함' : '찜하기'}"><i class="fa-solid fa-heart"></i></button>
                </div>` : `<div style="text-align:center;padding:12px;font-size:.82em;color:var(--muted);">승인 후 찜할 수 있어요</div>`}
            </div>
            <div class="card-counter"></div>
            ${_isActiveUser ? `<div style="text-align:center;font-size:.72em;color:#d1d5db;margin-top:4px;">← 패스 | 좋아요 →${photos.length > 1 ? ' · 사진 좌우 탭' : ''}</div>
            <div style="text-align:center;margin-top:12px;display:flex;justify-content:center;gap:16px;">
                <button onclick="reportUser('${c.id}')" style="background:none;border:none;font-size:.72em;color:#d1d5db;cursor:pointer;"><i class="fa-solid fa-flag"></i> 신고</button>
                <button onclick="blockUser('${c.id}')" style="background:none;border:none;font-size:.72em;color:#d1d5db;cursor:pointer;"><i class="fa-solid fa-ban"></i> 차단</button>
            </div>` : ''}
        </div>`;
    // 스와이프 이벤트 바인딩
    setTimeout(initSwipe, 50);
}

// ── 다중 사진 네비 ──
let _cardPhotoIdx = 0;
function cardNextPhoto(e) {
    if (e) e.stopPropagation();
    const c = _scoredCandidates[_cardIndex];
    if (!c) return;
    const photos = c.photos || [];
    if (_cardPhotoIdx < photos.length - 1) {
        _cardPhotoIdx++;
        refreshCardPhoto();
    }
}
function cardPrevPhoto(e) {
    if (e) e.stopPropagation();
    if (_cardPhotoIdx > 0) {
        _cardPhotoIdx--;
        refreshCardPhoto();
    }
}
function refreshCardPhoto() {
    const c = _scoredCandidates[_cardIndex];
    if (!c) return;
    const photos = c.photos || [];
    const img = document.getElementById('card-main-photo');
    if (img && photos[_cardPhotoIdx]) img.src = photos[_cardPhotoIdx];
    document.querySelectorAll('#current-card .photo-dot').forEach((d, i) => {
        d.classList.toggle('active', i === _cardPhotoIdx);
    });
}

// ── 필터 시스템 ──
let _discoverFilters = JSON.parse(localStorage.getItem('bj_filters') || '{}');

const MBTI_LIST = ['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'];

function openFiltersModal() {
    // 지역 칩 렌더 (현재 후보군의 distinct 지역)
    const all = window._allCandidates || [];
    const regions = [...new Set(all.map(c => c.location).filter(Boolean))].sort();
    const selRegions = _discoverFilters.regions || [];
    const selMbtis = _discoverFilters.mbtis || [];
    document.getElementById('f-regions').innerHTML = regions.length === 0
        ? '<div style="color:var(--muted);font-size:.78em;">지역 데이터 없음</div>'
        : regions.map(r => `<span class="filter-chip ${selRegions.includes(r)?'selected':''}" onclick="toggleFilterChip(this,'regions','${esc(r)}')">${esc(r)}</span>`).join('');
    document.getElementById('f-mbtis').innerHTML = MBTI_LIST.map(m =>
        `<span class="filter-chip ${selMbtis.includes(m)?'selected':''}" onclick="toggleFilterChip(this,'mbtis','${m}')">${m}</span>`
    ).join('');
    document.getElementById('f-age-min').value = _discoverFilters.ageMin || '';
    document.getElementById('f-age-max').value = _discoverFilters.ageMax || '';
    document.getElementById('filter-modal-overlay').classList.add('open');
}

function closeFiltersModal() {
    document.getElementById('filter-modal-overlay').classList.remove('open');
}

function toggleFilterChip(el, key, value) {
    el.classList.toggle('selected');
    // 실제 저장은 applyFilters에서
}

function resetFilters() {
    _discoverFilters = {};
    localStorage.removeItem('bj_filters');
    document.getElementById('f-age-min').value = '';
    document.getElementById('f-age-max').value = '';
    document.querySelectorAll('#f-regions .filter-chip, #f-mbtis .filter-chip').forEach(c => c.classList.remove('selected'));
    updateFilterBtnBadge();
    toast('필터 초기화', 'success');
}

function applyFilters() {
    const ageMin = parseInt(document.getElementById('f-age-min').value) || null;
    const ageMax = parseInt(document.getElementById('f-age-max').value) || null;
    const regions = [...document.querySelectorAll('#f-regions .filter-chip.selected')].map(c => c.textContent);
    const mbtis = [...document.querySelectorAll('#f-mbtis .filter-chip.selected')].map(c => c.textContent);
    _discoverFilters = {};
    if (ageMin) _discoverFilters.ageMin = ageMin;
    if (ageMax) _discoverFilters.ageMax = ageMax;
    if (regions.length) _discoverFilters.regions = regions;
    if (mbtis.length) _discoverFilters.mbtis = mbtis;
    localStorage.setItem('bj_filters', JSON.stringify(_discoverFilters));
    closeFiltersModal();
    updateFilterBtnBadge();
    // 일일 추천 캐시 무효화 후 재렌더
    const dailyKey = 'bj_daily_recs_' + new Date().toISOString().slice(0, 10);
    localStorage.removeItem(dailyKey);
    _cardIndex = 0;
    _swipedCount = 0;
    saveDailySwipeCount();
    if (window._allCandidates) renderMatchRanking(window._allCandidates);
    toast('필터 적용됨', 'success');
}

function updateFilterBtnBadge() {
    const btn = document.getElementById('discover-filter-btn');
    const badge = document.getElementById('filter-count-badge');
    if (!btn || !badge) return;
    const count = (_discoverFilters.ageMin ? 1 : 0)
        + (_discoverFilters.ageMax ? 1 : 0)
        + (_discoverFilters.regions?.length || 0 ? 1 : 0)
        + (_discoverFilters.mbtis?.length || 0 ? 1 : 0);
    if (count > 0) {
        btn.classList.add('has-filter');
        badge.textContent = '(' + count + ')';
    } else {
        btn.classList.remove('has-filter');
        badge.textContent = '';
    }
}

// 최근 접속 배지 빌더
function buildSeenBadge(iso) {
    if (!iso) return '';
    const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (hours < 1) return '<span class="seen-badge seen-online"><i class="fa-solid fa-circle" style="font-size:.55em;"></i> 방금 접속</span>';
    if (hours < 24) return '<span class="seen-badge seen-online"><i class="fa-solid fa-circle" style="font-size:.55em;"></i> 오늘 접속</span>';
    if (hours < 72) return '<span class="seen-badge seen-recent">최근 접속</span>';
    if (hours < 24*14) return '<span class="seen-badge" style="color:#9ca3af;">1주일 전</span>';
    return '';
}

// ── 터치 스와이프 ──
let _swipeStartX = 0, _swipeStartY = 0, _swiping = false;
function initSwipe() {
    const card = document.getElementById('current-card');
    if (!card) return;
    card.addEventListener('touchstart', e => {
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swiping = true;
        card.style.transition = 'none';
    }, { passive: true });
    card.addEventListener('touchmove', e => {
        if (!_swiping) return;
        const dx = e.touches[0].clientX - _swipeStartX;
        const dy = e.touches[0].clientY - _swipeStartY;
        if (Math.abs(dx) < Math.abs(dy)) return; // 세로 스크롤 우선
        const rot = dx * 0.08;
        card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
        card.style.opacity = Math.max(0.5, 1 - Math.abs(dx) / 400);
    }, { passive: true });
    card.addEventListener('touchend', e => {
        if (!_swiping) return;
        _swiping = false;
        const dx = e.changedTouches[0].clientX - _swipeStartX;
        card.style.transition = 'transform .3s, opacity .3s';
        if (dx > 80) {
            const c = _scoredCandidates[_cardIndex];
            if (c) cardLike(c.id);
        } else if (dx < -80) {
            cardPass();
        } else {
            card.style.transform = '';
            card.style.opacity = '1';
        }
    });
}

function cardPass() {
    if (_isCardAnimating) return;
    _isCardAnimating = true;
    const el = document.getElementById('current-card');
    if (el) { el.classList.add('swiping-left'); }
    _swipedCount++;
    saveDailySwipeCount();
    logEvent('card_pass', { index: _cardIndex });
    setTimeout(() => {
        _cardIndex++;
        _isCardAnimating = false;
        renderCardView(document.getElementById('match-ranking-section'), window._favSet || new Set());
    }, 280);
}

function cardLike(id) {
    if (_isCardAnimating) return;
    // pending 상태 안내
    if (window._myProfile && (window._myProfile.status === 'pending' || window._myProfile.status === 'pending_reputation')) {
        toast('심사 통과 후 찜할 수 있어요. 먼저 둘러보세요!', 'info');
        return;
    }
    // 이미 찜한 사람이면 해제 대신 패스 (잘못된 toggle 방지)
    const favSet = window._favSet || new Set();
    if (favSet.has(id)) {
        toast('이미 찜한 사람이에요. 관심 탭에서 확인하세요!', 'info');
        cardPass();
        return;
    }
    // 찜 슬롯 확인
    const maxFav = (window._myProfile?.fav_slots) || 3;
    if (favSet.size >= maxFav) {
        toast(`최대 ${maxFav}명까지만 찜할 수 있어요. 기존 찜을 해제해주세요.`, 'warning');
        return;
    }
    _isCardAnimating = true;
    const el = document.getElementById('current-card');
    if (el) { el.classList.add('swiping-right'); }
    _swipedCount++;
    saveDailySwipeCount();

    // 즉시 optimistic update (toggleFav의 _favToggling 락 우회)
    favSet.add(id);
    window._favSet = favSet;
    toast(`찜 목록에 담았어요 (${favSet.size}/${maxFav})`, 'success');
    logEvent('card_like', { liked: id });
    // DB insert (비동기, non-blocking) + 디바운스 동기화
    (async () => {
        try {
            const { data: { user } } = await db.auth.getUser();
            await db.from('favorites').insert([{ user_id: user.id, applicant_id: id }]);
            // 연속 찜 시 마지막 것만 동기화 (1.5초 대기)
            clearTimeout(window._favSyncTimer);
            window._favSyncTimer = setTimeout(async () => {
                const { data: { user: u } } = await db.auth.getUser();
                await loadFavorites(u.id);
                loadMutualInterests(u.id);
            }, 1500);
            // 상대방 정보 조회 + 상호 찜 확인
            const { data: tgt } = await db.from('applicants').select('id,user_id,name').eq('id', id).limit(1);
            if (tgt?.[0]?.user_id) {
                const { data: rev } = await db.from('favorites').select('id').eq('user_id', tgt[0].user_id).eq('applicant_id', window._myProfile.id).limit(1);
                if (rev?.length > 0) {
                    // 상호 찜 → 자동 매칭!
                    await autoMatch(tgt[0].id, tgt[0].user_id, tgt[0].name);
                } else {
                    sendPushNotif(tgt[0].user_id, '💝 누군가 관심을 표현했어요', '관심 탭을 확인해보세요', dashUrl('interest'), 'interest');
                }
            }
        } catch(e) {
            favSet.delete(id); // 실패 시 롤백
            console.log('cardLike fav error:', e.message);
        }
    })();

    setTimeout(() => {
        _cardIndex++;
        _isCardAnimating = false;
        renderCardView(document.getElementById('match-ranking-section'), window._favSet || new Set());
    }, 280);
}

async function toggleFav(applicantId, opts) {
    opts = opts || {};
    if (window._favToggling) return;
    // pending 상태 차단
    if (window._myProfile && (window._myProfile.status === 'pending' || window._myProfile.status === 'pending_reputation')) {
        toast('심사 통과 후 찜할 수 있어요', 'info');
        return;
    }
    window._favToggling = true;
    try {
    const { data: { user } } = await db.auth.getUser();
    const favSet = window._favSet || new Set();
    if (favSet.has(applicantId)) {
        await db.from('favorites').delete().eq('user_id', user.id).eq('applicant_id', applicantId);
        favSet.delete(applicantId);
        toast('찜 목록에서 제거했어요');
    } else {
        const maxFav = (window._myProfile && window._myProfile.fav_slots) || 3;
        if (favSet.size >= maxFav) {
            toast(`최대 ${maxFav}명까지만 찜할 수 있어요. 기존 찜을 해제해주세요.`, 'warning');
            return;
        }
        await db.from('favorites').insert([{ user_id: user.id, applicant_id: applicantId }]);
        favSet.add(applicantId);
        toast(`찜 목록에 담았어요 (${favSet.size}/${maxFav})`, 'success');
        logEvent('card_like', { liked: applicantId });
        // 상대방 정보 조회 + 상호 찜 확인
        (async () => {
            try {
                const { data: tgt } = await db.from('applicants').select('id,user_id,name').eq('id', applicantId).limit(1);
                if (tgt && tgt[0] && tgt[0].user_id) {
                    const { data: reverse } = await db.from('favorites')
                        .select('id').eq('user_id', tgt[0].user_id).eq('applicant_id', window._myProfile.id).limit(1);
                    if (reverse && reverse.length > 0) {
                        // 상호 찜 → 자동 매칭!
                        await autoMatch(tgt[0].id, tgt[0].user_id, tgt[0].name);
                    } else {
                        sendPushNotif(tgt[0].user_id, '💝 누군가 관심을 표현했어요', '관심 탭을 확인해보세요', dashUrl('interest'), 'interest');
                    }
                }
            } catch(e) { console.log('fav push error:', e.message); }
        })();
    }
    window._favSet = favSet;
    // cardLike에서 호출된 경우 카드 순서 재배치 방지 (진행 중인 스와이프 흐름 유지)
    if (!opts.skipRerender) {
        renderMatchRanking(window._allCandidates || []);
    }
    // 디바운스: 연속 조작 시 마지막 것만 DB 동기화
    clearTimeout(window._favSyncTimer);
    window._favSyncTimer = setTimeout(async () => {
        await loadFavorites(user.id);
        loadMutualInterests(user.id);
    }, 800);
    } finally { window._favToggling = false; }
}

async function removeFav(applicantId) {
    if (!confirm('찜을 해제하시겠어요?')) return;
    const { data: { user } } = await db.auth.getUser();
    await db.from('favorites').delete().eq('user_id', user.id).eq('applicant_id', applicantId);
    toast('찜 목록에서 제거했어요');
    await loadFavorites(user.id);
    await loadMutualInterests(user.id);
}

// ── 나를 찜한 사람 ──
async function loadWhoLikedMe() {
    const card = document.getElementById('liked-me-card');
    const sec = document.getElementById('liked-me-section');
    if (!window._myProfile) { return; }
    try {
        const { data } = await db.rpc('get_who_liked_me', { my_applicant_id: window._myProfile.id });
        window._likedMeData = data || [];
        updateInterestBadge();
        card.style.display = '';
        if (!data || data.length === 0) {
            document.getElementById('liked-me-count').textContent = '';
            sec.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:.88em;"><i class="fa-solid fa-eye" style="color:#ede9fe;font-size:1.5em;display:block;"></i>아직 나를 찜한 사람이 없어요</div>';
            updateInterestEmptyState();
            return;
        }
        document.getElementById('liked-me-count').textContent = data.length + '명';
        sec.innerHTML = `
            <div style="font-size:.82em;color:var(--muted);margin-bottom:14px;">이 분들이 당신에게 관심을 보냈어요!</div>
            <div class="fav-list">${data.map(a => {
                const age = calcAge(a.birth);
                const photo = a.photos && a.photos[0];
                const photoHtml = photo
                    ? '<div class="fav-photo"><img loading="lazy" src="' + photo + '" alt=""></div>'
                    : '<div class="fav-photo">' + (a.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>') + '</div>';
                const tags = [age ? age + '세' : null, a.job, a.location, a.mbti].filter(Boolean)
                    .map(t => '<span class="fav-tag">' + esc(t) + '</span>').join('');
                return '<div class="fav-item" style="cursor:pointer;" onclick="openProfileModal(\'' + a.id + '\')">' + photoHtml + '<div class="fav-info"><div class="fav-tags">' + tags + '</div></div><span style="color:#f59e0b;font-size:1.1em;"><i class="fa-solid fa-heart"></i></span></div>';
            }).join('')}</div>`;
    } catch(e) {
        console.log('loadWhoLikedMe error:', e.message);
    }
    updateInterestEmptyState();
}

// ── 상호 관심 감지 & 자동 매칭 ──
async function loadMutualInterests(userId) {
    try {
        const { data: mutualIds } = await db.rpc('get_mutual_favorites', { my_user_id: userId });
        window._mutualSet = new Set(mutualIds || []);

        renderMutualSection();
        // 추천 목록에 상호 관심 배지 업데이트 — 카드 스와이프 중에는 스킵 (순서 꼬임 방지)
        if (!_isCardAnimating) {
            renderMatchRanking(window._allCandidates || []);
        }
    } catch(e) {
        console.log('mutual interest load error:', e.message);
        window._mutualSet = new Set();
    }
}

// 상호 찜 감지 시 자동 매칭 처리
async function autoMatch(targetApplicantId, targetUserId, targetName) {
    if (!window._myProfile) return;
    // 이미 매칭 상태면 스킵
    if (window._myProfile.status === 'matched') return;
    try {
        const myId = window._myProfile.id;
        const { data: matched, error } = await db.rpc('auto_match_if_mutual', {
            p_target_applicant_id: targetApplicantId
        });
        if (error) throw error;
        if (!matched) return;
        // 내 프로필 상태 업데이트
        window._myProfile.status = 'matched';
        window._myProfile.matched_with = targetApplicantId;
        // 양쪽에 알림
        const { data: { user } } = await db.auth.getUser();
        await db.from('notifications').insert([
            { user_id: user.id, type: 'matched', title: `${targetName}님과 매칭되었어요!`, body: '대화를 시작해보세요.' },
            { user_id: targetUserId, type: 'matched', title: `${window._myProfile.name}님과 매칭되었어요!`, body: '대화를 시작해보세요.' }
        ]);
        sendPushNotif(targetUserId, '매칭 성사!', `${window._myProfile.name}님과 매칭되었어요!`, dashUrl('chat'), 'matched');
        logEvent('auto_match', { matched_with: targetApplicantId });
        // 축하 모달 표시
        showMatchCelebrate(targetApplicantId, targetName, targetUserId);
    } catch(e) {
        console.log('autoMatch error:', e.message);
        toast('매칭 처리 중 오류가 발생했어요.', 'error');
    }
}

// 매칭 축하 모달
function showMatchCelebrate(applicantId, name, partnerUserId) {
    showConfetti();
    const overlay = document.getElementById('match-celebrate-overlay');
    const content = document.getElementById('match-celebrate-content');
    // 상대 사진 찾기
    const candidate = (window._allCandidates || []).find(c => c.id === applicantId);
    const photo = candidate?.photos?.[0];
    const photoHtml = photo
        ? `<img src="${photo}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #ede9fe;">`
        : `<div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#ede9fe,#fce7f3);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto;"><i class="fa-solid fa-heart" style="color:#ec4899;"></i></div>`;
    content.innerHTML = `
        <div style="font-size:3em;margin-bottom:12px;">💑</div>
        <div style="font-size:1.3em;font-weight:900;color:#111;margin-bottom:6px;">매칭 성사!</div>
        <div style="font-size:.88em;color:var(--muted);margin-bottom:20px;line-height:1.5;">${esc(name)}님과 서로 관심을 보냈어요.<br>이제 대화를 시작할 수 있어요!</div>
        <div style="margin-bottom:24px;">${photoHtml}</div>
        <button onclick="startChatFromCelebrate('${applicantId}','${partnerUserId}','${escJs(name)}')" style="width:100%;padding:14px;background:#111;color:#fff;border:none;border-radius:12px;font-size:1em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px;">
            <i class="fa-regular fa-comment-dots"></i> 대화 시작하기
        </button>
        <button onclick="closeMatchCelebrate()" style="width:100%;padding:12px;background:#f3f4f6;color:#6b7280;border:none;border-radius:12px;font-size:.88em;font-weight:600;cursor:pointer;font-family:inherit;">
            나중에 할게요
        </button>`;
    overlay.style.display = 'flex';
}

function closeMatchCelebrate() {
    document.getElementById('match-celebrate-overlay').style.display = 'none';
}

async function startChatFromCelebrate(applicantId, partnerUserId, partnerName) {
    closeMatchCelebrate();
    // 채팅방 목록에 추가
    const candidate = (window._allCandidates || []).find(c => c.id === applicantId);
    window._chatRooms = window._chatRooms || [];
    if (!window._chatRooms.some(r => r.userId === partnerUserId)) {
        window._chatRooms.push({
            applicantId, userId: partnerUserId, name: partnerName,
            photo: candidate?.photos?.[0] || null, gender: candidate?.gender || 'male'
        });
    }
    // 매칭 결과 표시
    if (candidate) renderMatchResult(candidate);
    // 대화 탭으로 전환 후 채팅방 열기
    switchTab('chat');
    await openChatRoom(partnerUserId, partnerName, candidate?.photos?.[0] || '', candidate?.gender || 'male');
}

function renderMutualSection() {
    const card = document.getElementById('mutual-card');
    const sec = document.getElementById('mutual-section');
    const mutualSet = window._mutualSet || new Set();
    const candidates = window._allCandidates || [];
    const mutuals = candidates.filter(c => mutualSet.has(c.id));

    sec.style.display = '';
    if (mutuals.length === 0) {
        document.getElementById('mutual-count').textContent = '';
        sec.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:.88em;"><i class="fa-solid fa-heart-circle-bolt" style="color:#ede9fe;font-size:1.5em;display:block;"></i>서로 찜하면 여기에 표시돼요</div>';
        return;
    }
    document.getElementById('mutual-count').textContent = mutuals.length + '명';
    const isMatched = window._myProfile && window._myProfile.status === 'matched';

    sec.innerHTML = `
        <div style="font-size:.82em;color:var(--muted);margin-bottom:14px;">${isMatched ? '매칭된 상대예요!' : '서로 관심을 보낸 상대예요! 매칭이 자동으로 진행됩니다.'}</div>
        ${mutuals.map(c => {
            const age = calcAge(c.birth);
            const photo = c.photos && c.photos[0];
            const photoHtml = photo
                ? `<div class="match-photo"><img loading="lazy" src="${photo}" alt=""></div>`
                : `<div class="match-photo">${c.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
            const tags = [age ? age + '세' : null, c.location, c.mbti, c.job_category].filter(Boolean)
                .map(t => `<span class="match-tag">${esc(t)}</span>`).join('');
            const matchedWithMe = window._myProfile && window._myProfile.matched_with === c.id;
            let actionHtml;
            if (matchedWithMe) {
                actionHtml = `<button class="btn-match-request" style="background:#10b981;border-color:#10b981;color:#fff;" onclick="event.stopPropagation();switchTab('chat')"><i class="fa-regular fa-comment-dots"></i> 대화하기</button>`;
            } else {
                actionHtml = `<span class="mutual-badge"><i class="fa-solid fa-heart-circle-bolt"></i> 상호 관심</span>`;
            }
            return `<div class="mutual-item" style="cursor:pointer;${matchedWithMe ? 'background:linear-gradient(135deg,#faf5ff,#fdf2f8);border:1px solid #ede9fe;' : ''}" onclick="openProfileModal('${c.id}')">
                ${photoHtml}
                <div class="match-info" style="flex:1;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        ${matchedWithMe ? '<span class="mutual-badge" style="background:#d1fae5;color:#065f46;"><i class="fa-solid fa-heart-pulse"></i> 매칭됨</span>' : '<span class="mutual-badge"><i class="fa-solid fa-heart-circle-bolt"></i> 상호 관심</span>'}
                    </div>
                    <div class="match-tags">${tags}</div>
                </div>
                <div style="flex-shrink:0;" onclick="event.stopPropagation();">${actionHtml}</div>
            </div>`;
        }).join('')}`;
}

async function loadFavorites(userId) {
    const { data: favs } = await db.from('favorites').select('applicant_id').eq('user_id', userId);
    if (!favs || !favs.length) { window._favSet = new Set(); renderFavorites([]); return; }
    const ids = favs.map(f => f.applicant_id);
    const { data: applicants } = await db.from('applicants')
        .select('id,gender,birth,job,location,mbti,photos,status')
        .in('id', ids);
    // 활성 유저만 favSet에 포함 (거절/삭제된 유저 제외)
    const ACTIVE_STATUS = ['approved', 'matched'];
    const visibleFavs = (applicants || []).filter(a => ACTIVE_STATUS.includes(a.status));
    window._favSet = new Set(visibleFavs.map(a => a.id));
    renderFavorites(visibleFavs);
}

// (reportUser, blockUser → 하단에 올바른 컬럼명으로 정의됨)

// (레거시 messages 테이블 코드 제거 — chat_messages 시스템으로 통합됨)

// ── 프로필 상세 모달 ──
async function openProfileModal(applicantId) {
    let c = (_scoredCandidates || []).find(x => x.id === applicantId)
         || (window._allCandidates || []).find(x => x.id === applicantId)
         || (window._likedMeData || []).find(x => x.id === applicantId);
    if (!c) {
        // fallback: DB에서 직접 조회 (평판 대기 중 유저 등)
        try {
            const { data } = await db.from('applicants').select('*').eq('id', applicantId).limit(1);
            if (data && data[0]) c = data[0];
        } catch(e) {}
    }
    if (!c) return;
    const age = calcAge(c.birth);
    const photos = c.photos || [];
    const photo = photos[0];
    const photoHtml = photo
        ? `<img loading="lazy" src="${photo}" alt="" id="pm-main-photo">`
        : `<div class="pm-photo-placeholder">${c.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
    // 다중 사진 네비 (2장 이상)
    const pmDotsHtml = photos.length > 1
        ? `<div class="photo-dots" style="position:absolute;top:8px;left:10px;right:10px;display:flex;gap:3px;z-index:5;">${photos.map((_, i) => `<div class="photo-dot ${i===0?'active':''}" style="flex:1;height:3px;background:rgba(255,255,255,${i===0?'.95':'.35'});border-radius:2px;"></div>`).join('')}</div>
            <div style="position:absolute;top:0;bottom:0;left:0;width:38%;z-index:4;cursor:pointer;" onclick="pmPrevPhoto()"></div>
            <div style="position:absolute;top:0;bottom:0;right:0;width:38%;z-index:4;cursor:pointer;" onclick="pmNextPhoto()"></div>`
        : '';
    const isFav = (window._favSet || new Set()).has(c.id);
    const isMutual = (window._mutualSet || new Set()).has(c.id);

    // 궁합 점수 + 상세 + 매칭 확률
    const compatDetail = window._myProfile ? calcMatchScore(window._myProfile, c, { detailed: true }) : null;
    const compat = compatDetail ? compatDetail.total : 50;
    const mbtiCompat = window._myProfile ? calcMbtiCompat(window._myProfile.mbti, c.mbti) : 50;
    const mbtiLabel = mbtiCompat >= 80 ? '찰떡궁합! <i class="fa-solid fa-fire" style="color:#ef4444;"></i>' : mbtiCompat >= 65 ? '궁합 좋아요 <i class="fa-solid fa-star" style="color:#f59e0b;"></i>' : mbtiCompat >= 50 ? '보통' : '다른 스타일';
    const matchProb = window._myProfile ? calcMatchProbability(window._myProfile, c, { favCount: c._favCount || 0 }) : null;
    let breakdownHtml = '';
    if (compatDetail) {
        breakdownHtml = compatDetail.categories.map(cat => {
            const color = cat.score >= 80 ? '#22c55e' : cat.score >= 60 ? '#f59e0b' : '#9ca3af';
            return `<div class="compat-row">
                <span class="compat-row-icon"><i class="fa-solid ${cat.icon}"></i></span>
                <span class="compat-row-label">${cat.label}</span>
                <div class="compat-row-bar"><div class="compat-row-fill" style="width:${cat.score}%;background:${color};"></div></div>
                <span class="compat-row-val" style="color:${color};">${cat.score}</span>
            </div>`;
        }).join('');
    }

    // Ice Breaker
    let ibHtml = '';
    if (c.icebreaker) {
        try {
            const ib = JSON.parse(c.icebreaker);
            ibHtml = `<div class="pm-section"><div class="pm-section-title"><i class="fa-solid fa-comment" style="color:var(--primary);"></i> Ice Breaker</div><div class="pm-ib"><div class="pm-ib-q">${esc(ib.q)}</div><div class="pm-ib-a">${esc(ib.a)}</div></div></div>`;
        } catch {}
    }

    // 이상형
    let idealHtml = '';
    if (c.ideal) {
        try {
            const d = JSON.parse(c.ideal);
            // 카테고리 칩 (배열형 값만)
            const chips = Object.entries(d)
                .filter(([k, v]) => k !== 'memo' && k !== 'notes' && Array.isArray(v))
                .flatMap(([k, v]) => v);
            // 생년 범위 칩
            const yearChips = [];
            if (d['생년_시작'] != null || d['생년_끝'] != null) {
                yearChips.push(`${d['생년_시작'] ?? '?'} ~ ${d['생년_끝'] ?? '?'}년생`);
            }
            const allChips = [...yearChips, ...chips];
            if (allChips.length > 0 || d.memo) {
                idealHtml = `<div class="pm-section"><div class="pm-section-title"><i class="fa-solid fa-heart" style="color:#ec4899;"></i> 이런 사람을 찾고 있어요</div><div>${allChips.map(c => `<span class="pm-ideal-chip">${esc(c)}</span>`).join('')}</div>${d.memo ? `<div style="margin-top:8px;font-size:.82em;color:var(--muted);font-style:italic;">"${esc(d.memo)}"</div>` : ''}</div>`;
            }
        } catch {}
    }

    const tags = [age ? `${age}세` : null, c.job, c.height ? c.height + 'cm' : null, c.location, c.mbti, c.education, c.religion, c.smoking, c.drinking, c.hobby].filter(Boolean);
    const popCount = c._favCount || 0;

    // 평판 조회
    let reputations = [];
    try {
        const { data: repData } = await db.from('reputations').select('*').eq('target_applicant_id', c.id).order('created_at', { ascending: false });
        reputations = repData || [];
    } catch(e) {}
    // 작성자 이름 매핑
    const writerIds = [...new Set(reputations.map(r => r.writer_applicant_id))];
    const writerMap = {};
    if (writerIds.length > 0) {
        try {
            const { data: writers } = await db.from('applicants').select('id,name,gender,photos').in('id', writerIds);
            (writers || []).forEach(w => { writerMap[w.id] = w; });
        } catch(e) {}
    }
    const myApplicantId = window._myProfile?.id;
    const isSelf = myApplicantId === c.id;
    const myRep = reputations.find(r => r.writer_applicant_id === myApplicantId);
    const canWriteReputation = !isSelf && myApplicantId && (window._myProfile?.status === 'approved' || window._myProfile?.status === 'matched');

    const repsSection = reputations.length > 0
        ? `<div class="pm-section">
            <div class="pm-section-title"><i class="fa-solid fa-handshake" style="color:var(--primary);"></i> 나를 보증한 사람들 (${reputations.length})</div>
            ${reputations.map(r => {
                const w = writerMap[r.writer_applicant_id] || {};
                const wPhoto = (w.photos && w.photos[0])
                    ? `<img loading="lazy" src="${w.photos[0]}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                    : `<div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:.9em;">${w.gender==='male'?'<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>':'<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
                return `<div style="display:flex;gap:10px;padding:10px;background:var(--bg);border-radius:10px;margin-bottom:6px;align-items:flex-start;">
                    ${wPhoto}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.82em;font-weight:700;display:flex;align-items:center;gap:4px;">
                            ${esc(w.name || '익명')}
                            ${r.is_referrer ? '<span style="font-size:.68em;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#b45309;font-weight:700;">추천인</span>' : ''}
                        </div>
                        <div style="font-size:.82em;color:#374151;margin-top:3px;line-height:1.5;">"${esc(r.content)}"</div>
                    </div>
                </div>`;
            }).join('')}
        </div>`
        : (isSelf ? '' : '<div class="pm-section"><div class="pm-section-title"><i class="fa-solid fa-handshake" style="color:var(--muted);"></i> 아직 평판이 없어요</div></div>');

    const repWriteBtn = canWriteReputation
        ? `<button class="btn btn-outline" onclick="openReputationModal('${c.id}','${escJs(c.name || '')}')" style="width:100%;">
            <i class="fa-solid fa-pen"></i> ${myRep ? '내 평판 수정' : '보증하기 (평판 남기기)'}
          </button>`
        : '';

    // 프로필 조회 기록 (fire-and-forget)
    if (window._myProfile && window._myProfile.id !== c.id) {
        db.from('profile_views')
            .upsert({ viewer_id: window._myProfile.id, viewed_id: c.id, viewed_at: new Date().toISOString() },
                    { onConflict: 'viewer_id,viewed_id' })
            .then(() => {}, () => {});
    }

    window._pmPhotos = photos;
    window._pmPhotoIdx = 0;
    document.getElementById('profile-modal-content').innerHTML = `
        <div class="pm-photo" style="position:relative;">${photoHtml}${pmDotsHtml}
            <div class="pm-photo-overlay">
                <div style="font-size:1.3em;font-weight:900;">${age ? age + '세' : ''}</div>
                ${c.mbti ? `<div style="font-size:.85em;font-weight:700;opacity:.9;">${c.mbti}</div>` : ''}
            </div>
        </div>
        <div class="pm-body">
            ${isMutual ? `<div style="text-align:center;padding:10px;background:linear-gradient(135deg,#faf5ff,#fdf2f8);border-radius:12px;margin-bottom:14px;"><span class="mutual-badge" style="font-size:.85em;"><i class="fa-solid fa-heart-circle-bolt"></i> 서로 관심을 보냈어요!</span></div>` : ''}
            ${popCount > 0 ? `<div style="margin-bottom:12px;"><span class="popularity-badge"><i class="fa-solid fa-fire"></i> ${popCount}명이 관심</span></div>` : ''}
            <div class="pm-section">
                <div class="pm-tags">${tags.map(t => `<span class="pm-tag">${esc(t)}</span>`).join('')}</div>
            </div>
            <div class="pm-section">
                <div class="pm-section-title" style="display:flex;justify-content:space-between;align-items:center;">궁합 ${matchProb ? `<span class="match-prob-badge"><i class="fa-solid fa-chart-line"></i> 매칭 확률 ${matchProb}%</span>` : ''}</div>
                <div class="pm-compat">
                    <div class="pm-compat-score">${compat}%</div>
                    <div style="flex:1;">
                        <div class="pm-compat-bar"><div class="pm-compat-fill" style="width:${compat}%"></div></div>
                        <div style="font-size:.72em;color:var(--muted);margin-top:4px;">MBTI ${mbtiLabel} (${mbtiCompat}%)</div>
                    </div>
                </div>
                ${breakdownHtml ? `<button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.nextElementSibling.style.display==='none'?'궁합 자세히 보기 ▾':'접기 ▴';" style="width:100%;margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:10px;background:#fafafa;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit;color:#374151;">궁합 자세히 보기 ▾</button><div class="compat-breakdown" style="display:none;">${breakdownHtml}</div>` : ''}
            </div>
            ${c.intro ? `<div class="pm-section"><div class="pm-section-title">자기소개</div><div class="pm-intro">${esc(c.intro)}</div></div>` : ''}
            ${ibHtml}
            ${idealHtml}
            ${repsSection}
            ${repWriteBtn ? `<div style="padding:0 4px 12px;">${repWriteBtn}</div>` : ''}
        </div>
        <div class="pm-actions">
            ${isSelf ? '' : `<button class="btn ${isFav ? 'btn-outline' : 'btn-primary'}" onclick="toggleFav('${c.id}');closeProfileModal();">${isFav ? '💜 찜 해제' : '🤍 찜하기'}</button>`}
            <button class="btn btn-outline" onclick="closeProfileModal()">닫기</button>
        </div>
        <div style="text-align:center;padding:8px 20px 16px;border-top:1px solid #f3f4f6;">
            <button onclick="reportUser('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:.75em;color:#d1d5db;">신고</button>
            <span style="color:#e5e7eb;margin:0 8px;">|</span>
            <button onclick="blockUser('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:.75em;color:#d1d5db;">차단</button>
        </div>`;
    document.getElementById('profile-modal').classList.add('open');
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.remove('open');
}

// 프로필 모달 사진 네비
function pmNextPhoto() {
    const photos = window._pmPhotos || [];
    if (window._pmPhotoIdx < photos.length - 1) {
        window._pmPhotoIdx++;
        const img = document.getElementById('pm-main-photo');
        if (img) img.src = photos[window._pmPhotoIdx];
        document.querySelectorAll('#profile-modal-content .pm-photo .photo-dot').forEach((d, i) => {
            d.style.background = i === window._pmPhotoIdx ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)';
        });
    }
}
function pmPrevPhoto() {
    if (window._pmPhotoIdx > 0) {
        window._pmPhotoIdx--;
        const img = document.getElementById('pm-main-photo');
        if (img) img.src = window._pmPhotos[window._pmPhotoIdx];
        document.querySelectorAll('#profile-modal-content .pm-photo .photo-dot').forEach((d, i) => {
            d.style.background = i === window._pmPhotoIdx ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)';
        });
    }
}

// ESC로 모달 닫기
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeProfileModal();
        closeNotifPanel();
    }
});

// ── 알림 시스템 ──
let _notifications = [];
async function loadNotifications() {
    try {
        const { data: { user: _u } } = await db.auth.getUser();
        const { data } = await db.from('notifications')
            .select('*')
            .eq('user_id', _u.id)
            .order('created_at', { ascending: false })
            .limit(30);
        const prev = _notifications.filter(n => !n.is_read).length;
        _notifications = data || [];
        const curr = _notifications.filter(n => !n.is_read).length;
        renderNotifBadge();
        renderNotifList();
        // 새 알림이 있으면 브라우저 알림
        if (curr > prev && curr > 0) {
            const newest = _notifications.find(n => !n.is_read);
            if (newest) showBrowserNotif(newest.title, newest.body);
        }
    } catch(e) { console.log('notif load error:', e.message); /* 알림 로드 실패는 치명적이지 않으므로 silent */ }
}

// 브라우저 알림
function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function showBrowserNotif(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body || '', icon: '💎', tag: 'banjjok' });
    }
}

// ── 웹 푸시 구독 ──
const VAPID_PUBLIC_KEY = 'BOdeItX6XfLYpClc_aGeMhO5Y3YZkJJmxCCDuMlCnGtlwslwKWPgkEakeafVBgTbS-qufoU-vWwuecUhA0vxees';

function urlB64ToUint8Array(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

async function setupPushSubscription(showToast) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (showToast) toast('이 브라우저는 푸시 알림을 지원하지 않아요', 'info');
        return false;
    }
    try {
        const perm = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
        if (perm !== 'granted') {
            if (showToast) toast('알림 권한이 거부되었어요', 'info');
            return false;
        }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }
        const { data: { user } } = await db.auth.getUser();
        if (!user) return false;
        const p256dh = arrayBufferToBase64(sub.getKey('p256dh'));
        const auth = arrayBufferToBase64(sub.getKey('auth'));
        await db.from('push_subscriptions').upsert({
            user_id: user.id,
            endpoint: sub.endpoint,
            p256dh, auth
        }, { onConflict: 'endpoint' });
        if (showToast) toast('알림이 켜졌어요!', 'success');
        localStorage.setItem('bj_push_enabled', '1');
        return true;
    } catch(e) {
        console.error('Push subscription error:', e);
        if (showToast) toast('푸시 설정 실패: ' + e.message, 'error');
        return false;
    }
}

async function sendPushNotif(userId, title, body, url, type) {
    try {
        // 수신자 알림 환경설정 확인
        if (type) {
            const { data } = await db.from('applicants')
                .select('notification_prefs').eq('user_id', userId).limit(1);
            const prefs = data?.[0]?.notification_prefs;
            if (prefs && prefs[type] === false) return; // 해당 타입 off
        }
        await db.functions.invoke('send-push', {
            body: { user_id: userId, title, body, url }
        });
    } catch(e) {
        console.log('send-push error:', e.message);
    }
}

// 알림 환경설정 토글
async function toggleNotifPref(type) {
    if (!window._myProfile) return;
    const prefs = { match:true, message:true, interest:true, mutual:true, approved:true, inquiry_reply:true, announcement:true, ...(window._myProfile.notification_prefs || {}) };
    prefs[type] = !(prefs[type] !== false); // toggle (default true → false → true)
    window._myProfile.notification_prefs = prefs;
    try {
        await db.from('applicants').update({ notification_prefs: prefs }).eq('id', window._myProfile.id);
        renderNotifPrefsUI();
    } catch(e) { toast('설정 저장 실패', 'error'); }
}

function renderNotifPrefsUI() {
    if (!window._myProfile) return;
    const prefs = { match:true, message:true, interest:true, mutual:true, approved:true, inquiry_reply:true, announcement:true, ...(window._myProfile.notification_prefs || {}) };
    document.querySelectorAll('.notif-pref-switch').forEach(sw => {
        const key = sw.dataset.pref;
        sw.classList.toggle('on', prefs[key] !== false);
    });
}

// ── 알림 네비게이션 ──
const DASH_BASE = 'https://kyhwow-rgb.github.io/banjjok/dashboard.html';
function dashUrl(section) { return DASH_BASE + '#tab-' + section; }

// 알림 type → 이동할 탭/섹션
function navigateByNotifType(type, relatedId) {
    const setHash = (tab, extra) => {
        const hash = '#tab-' + tab + (extra || '');
        if (location.hash !== hash) history.replaceState(history.state || {}, '', hash);
    };
    switch(type) {
        case 'interest':
        case 'mutual':
            switchTab('interest');
            setHash('interest');
            setTimeout(() => {
                if (type === 'mutual') {
                    document.getElementById('mutual-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
                    if (relatedId) setTimeout(() => openProfileModal(relatedId), 180);
                }
            }, 150);
            break;
        case 'matched':
        case 'match':
            switchTab('interest');
            setHash('interest', '#match-result-card');
            setTimeout(() => document.getElementById('match-result-card')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200);
            break;
        case 'message':
        case 'chat_message':
            switchTab('chat');
            setHash('chat');
            break;
        case 'approved':
            switchTab('discover');
            setHash('discover');
            break;
        case 'rejected':
            switchTab('my');
            setHash('my');
            break;
        case 'inquiry_reply':
            switchTab('my');
            setHash('my', '#inquiry-history');
            setTimeout(() => document.getElementById('inquiry-history')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200);
            break;
        case 'reputation_request':
            // 지인이 내 코드로 가입 — 그 사람 프로필 열어 "보증하기" 유도
            if (relatedId) {
                openProfileModal(relatedId);
            } else {
                switchTab('my');
                setHash('my');
            }
            break;
        case 'reputation_received':
            // 내가 평판 받음 — MY 탭 내 평판 섹션
            switchTab('my');
            setHash('my', '#my-reputation-box');
            setTimeout(() => document.getElementById('my-reputation-box')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200);
            break;
        case 'reputation_complete':
            // 평판 2개 모여 심사 시작 — MY 탭으로
            switchTab('my');
            setHash('my');
            break;
        default:
            switchTab('my');
            setHash('my');
    }
}

// URL hash로 탭 이동 (푸시 알림 클릭 등)
function handleNavHash() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    if (hash.startsWith('tab-')) {
        const tab = hash.slice(4);
        if (['discover','interest','chat','my'].includes(tab)) {
            setTimeout(() => switchTab(tab), 120);
            const rest = location.hash.slice(5 + tab.length);
            if (rest) {
                setTimeout(() => {
                    const el = document.querySelector(rest);
                    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
                }, 350);
            }
        }
    }
    // 평판 요청 링크: #reputation=APPLICANT_ID → 해당 유저 프로필 모달 자동 열기
    if (hash.startsWith('reputation=')) {
        const targetId = hash.slice('reputation='.length);
        if (targetId) {
            setTimeout(() => openProfileModal(targetId), 400);
        }
    }
}

// 해시 변경 감지 (같은 페이지에서 푸시 클릭 시)
window.addEventListener('hashchange', handleNavHash);

// 서비스 워커 → 클라이언트 메시지 (푸시 클릭 시 네비게이션 백업)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'navigate' && data.section) {
            closeNotifPanel();
            switchTab(data.section);
            const hash = '#tab-' + data.section + (data.scrollTo || '');
            if (location.hash !== hash) history.replaceState(history.state || {}, '', hash);
            if (data.scrollTo) {
                setTimeout(() => {
                    const el = document.querySelector(data.scrollTo);
                    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
                }, 300);
            }
        }
    });
}

function updatePushToggleUI() {
    const sw = document.getElementById('push-toggle-switch');
    const status = document.getElementById('push-toggle-status');
    if (!sw) return;
    const knob = sw.firstElementChild;
    const pushOn = localStorage.getItem('bj_push_enabled') === '1';
    const denied = 'Notification' in window && Notification.permission === 'denied';
    if (denied) {
        sw.style.background = '#e5e7eb';
        if (knob) knob.style.left = '2px';
        status.textContent = '브라우저 설정에서 알림을 허용해주세요';
        status.style.color = '#ef4444';
    } else if (pushOn) {
        sw.style.background = '#10b981';
        if (knob) knob.style.left = '20px';
        status.textContent = '켜짐';
        status.style.color = '#059669';
    } else {
        sw.style.background = '#e5e7eb';
        if (knob) knob.style.left = '2px';
        status.textContent = '꺼짐';
        status.style.color = 'var(--muted)';
    }
}

async function togglePush() {
    // 스위치 바운스 + 행 하이라이트
    const sw = document.getElementById('push-toggle-switch');
    const row = document.getElementById('push-toggle-row');
    if (sw) { sw.style.transform = 'scale(.75)'; setTimeout(() => sw.style.transform = '', 200); }
    if (row) { row.style.background = '#ede9fe'; setTimeout(() => row.style.background = '#fafafa', 300); }
    if (!('Notification' in window)) { toast('이 브라우저는 푸시 알림을 지원하지 않아요', 'info'); return; }
    if (Notification.permission === 'denied') {
        toast('브라우저 설정에서 알림을 허용해주세요', 'info');
        return;
    }
    if (Notification.permission === 'granted') {
        // 이미 켜진 상태 → 구독 해제
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                await sub.unsubscribe();
            }
            localStorage.removeItem('bj_push_enabled');
            toast('알림이 꺼졌어요', 'info');
        } catch(e) { console.log('unsubscribe err:', e); }
    } else {
        // 켜기
        await setupPushSubscription(true);
    }
    updatePushToggleUI();
}

function renderNotifBadge() {
    const unread = _notifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    if (unread > 0) {
        badge.style.display = 'flex';
        badge.textContent = unread > 9 ? '9+' : unread;
    } else {
        badge.style.display = 'none';
    }
}

function stripEmoji(str) {
    if (!str) return '';
    return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{FE0F}]/gu, '').trim();
}

function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (_notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty">아직 알림이 없어요</div>';
        return;
    }
    const icons = { interest:'<i class="fa-solid fa-heart" style="color:#7c3aed;"></i>', matched:'<i class="fa-solid fa-heart-pulse" style="color:#ec4899;"></i>', match:'<i class="fa-solid fa-heart-pulse" style="color:#ec4899;"></i>', approved:'<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>', mutual:'<i class="fa-solid fa-heart-circle-bolt" style="color:#ec4899;"></i>', rejected:'<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>', message:'<i class="fa-regular fa-comment-dots" style="color:#3b82f6;"></i>', chat_message:'<i class="fa-regular fa-comment-dots" style="color:#3b82f6;"></i>', reputation_received:'<i class="fa-solid fa-handshake" style="color:#7c3aed;"></i>', reputation_request:'<i class="fa-solid fa-user-plus" style="color:#f59e0b;"></i>', reputation_complete:'<i class="fa-solid fa-check-double" style="color:#10b981;"></i>', announcement:'<i class="fa-solid fa-bullhorn" style="color:#6366f1;"></i>' };
    list.innerHTML = _notifications.map(n => {
        const icon = icons[n.type] || '<i class="fa-solid fa-bell" style="color:var(--muted);"></i>';
        const timeAgo = formatTimeAgo(n.created_at);
        return `<div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="readNotif(${n.id})">
            <div class="notif-icon">${icon}</div>
            <div class="notif-body">
                <div class="notif-title">${esc(n.title || '')}</div>
                ${n.body ? `<div class="notif-desc">${esc(n.body)}</div>` : ''}
                <div class="notif-time">${timeAgo}</div>
            </div>
        </div>`;
    }).join('');
}

function formatTimeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
    return new Date(iso).toLocaleDateString('ko-KR');
}

function toggleNotifPanel() {
    const bell = document.getElementById('notif-bell');
    // 탭 피드백: 색 빠짐 → 흔들림 → 복원
    bell.classList.add('tapped');
    setTimeout(() => {
        bell.classList.remove('tapped');
        bell.classList.remove('ring');
        void bell.offsetWidth;
        bell.classList.add('ring');
    }, 150);
    const panel = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-backdrop');
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    backdrop.classList.toggle('open', !isOpen);
}

function closeNotifPanel() {
    document.getElementById('notif-panel').classList.remove('open');
    document.getElementById('notif-backdrop').classList.remove('open');
}

async function readNotif(id) {
    const n = _notifications.find(x => x.id === id);
    closeNotifPanel();
    if (n) navigateByNotifType(n.type, n.related_id);
    await db.from('notifications').update({ is_read: true }).eq('id', id);
    if (n) n.is_read = true;
    renderNotifBadge();
    renderNotifList();
}

async function markAllRead() {
    const unreadIds = _notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
        await db.from('notifications').update({ is_read: true }).eq('id', id);
    }
    _notifications.forEach(n => n.is_read = true);
    renderNotifBadge();
    renderNotifList();
    toast('모든 알림을 읽었어요');
}

// ── 문의사항 ──
(function() {
    const ta = document.getElementById('inquiry-input');
    const cc = document.getElementById('inquiry-charcount');
    if (ta && cc) ta.addEventListener('input', function() { cc.textContent = ta.value.length + ' / 500'; });
})();

async function sendInquiry() {
    const input = document.getElementById('inquiry-input');
    const msg = input.value.trim();
    if (!msg) { toast('문의 내용을 입력해주세요.', 'warning'); return; }
    if (msg.length > 500) { toast('500자 이내로 작성해주세요.', 'warning'); return; }
    const btn = input.nextElementSibling?.querySelector?.('.btn-primary') || document.querySelector('[onclick="sendInquiry()"]');
    if (btn) { btn.disabled = true; btn.textContent = '전송 중...'; }
    try {
        const { data: { user } } = await db.auth.getUser();
        const name = window._myProfile ? window._myProfile.name : '';
        const { error } = await db.from('inquiries').insert([{ user_id: user.id, user_name: name, message: msg }]);
        if (error) { toast('전송 실패: ' + error.message, 'error'); return; }
        input.value = '';
        document.getElementById('inquiry-charcount').textContent = '0 / 500';
        toast('문의가 전송되었습니다.', 'success');
        loadInquiries();
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '보내기'; }
    }
}

async function deleteInquiry(id) {
    if (!confirm('이 문의를 삭제하시겠어요?')) return;
    const { error } = await db.from('inquiries').delete().eq('id', id);
    if (error) { toast('삭제 실패', 'error'); return; }
    toast('삭제되었습니다.');
    loadInquiries();
}

async function loadInquiries() {
    const el = document.getElementById('inquiry-history');
    if (!el) return;
    try {
        const { data: { user: _iu } } = await db.auth.getUser();
        const { data } = await db.from('inquiries').select('*').eq('user_id', _iu.id).order('created_at', { ascending: false }).limit(20);
        if (!data || data.length === 0) { el.innerHTML = ''; updateInquiryBadge(0); return; }
        // 새 답변 개수 (답변이 있는데 아직 확인 안 한 것)
        const newReplies = data.filter(q => q.reply && !q.user_read).length;
        updateInquiryBadge(newReplies);
        el.innerHTML = '<div style="font-size:.82em;font-weight:600;color:#111;margin-bottom:10px;">내 문의 내역</div>' +
            data.map(q => {
                const date = new Date(q.created_at).toLocaleDateString('ko-KR');
                const timeAgo = getTimeAgo(q.created_at);
                const isNewReply = q.reply && !q.user_read;
                return '<div style="padding:12px;background:' + (isNewReply ? '#fefce8' : '#fafafa') + ';border-radius:10px;border:1px solid ' + (isNewReply ? '#fde68a' : 'var(--border)') + ';position:relative;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                        '<div style="flex:1;">' +
                            '<div style="font-size:.85em;color:#111;">' + esc(q.message) + '</div>' +
                            '<div style="font-size:.7em;color:var(--muted);margin-top:4px;">' + timeAgo + '</div>' +
                        '</div>' +
                        (!q.reply ? '<button onclick="deleteInquiry(' + q.id + ')" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;font-size:.8em;" title="삭제"><i class="fa-regular fa-trash-can"></i></button>' : '') +
                    '</div>' +
                    (q.reply
                        ? '<div style="margin-top:8px;padding:10px;background:#f0fdf4;border-radius:8px;font-size:.82em;color:#065f46;border-left:3px solid #10b981;">' +
                            '<div style="font-weight:700;margin-bottom:4px;font-size:.85em;"><i class="fa-solid fa-headset" style="margin-right:4px;"></i>관리자 답변</div>' +
                            esc(q.reply) +
                            '<div style="font-size:.72em;color:#6b7280;margin-top:4px;">' + getTimeAgo(q.replied_at) + '</div>' +
                          '</div>'
                        : '<div style="margin-top:6px;font-size:.72em;color:var(--muted);"><i class="fa-regular fa-clock" style="margin-right:3px;"></i>답변 대기 중</div>'
                    ) +
                '</div>';
            }).join('');
        // 새 답변이 있으면 user_read 마킹
        if (newReplies > 0) {
            const unreadIds = data.filter(q => q.reply && !q.user_read).map(q => q.id);
            for (const uid of unreadIds) {
                await db.from('inquiries').update({ user_read: true }).eq('id', uid);
            }
        }
    } catch(e) { console.log('loadInquiries error:', e.message); toast('문의 내역을 불러오지 못했어요.', 'error'); }
}

// ── 프로필 방문 흔적 ──
async function loadProfileVisitors() {
    const card = document.getElementById('visitors-card');
    const sec = document.getElementById('visitors-section');
    if (!window._myProfile) return;
    try {
        const { data: count } = await db.rpc('get_my_view_count', { my_applicant_id: window._myProfile.id });
        if (!count || count === 0) { card.style.display = 'none'; return; }
        card.style.display = '';
        document.getElementById('visitor-count').textContent = count + '명';
        const { data: viewers } = await db.rpc('get_my_profile_viewers', { my_applicant_id: window._myProfile.id });
        if (!viewers || viewers.length === 0) { sec.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85em;">방문 기록이 없어요</div>'; return; }
        const favSet = window._favSet || new Set();
        sec.innerHTML = `<div style="font-size:.82em;color:var(--muted);margin-bottom:12px;">찜하면 누가 방문했는지 공개돼요!</div>
        <div class="fav-list">${viewers.map(v => {
            const isLiked = favSet.has(v.viewer_id);
            const age = calcAge(v.birth);
            const photo = v.photos && v.photos[0];
            const photoHtml = photo
                ? `<div class="fav-photo ${isLiked ? '' : 'visitor-blurred'}"><img loading="lazy" src="${photo}" alt=""></div>`
                : `<div class="fav-photo ${isLiked ? '' : 'visitor-blurred'}" style="background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:22px;">${v.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
            const tags = isLiked
                ? [age ? age+'세' : null, v.job, v.location, v.mbti].filter(Boolean).map(t => `<span class="fav-tag">${esc(t)}</span>`).join('')
                : '<span class="fav-tag" style="color:#d1d5db;">???</span>';
            const timeAgo = formatTimeAgo(v.viewed_at);
            const action = isLiked
                ? `<span style="color:var(--primary);font-size:.75em;font-weight:700;cursor:pointer;" onclick="openProfileModal('${v.viewer_id}')">보기</span>`
                : `<span style="color:var(--accent);font-size:.72em;font-weight:700;cursor:pointer;" onclick="toggleFav('${v.viewer_id}')"><i class="fa-solid fa-heart"></i> 찜하면 공개</span>`;
            return `<div class="fav-item" style="cursor:pointer;">
                ${photoHtml}
                <div class="fav-info">
                    <div class="fav-tags">${tags}</div>
                    <div style="font-size:.65em;color:#d1d5db;margin-top:2px;">${timeAgo}</div>
                </div>
                ${action}
            </div>`;
        }).join('')}</div>`;
    } catch(e) { console.log('loadProfileVisitors error:', e.message); /* 방문자 로드 실패 silent */ }
}

function updateInquiryBadge(count) {
    const badge = document.getElementById('inquiry-new-badge');
    if (!badge) return;
    if (count > 0) { badge.style.display = 'inline'; badge.textContent = '새 답변 ' + count; }
    else { badge.style.display = 'none'; }
}

function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return mins + '분 전';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + '시간 전';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + '일 전';
    return new Date(dateStr).toLocaleDateString('ko-KR');
}

async function deleteAccount() {
    if (!confirm('정말 계정을 삭제하시겠어요?\n모든 프로필, 사진, 찜, 알림이 즉시 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('마지막 확인: 계정을 삭제합니다.')) return;
    openFeedbackModal('exit', {
        required: false,
        callback: async () => {
            setLoading(true);
            try {
                const { data: { user } } = await db.auth.getUser();
                if (user && window._myProfile) {
                    const myId = window._myProfile.id;
                    // Storage 사진 정리
                    try {
                        const { data: files } = await db.storage.from('photos').list(user.id);
                        if (files && files.length > 0) {
                            await db.storage.from('photos').remove(files.map(f => `${user.id}/${f.name}`));
                        }
                    } catch(e) { console.log('Storage cleanup:', e.message); }
                    // 연관 데이터 모두 정리 (FK cascade 없으므로 수동)
                    await Promise.allSettled([
                        db.from('favorites').delete().eq('user_id', user.id),
                        db.from('favorites').delete().eq('applicant_id', myId),
                        db.from('notifications').delete().eq('user_id', user.id),
                        db.from('reputations').delete().eq('writer_user_id', user.id),
                        db.from('reputations').delete().eq('target_applicant_id', myId),
                        db.from('push_subscriptions').delete().eq('user_id', user.id),
                        db.from('blocks').delete().eq('blocker_id', user.id),
                        db.from('chat_messages').delete().eq('sender_id', user.id),
                        db.from('chat_messages').delete().eq('receiver_id', user.id),
                        db.from('reports').delete().eq('reporter_id', user.id),
                        db.from('event_logs').delete().eq('user_id', user.id),
                    ]);
                    await db.from('applicants').delete().eq('user_id', user.id);
                }
                await db.auth.signOut();
                localStorage.clear();
            } catch(e) { console.log('delete error:', e.message); }
            setLoading(false);
            toast('계정이 삭제되었습니다.', 'success');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        }
    });
}

async function goHome() {
    if (confirm('로그아웃되어 홈으로 이동합니다.\n계속하시겠어요?')) {
        await db.auth.signOut();
        localStorage.removeItem('kj_role');
        localStorage.removeItem('kj_screen');
        localStorage.removeItem('bj_signup_role');
        window.location.href = 'index.html';
    }
}

async function doLogout(silent) {
    if (!silent && !confirm('로그아웃 하시겠습니까?')) return;
    openFeedbackModal('exit', {
        required: false,
        callback: async () => {
            // 민감 데이터 메모리 정리
            window._myProfile = null;
            window._allCandidates = null;
            window._favSet = null;
            window._notifications = null;
            window._blockedSet = null;
            window._mutualSet = null;
            await db.auth.signOut();
            localStorage.removeItem('kj_role');
            localStorage.removeItem('kj_screen');
            localStorage.removeItem('bj_signup_ref_code');
            localStorage.removeItem('bj_signup_role');
            window.location.href = 'index.html';
        }
    });
}

// ── 비활성 자동 로그아웃 (30분) ──
let _inactiveTimer;
function resetInactiveTimer() {
    clearTimeout(_inactiveTimer);
    _inactiveTimer = setTimeout(async () => {
        toast('장시간 활동이 없어 자동 로그아웃됩니다.', 'info');
        setTimeout(async () => {
            await db.auth.signOut();
            localStorage.removeItem('kj_role');
            localStorage.removeItem('kj_screen');
            localStorage.removeItem('bj_signup_role');
            window.location.href = 'index.html';
        }, 2000);
    }, 30 * 60 * 1000); // 30분
}
['click','touchstart','keydown','scroll'].forEach(ev =>
    document.addEventListener(ev, resetInactiveTimer, { passive: true })
);
resetInactiveTimer();

// ── 축하 confetti ──
function showConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#7c3aed','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444'];
    for (let i = 0; i < 60; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDelay = Math.random() * 2 + 's';
        c.style.animationDuration = (2 + Math.random() * 2) + 's';
        c.style.width = (6 + Math.random() * 8) + 'px';
        c.style.height = (6 + Math.random() * 8) + 'px';
        container.appendChild(c);
    }
    setTimeout(() => container.remove(), 5000);
}

// ── 매칭 상대 정보 표시 ──
function renderMatchResult(partner) {
    const card = document.getElementById('match-result-card');
    const sec = document.getElementById('match-result-section');
    if (!partner) { card.style.display = 'none'; return; }
    card.style.display = '';
    if (!window._confettiShown) { window._confettiShown = true; setTimeout(showConfetti, 500); }
    const age = calcAge(partner.birth);
    const photo = partner.photos && partner.photos[0];
    const photoHtml = photo
        ? `<img loading="lazy" src="${photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#ede9fe,#fce7f3);display:flex;align-items:center;justify-content:center;font-size:36px;">${partner.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;

    // 매칭 상대 ID 저장 (프로필 모달용)
    window._matchedPartner = partner;

    sec.innerHTML = `
        <div style="text-align:center;padding:8px 0;">
            <div style="font-size:1.1em;font-weight:800;color:var(--primary);margin-bottom:16px;">축하합니다! 반쪽을 찾았어요</div>
            <div style="display:flex;justify-content:center;margin-bottom:16px;cursor:pointer;" onclick="openMatchedProfile()">${photoHtml}</div>
            <div style="font-size:1em;font-weight:700;margin-bottom:4px;cursor:pointer;" onclick="openMatchedProfile()">${esc(partner.name)}</div>
            <div style="font-size:.72em;color:var(--accent);margin-bottom:12px;cursor:pointer;" onclick="openMatchedProfile()">프로필 보기 <i class="fa-solid fa-chevron-right" style="font-size:.6em;"></i></div>
            <div style="font-size:.88em;color:var(--muted);margin-bottom:16px;">${age ? age + '세' : ''} · ${esc(partner.job || '')}${partner.location ? ' · ' + esc(partner.location) : ''}</div>
            <button onclick="switchTab('chat')" style="width:100%;padding:14px;background:#111;color:#fff;border:none;border-radius:12px;font-size:.95em;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="fa-regular fa-comment-dots"></i> 대화하러 가기
            </button>
        </div>`;
}

// 매칭 상대 프로필 보기 (이상형 제외)
async function openMatchedProfile() {
    const p = window._matchedPartner;
    if (!p) return;
    // openProfileModal은 이상형도 보여주므로, 매칭 상대 전용 간소 프로필 표시
    const age = calcAge(p.birth);
    const photos = p.photos || [];
    const photo = photos[0];
    const photoHtml = photo
        ? `<img loading="lazy" src="${photo}" alt="" style="width:100%;height:280px;object-fit:cover;">`
        : `<div style="width:100%;height:280px;background:linear-gradient(135deg,#ede9fe,#fce7f3);display:flex;align-items:center;justify-content:center;font-size:60px;">${p.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
    const tags = [age ? `${age}세` : null, p.job, p.height ? p.height + 'cm' : null, p.location, p.mbti, p.education, p.religion, p.smoking, p.drinking, p.hobby].filter(Boolean);

    const content = document.getElementById('profile-modal-content');
    content.innerHTML = `
        <div style="border-radius:16px 16px 0 0;overflow:hidden;position:relative;">
            ${photoHtml}
            ${photos.length > 1 ? `<div style="position:absolute;bottom:8px;right:12px;background:rgba(0,0,0,.5);color:#fff;padding:3px 10px;border-radius:12px;font-size:.72em;">+${photos.length - 1}장</div>` : ''}
        </div>
        <div style="padding:20px;">
            <div style="font-size:1.15em;font-weight:800;margin-bottom:4px;">${esc(p.name)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:12px 0;">
                ${tags.map(t => `<span class="pm-tag">${esc(t)}</span>`).join('')}
            </div>
            ${p.intro ? `<div style="margin-top:12px;padding:14px;background:#f9fafb;border-radius:12px;font-size:.9em;line-height:1.6;">${esc(p.intro)}</div>` : ''}
        </div>
        <div style="padding:0 20px 20px;display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="switchTab('chat');closeProfileModal();" style="flex:1;"><i class="fa-regular fa-comment-dots"></i> 대화하기</button>
            <button class="btn btn-outline" onclick="closeProfileModal()" style="flex:1;">닫기</button>
        </div>`;
    document.getElementById('profile-modal').classList.add('open');
}

async function init() {
    try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { setLoading(false); window.location.href = 'index.html'; return; }

    const user = session.user;
    document.getElementById('user-email').textContent = user.email;

    // 내 신청서 조회
    const { data: profiles } = await db.from('applicants')
        .select('*').eq('user_id', user.id).limit(1);
    const profile = profiles && profiles[0] ? profiles[0] : null;
    // 최근 접속 기록 (관리자 대시보드 활동성 파악용)
    if (profile) {
        db.from('applicants').update({ last_seen_at: new Date().toISOString() })
            .eq('user_id', user.id).then(() => {}, () => {});
    }
    window._popularityCount = 0;
    window._favCounts = {};
    renderProfile(profile);
    window._myProfile = profile;

    // 워터마크 (applyWatermark에서 통합 처리)

    const isMatched = profile && profile.status === 'matched';
    const isApproved = profile && profile.status === 'approved';

    if (profile && profile.role === 'matchmaker') {
        // ── 소개자 전용 대시보드 ──
        renderMatchmakerDashboard(profile);
        await loadNotifications();
        applyWatermark();
        setLoading(false);
        handleNavHash();
        return;
    }

    if (profile) {
        // 이성 승인 참가자 로드 (온보딩에서도 숫자 필요)
        const oppGender = profile.gender === 'male' ? 'female' : 'male';
        const { data: candidates_raw } = await db.from('applicants')
            .select('id,name,gender,birth,job,job_category,company,job_title,height,education,look_score,location,mbti,photos,icebreaker,ideal,ideal_weights,smoking,drinking,religion,hobby,last_seen_at,user_id,role')
            .eq('status', 'approved')
            .eq('gender', oppGender);
        // 소개자(matchmaker)는 추천 대상에서 제외
        const candidates = (candidates_raw || []).filter(c => c.role !== 'matchmaker');
        window._allCandidates = candidates || [];

        // 상태별 온보딩 화면
        if (!isMatched) {
            showOnboarding(profile.status, (candidates || []).length);
        }

        // 승인/대기 상태에서 추천 표시 (대기는 찜 불가 모드)
        const isPending = profile.status === 'pending';
        const isPendingRep = profile.status === 'pending_reputation';
        const isNotActive = isPending || isPendingRep;
        const showRecommendations = isApproved || isMatched || isNotActive;
        // (매칭 우선순위 UI 제거 — 이상형 설정의 기본 가중치 사용)

        // pending/pending_reputation 상단 배너
        if (isNotActive) {
            const banner = document.createElement('div');
            banner.id = 'pending-banner';
            banner.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;padding:10px 16px;font-size:.82em;font-weight:700;text-align:center;border-bottom:1px solid #fcd34d;';
            banner.innerHTML = isPendingRep
                ? '<i class="fa-solid fa-handshake"></i>&nbsp; 평판 수집 중 — 둘러보기만 가능해요. 추천인과 지인 1명의 평판이 모이면 심사가 시작됩니다.'
                : '<i class="fa-solid fa-hourglass-half"></i>&nbsp; 관리자 심사 중 — 둘러보기만 가능해요. 승인 후 찜과 매칭이 이용 가능합니다.';
            const navbar = document.querySelector('.navbar');
            if (navbar && !document.getElementById('pending-banner')) navbar.insertAdjacentElement('afterend', banner);
        }

        // 나를 찜한 사람 수 (아만다 스타일 인기도) — RPC로 RLS 우회
        const { data: myPop } = await db.rpc('get_my_popularity', { my_applicant_id: profile.id });
        window._popularityCount = myPop || 0;

        // 각 후보의 찜 받은 수 (인기도) — RPC로 RLS 우회
        const candIds = (candidates || []).map(c => c.id);
        if (candIds.length > 0) {
            const { data: favCountData } = await db.rpc('get_favorite_counts', { ids: candIds });
            window._favCounts = favCountData || {};
        }

        if (showRecommendations) {
            // 상호 관심 + 나를 찜한 사람 + 방문 흔적 로드
            await Promise.all([
                loadMutualInterests(user.id),
                loadWhoLikedMe(),
                loadProfileVisitors(),
            ]);
        }

        // 프로필 다시 렌더 (인기도 포함)
        renderProfile(profile);
        if (showRecommendations) {
            // 찜 목록을 먼저 로드 (추천 카드에서 이미 찜한 사람 제외 필요)
            await loadFavorites(user.id);
            // 관리자가 스와이프 리셋한 경우 체크
            if (profile.swipe_reset_date) {
                const today = new Date().toISOString().slice(0, 10);
                if (profile.swipe_reset_date === today) {
                    localStorage.removeItem(getDailySwipeKey());
                    await db.from('applicants').update({ swipe_reset_date: null }).eq('user_id', user.id);
                }
            }
            _cardIndex = 0;
            _swipedCount = loadDailySwipeCount();
            renderMatchRanking(window._allCandidates);
        }

        // 매칭 성사 확인 → 상대방 정보 표시 + 채팅 초기화
        let chatInitialized = false;
        if (isMatched && profile.matched_with) {
            try {
                const { data: partners } = await db.from('applicants')
                    .select('id,name,gender,birth,job,company,job_title,height,location,mbti,education,smoking,drinking,religion,hobby,intro,photos,user_id')
                    .eq('id', profile.matched_with).limit(1);
                if (partners && partners[0]) {
                    renderMatchResult(partners[0]);
                    // 채팅방 목록에 추가
                    if (partners[0].user_id) {
                        window._chatRooms = window._chatRooms || [];
                        window._chatRooms.push({
                            applicantId: partners[0].id,
                            userId: partners[0].user_id,
                            name: partners[0].name,
                            photo: partners[0].photos?.[0] || null,
                            gender: partners[0].gender
                        });
                        chatInitialized = true;
                    }
                }
            } catch(e) { console.log('match partner load error:', e.message); toast('매칭 상대 정보를 불러오지 못했어요.', 'error'); }
        }
        window._chatInitialized = chatInitialized;
    }

    if (!isMatched) {
        // 미매칭 상태 → 대화 불가 표시
        document.getElementById('chat-not-matched').style.display = '';
    }
    // 채팅방 목록 렌더
    renderChatRoomList();
    // 웹 푸시 — 이미 허용했으면 자동 구독 갱신
    if ('Notification' in window && Notification.permission === 'granted') {
        setupPushSubscription(false);
    }
    // 차단 목록 로드
    if (window._myProfile) {
        try {
            const { data: blockData } = await db.from('blocks').select('blocked_applicant_id').eq('blocker_id', user.id);
            window._blockedSet = new Set((blockData || []).map(b => b.blocked_applicant_id));
        } catch(e) { window._blockedSet = new Set(); }
    }
    // 알림 로드
    await loadNotifications();
    loadInquiries();
    logEvent('dashboard_open');
    // 워터마크 생성 (스크린샷 유출 방지)
    applyWatermark();
    setLoading(false);
    // URL 해시 → 해당 탭 (푸시 알림 클릭으로 진입한 경우)
    handleNavHash();
    // 필터 버튼 배지 초기화
    updateFilterBtnBadge();
    // 알림 환경설정 UI 동기화
    if (typeof renderNotifPrefsUI === 'function') renderNotifPrefsUI();
    } catch(e) {
        console.error('dashboard init error:', e);
        setLoading(false);
        toast('데이터 로드 중 오류가 발생했어요. 새로고침해주세요.', 'error');
    }
}

// ── 워터마크 (스크린샷 유출 방지) ──
// ── 소개자(Matchmaker) 전용 대시보드 ──
async function renderMatchmakerDashboard(profile) {
    // 탭바를 소개자용으로 교체
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = `
        <div class="tab-item active" onclick="switchTab('referrals')" id="tab-btn-referrals">
            <i class="fa-solid fa-users"></i><span>추천현황</span>
        </div>
        <div class="tab-item" onclick="switchTab('my')" id="tab-btn-my">
            <i class="fa-solid fa-user"></i><span>MY</span>
        </div>
    `;

    // 추천 현황 탭 콘텐츠 생성
    const page = document.querySelector('.page');
    // 기존 탭 숨기기
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

    // 소개자 전용 탭 추가
    let refTab = document.getElementById('tab-referrals');
    if (!refTab) {
        refTab = document.createElement('div');
        refTab.className = 'tab-content active';
        refTab.id = 'tab-referrals';
        page.prepend(refTab);
    }
    refTab.style.display = '';
    refTab.classList.add('active');

    // 추천한 사람들 조회
    let referrals = [];
    try {
        const { data } = await db.from('applicants')
            .select('id,name,gender,status,created_at,referral_code')
            .eq('referred_by', profile.referral_code)
            .order('created_at', { ascending: false });
        referrals = data || [];
    } catch(e) {}

    // 평판 요청 (내가 평판 작성할 대상)
    let pendingReps = [];
    try {
        const pendingRepIds = referrals.filter(r => r.status === 'pending_reputation').map(r => r.id);
        if (pendingRepIds.length > 0) {
            const { data: existingReps } = await db.from('reputations')
                .select('target_applicant_id')
                .eq('writer_applicant_id', profile.id);
            const writtenSet = new Set((existingReps || []).map(r => r.target_applicant_id));
            pendingReps = referrals.filter(r => r.status === 'pending_reputation' && !writtenSet.has(r.id));
        }
    } catch(e) {}

    const statusLabels = { approved: '🟢 활동 중', pending: '🟠 심사 중', pending_reputation: '🟡 평판 대기', matched: '💕 매칭됨', rejected: '🔴 거절' };

    refTab.innerHTML = `
        <div class="section-card">
            <div class="section-header" style="padding:14px 20px 12px;">
                <div class="section-title"><i class="fa-solid fa-share-nodes" style="color:var(--primary);"></i> 내 추천 코드</div>
            </div>
            <div class="section-body" style="padding:14px 20px;">
                <div style="display:flex;align-items:center;gap:10px;background:#f5f3ff;border-radius:12px;padding:16px;">
                    <div style="flex:1;font-family:monospace;font-size:1.3em;font-weight:900;letter-spacing:.05em;color:var(--primary);">${esc(profile.referral_code || '')}</div>
                    <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${esc(profile.referral_code)}');toast('복사됨!','success');" style="padding:8px 16px;font-size:.85em;"><i class="fa-solid fa-copy"></i> 복사</button>
                </div>
                <button class="btn btn-outline" onclick="shareReferralLink()" style="width:100%;margin-top:10px;"><i class="fa-solid fa-share"></i> 초대 링크 공유</button>
                <div style="font-size:.75em;color:var(--muted);margin-top:8px;text-align:center;">이 코드를 지인에게 공유하면 소개팅에 참여할 수 있어요</div>
            </div>
        </div>

        <div class="section-card">
            <div class="section-header" style="padding:14px 20px 12px;">
                <div class="section-title"><i class="fa-solid fa-users" style="color:var(--primary);"></i> 추천한 친구 <span style="font-size:.85em;color:var(--primary);font-weight:700;">${referrals.length}명</span></div>
            </div>
            <div class="section-body" style="padding:14px 20px;">
                ${referrals.length === 0
                    ? '<div style="text-align:center;padding:24px;color:var(--muted);font-size:.88em;"><i class="fa-solid fa-user-plus" style="font-size:2em;color:#e5e7eb;display:block;margin-bottom:10px;"></i>아직 추천한 친구가 없어요<br>추천 코드를 공유해보세요!</div>'
                    : referrals.map(r => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #f3f4f6;">
                            <div style="width:36px;height:36px;border-radius:50%;background:${r.gender==='male'?'#eff6ff':'#fdf2f8'};display:flex;align-items:center;justify-content:center;font-size:.85em;">
                                ${r.gender==='male'?'<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>':'<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:700;font-size:.9em;">${esc(r.name)}</div>
                                <div style="font-size:.75em;color:var(--muted);">${new Date(r.created_at).toLocaleDateString('ko-KR')} 가입</div>
                            </div>
                            <div style="font-size:.78em;">${statusLabels[r.status] || r.status}</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>

        ${pendingReps.length > 0 ? `
        <div class="section-card" style="border:2px solid #fef3c7;">
            <div class="section-header" style="padding:14px 20px 12px;background:#fffbeb;">
                <div class="section-title"><i class="fa-solid fa-pen" style="color:#f59e0b;"></i> 평판 작성 요청 <span style="font-size:.85em;color:#b45309;font-weight:700;">${pendingReps.length}건</span></div>
            </div>
            <div class="section-body" style="padding:14px 20px;">
                <div style="font-size:.82em;color:#92400e;margin-bottom:12px;">추천한 친구가 평판을 기다리고 있어요. 20자 이상 작성해주세요.</div>
                ${pendingReps.map(r => `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#fafafa;border-radius:10px;margin-bottom:8px;">
                        <div style="flex:1;font-weight:700;font-size:.9em;">${esc(r.name)}</div>
                        <button class="btn btn-primary" onclick="openReputationModal('${r.id}','${esc(r.name)}')" style="padding:6px 14px;font-size:.82em;"><i class="fa-solid fa-pen"></i> 작성</button>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}
    `;

    // MY 탭도 보이게
    document.getElementById('tab-my').style.display = '';

    // 프로필 렌더 (간소화)
    const mySection = document.getElementById('my-profile-section');
    if (mySection) {
        mySection.innerHTML = `
            <div style="text-align:center;padding:8px;">
                <div style="font-size:.82em;color:var(--muted);margin-bottom:4px;">소개자 계정</div>
                <div style="font-size:1.1em;font-weight:800;">${esc(profile.name)}</div>
                <div style="font-size:.82em;color:var(--muted);margin-top:4px;">추천 코드: <code style="color:var(--primary);font-weight:700;">${esc(profile.referral_code || '')}</code></div>
                <div style="font-size:.82em;color:var(--muted);">추천한 친구: ${referrals.length}명</div>
            </div>
        `;
    }
}

function shareReferralLink() {
    const code = window._myProfile?.referral_code;
    if (!code) return;
    const text = `반쪽(Banjjok)에 초대할게!\n내 추천 코드: ${code}\n가입 링크: https://kyhwow-rgb.github.io/banjjok/\n가입할 때 추천 코드를 직접 입력해줘!`;
    if (navigator.share) {
        navigator.share({ title: '반쪽 초대', text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => toast('초대 링크 복사 완료!', 'success'));
    }
}

function applyWatermark() {
    const p = window._myProfile;
    if (!p) return;
    // 기존 워터마크 제거 (중복 방지)
    document.getElementById('watermark-overlay')?.remove();

    const phone = p.contact || '미등록';
    const now = new Date();
    const ts = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const text = `${p.name}  ${phone}  ${ts}`;

    // Canvas 타일 패턴 (촘촘하게)
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '11px Pretendard Variable, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-25 * Math.PI / 180);
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, -15);
    ctx.fillText(text, 0, 15);
    ctx.restore();

    const dataUrl = canvas.toDataURL();
    const wm = document.createElement('div');
    wm.id = 'watermark-overlay';
    wm.style.cssText = `position:fixed;inset:0;z-index:9998;pointer-events:none;background-image:url(${dataUrl});background-repeat:repeat;`;
    document.body.appendChild(wm);
}

// ── 오프라인 감지 ──
function showOfflineBanner(offline) {
    let banner = document.getElementById('offline-banner');
    if (offline) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:#fff;text-align:center;padding:8px;font-size:.82em;font-weight:700;z-index:9999;';
            banner.innerHTML = '<i class="fa-solid fa-wifi" style="opacity:.5;"></i> 오프라인 상태 — 인터넷 연결을 확인해주세요';
            document.body.prepend(banner);
        }
    } else {
        if (banner) banner.remove();
    }
}
window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online', () => { showOfflineBanner(false); toast('연결됨!', 'success'); });
if (!navigator.onLine) showOfflineBanner(true);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
init();

// ── 피드백 모달 ──
window._feedbackRequired = false;
window._feedbackType = '';
window._feedbackCallback = null;

function openFeedbackModal(type, options = {}) {
    const modal = document.getElementById('feedback-modal');
    const title = document.getElementById('feedback-title');
    const sub = document.getElementById('feedback-sub');
    const reasons = document.getElementById('feedback-reasons');
    const skipBtn = document.getElementById('feedback-skip-btn');
    document.getElementById('feedback-text').value = '';
    window._feedbackType = type;
    window._feedbackRequired = options.required || false;
    window._feedbackCallback = options.callback || null;

    if (type === 'exit') {
        title.textContent = '떠나시기 전에...';
        sub.textContent = '더 좋은 반쪽이 되기 위해 의견을 남겨주세요.';
        skipBtn.style.display = options.required ? 'none' : '';
        const exitReasons = ['매칭이 안 돼서', '마음에 드는 사람이 없어서', '사용하기 불편해서', '개인정보가 걱정돼서', '다른 앱을 사용 중', '기타'];
        reasons.innerHTML = exitReasons.map(r =>
            `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f9fafb;border-radius:10px;font-size:.88em;cursor:pointer;border:1px solid #e5e7eb;transition:all .15s;">
                <input type="radio" name="feedback-reason" value="${r}" style="accent-color:#e11d48;">
                <span>${r}</span>
            </label>`
        ).join('');
    } else if (type === 'suggestion') {
        title.textContent = '반쪽 어떠세요?';
        sub.textContent = '불편한 점이나 추가됐으면 하는 기능이 있다면 알려주세요!';
        skipBtn.style.display = '';
        reasons.innerHTML = '';
    }
    modal.style.display = 'flex';
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'none';
    window._feedbackRequired = false;
    if (window._feedbackCallback) {
        const cb = window._feedbackCallback;
        window._feedbackCallback = null;
        cb();
    }
}

async function submitFeedback() {
    const type = window._feedbackType;
    const text = document.getElementById('feedback-text').value.trim();
    const reasonEl = document.querySelector('input[name="feedback-reason"]:checked');
    const reason = reasonEl ? reasonEl.value : null;

    if (type === 'exit' && !reason && !text) {
        toast('사유를 선택하거나 의견을 작성해주세요.', 'warning');
        return;
    }

    try {
        const { data: { user } } = await db.auth.getUser();
        await db.from('event_logs').insert({
            user_id: user?.id || null,
            event_type: type === 'exit' ? 'exit_feedback' : 'suggestion',
            metadata: { reason, text }
        });
    } catch(e) {}

    toast('소중한 의견 감사합니다!', 'success');
    closeFeedbackModal();
}

// 1~2분 후 건의사항 팝업 (세션당 1회)
(function() {
    const key = 'bj_suggestion_shown_' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(key)) return;
    const delay = 180000 + Math.random() * 120000; // 3~5분
    setTimeout(() => {
        if (document.getElementById('feedback-modal').style.display === 'flex') return;
        sessionStorage.setItem(key, '1');
        openFeedbackModal('suggestion');
    }, delay);
})();

// ── 이벤트 로깅 ──
async function logEvent(eventType, metadata = {}) {
    try {
        const { data: { user } } = await db.auth.getUser();
        await db.from('event_logs').insert({ user_id: user?.id || null, event_type: eventType, metadata });
    } catch(e) {}
}

// ── 신고/차단 ──
async function blockUser(applicantId) {
    if (!confirm('이 사람을 차단하시겠어요?\n차단하면 서로의 추천에서 보이지 않아요.')) return;
    const { data: { user } } = await db.auth.getUser();
    try {
        await db.from('blocks').insert({ blocker_id: user.id, blocked_applicant_id: applicantId });
        if (!window._blockedSet) window._blockedSet = new Set();
        window._blockedSet.add(applicantId);
        // 찜에서도 제거
        await db.from('favorites').delete().eq('user_id', user.id).eq('applicant_id', applicantId);
        toast('차단되었어요. 이 사람은 더 이상 보이지 않아요.', 'success');
        logEvent('block', { blocked: applicantId });
        // 추천 카드 넘기기
        cardPass();
        await loadFavorites(user.id);
    } catch(e) { toast('차단 처리 중 오류가 발생했어요.', 'error'); }
}

async function reportUser(applicantId) {
    const reasons = ['부적절한 사진', '허위 프로필', '불쾌한 내용', '스팸/광고', '기타'];
    const reason = prompt('신고 사유를 선택해주세요:\n' + reasons.map((r, i) => `${i+1}. ${r}`).join('\n') + '\n\n번호를 입력해주세요:');
    if (!reason) return;
    const idx = parseInt(reason) - 1;
    const reasonText = reasons[idx] || reason;
    const { data: { user } } = await db.auth.getUser();
    try {
        await db.from('reports').insert({ reporter_id: user.id, reported_applicant_id: applicantId, reason: reasonText });
        toast('신고가 접수되었어요. 관리자가 검토할게요.', 'success');
        logEvent('report', { reported: applicantId, reason: reasonText });
    } catch(e) { toast('신고 처리 중 오류가 발생했어요.', 'error'); }
}

// ── 채팅 시스템 ──
let _chatChannel = null;
let _chatPartnerUserId = null;
let _chatPartnerName = '';
let _chatMatchKey = null;
let _lastChatSent = 0;

function computeMatchKey(uid1, uid2) {
    return uid1 < uid2 ? uid1 + '_' + uid2 : uid2 + '_' + uid1;
}

function formatChatTime(ts) {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function formatChatDate(ts) {
    const d = new Date(ts);
    const m = d.getMonth() + 1, day = d.getDate();
    const days = ['일','월','화','수','목','금','토'];
    return `${m}월 ${day}일 (${days[d.getDay()]})`;
}

function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    const emptyMsg = document.getElementById('chat-empty-msg');
    if (!messages || messages.length === 0) {
        if (emptyMsg) emptyMsg.style.display = '';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    const { data: { session } } = { data: { session: window._chatSession } };
    const myUid = session?.user?.id;
    let html = '';
    let lastDate = '';

    for (const msg of messages) {
        const msgDate = formatChatDate(msg.created_at);
        if (msgDate !== lastDate) {
            html += `<div class="chat-date-divider">${msgDate}</div>`;
            lastDate = msgDate;
        }
        const isMine = msg.sender_id === myUid;
        html += `<div class="chat-bubble ${isMine ? 'chat-mine' : 'chat-theirs'}" data-id="${msg.id}">`;
        html += esc(msg.content).replace(/\n/g, '<br>');
        html += `<div class="chat-time">${formatChatTime(msg.created_at)}</div>`;
        if (isMine && msg.read_at) {
            html += `<div class="chat-read">읽음</div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const emptyMsg = document.getElementById('chat-empty-msg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const myUid = window._chatSession?.user?.id;
    const isMine = msg.sender_id === myUid;

    // 날짜 구분선 필요 여부
    const lastBubble = container.querySelector('.chat-bubble:last-child, .chat-date-divider:last-child');
    const msgDate = formatChatDate(msg.created_at);
    const existingDividers = container.querySelectorAll('.chat-date-divider');
    const lastDivider = existingDividers[existingDividers.length - 1];
    if (!lastDivider || lastDivider.textContent !== msgDate) {
        const divEl = document.createElement('div');
        divEl.className = 'chat-date-divider';
        divEl.textContent = msgDate;
        container.appendChild(divEl);
    }

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'chat-mine' : 'chat-theirs'}`;
    bubble.dataset.id = msg.id;
    bubble.innerHTML = esc(msg.content).replace(/\n/g, '<br>')
        + `<div class="chat-time">${formatChatTime(msg.created_at)}</div>`
        + (isMine && msg.read_at ? `<div class="chat-read">읽음</div>` : '');
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// ── 채팅방 목록 렌더 (카카오톡 스타일) ──
async function renderChatRoomList() {
    const container = document.getElementById('chat-rooms-container');
    const noMatch = document.getElementById('chat-not-matched');
    const rooms = window._chatRooms || [];
    if (rooms.length === 0) {
        container.innerHTML = '';
        noMatch.style.display = '';
        return;
    }
    noMatch.style.display = 'none';
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    // 각 채팅방의 마지막 메시지 + 안 읽은 수 조회
    let html = '';
    for (const room of rooms) {
        const matchKey = computeMatchKey(session.user.id, room.userId);
        // 마지막 메시지
        const { data: lastMsgs } = await db.from('chat_messages')
            .select('content,created_at,sender_id')
            .eq('match_key', matchKey)
            .order('created_at', { ascending: false })
            .limit(1);
        const lastMsg = lastMsgs?.[0];
        const lastText = lastMsg ? (lastMsg.sender_id === session.user.id ? '나: ' : '') + lastMsg.content : '대화를 시작해보세요';
        const lastTime = lastMsg ? formatChatTime(lastMsg.created_at) : '';
        // 안 읽은 메시지 수
        const { count } = await db.from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('match_key', matchKey)
            .eq('receiver_id', session.user.id)
            .is('read_at', null);
        const photoHtml = room.photo
            ? `<img class="chat-room-avatar" src="${room.photo}" alt="">`
            : `<div class="chat-room-avatar-placeholder">${room.gender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
        const unreadHtml = count > 0 ? `<div class="chat-room-unread">${count > 99 ? '99+' : count}</div>` : '';
        html += `<div class="chat-room-item" onclick="openChatRoom('${room.userId}','${escJs(room.name)}','${escJs(room.photo || '')}','${room.gender}')">
            ${photoHtml}
            <div class="chat-room-info">
                <div class="chat-room-name">${esc(room.name)}</div>
                <div class="chat-room-last-msg">${esc(lastText.length > 30 ? lastText.slice(0, 30) + '...' : lastText)}</div>
            </div>
            <div class="chat-room-meta">
                <div class="chat-room-time">${lastTime}</div>
                ${unreadHtml}
            </div>
        </div>`;
    }
    container.innerHTML = `<div class="section-card">${html}</div>`;
}

async function openChatRoom(partnerUserId, partnerName, partnerPhoto, partnerGender) {
    // 목록 숨기고 채팅방 표시
    document.getElementById('chat-room-list').style.display = 'none';
    document.getElementById('chat-room-view').style.display = '';
    // 헤더 설정
    const headerInfo = document.getElementById('chat-room-partner-info');
    const photoHtml = partnerPhoto
        ? `<img src="${partnerPhoto}" alt="">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:14px;">${partnerGender === 'male' ? '<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>' : '<i class="fa-solid fa-venus" style="color:#ec4899;"></i>'}</div>`;
    headerInfo.innerHTML = `<div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="openMatchedProfile()">${photoHtml}<span class="chat-room-partner-name">${esc(partnerName)}</span></div>`;
    // 채팅 초기화
    await initChat(window._myProfile, partnerUserId, partnerName);
}

function closeChatRoom() {
    document.getElementById('chat-room-view').style.display = 'none';
    document.getElementById('chat-room-list').style.display = '';
    // 실시간 구독 해제
    if (_chatChannel) { db.removeChannel(_chatChannel); _chatChannel = null; }
    // 목록 새로고침 (읽음 상태 반영)
    renderChatRoomList();
}

async function initChat(profile, partnerUserId, partnerName) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    window._chatSession = session;
    _chatPartnerUserId = partnerUserId;
    _chatPartnerName = partnerName;
    _chatMatchKey = computeMatchKey(session.user.id, partnerUserId);

    // 기존 메시지 로드
    const { data: messages } = await db.from('chat_messages')
        .select('*')
        .eq('match_key', _chatMatchKey)
        .order('created_at', { ascending: true })
        .limit(200);
    renderChatMessages(messages || []);

    // 안 읽은 메시지 읽음 처리
    await markChatAsRead();

    // 실시간 구독
    if (_chatChannel) db.removeChannel(_chatChannel);
    _chatChannel = db.channel('chat-' + _chatMatchKey)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: 'match_key=eq.' + _chatMatchKey
        }, payload => {
            // 중복 체크 (내가 보낸 건 이미 append 됐을 수 있음)
            if (document.querySelector(`.chat-bubble[data-id="${payload.new.id}"]`)) return;
            appendChatMessage(payload.new);
            // 대화 탭이 활성화되어 있으면 바로 읽음 처리
            const chatTab = document.getElementById('tab-chat');
            if (chatTab && chatTab.classList.contains('active')) {
                markChatAsRead();
            } else {
                updateChatBadge();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_messages',
            filter: 'match_key=eq.' + _chatMatchKey
        }, payload => {
            // 읽음 처리 반영
            if (payload.new.read_at && payload.new.sender_id === window._chatSession?.user?.id) {
                const bubble = document.querySelector(`.chat-bubble[data-id="${payload.new.id}"]`);
                if (bubble && !bubble.querySelector('.chat-read')) {
                    const readEl = document.createElement('div');
                    readEl.className = 'chat-read';
                    readEl.textContent = '읽음';
                    bubble.appendChild(readEl);
                }
            }
        })
        .subscribe();

    // 초기 배지 업데이트
    updateChatBadge();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (!_chatPartnerUserId || !_chatMatchKey) return;

    // 레이트 리밋 (1초)
    const now = Date.now();
    if (now - _lastChatSent < 1000) {
        toast('메시지를 너무 빨리 보내고 있어요', 'info');
        return;
    }
    _lastChatSent = now;

    // 매칭 상태 확인
    if (!window._myProfile || window._myProfile.status !== 'matched') {
        toast('매칭된 상태에서만 대화할 수 있어요', 'error');
        return;
    }

    input.value = '';
    input.style.height = 'auto';

    try {
        // 서버 사이드 매칭 검증 RPC 사용
        const { data, error } = await db.rpc('send_chat_message', {
            p_receiver_id: _chatPartnerUserId,
            p_content: text
        });
        if (error) throw error;

        // 즉시 UI에 표시 (Realtime이 오기 전에)
        const tempMsg = {
            id: data,
            sender_id: window._chatSession.user.id,
            receiver_id: _chatPartnerUserId,
            match_key: _chatMatchKey,
            content: text,
            created_at: new Date().toISOString(),
            read_at: null
        };
        appendChatMessage(tempMsg);
        logEvent('chat_send');
        // 상대방에게 푸시 알림
        sendPushNotif(
            _chatPartnerUserId,
            `${window._myProfile?.name || '반쪽'}님`,
            text.length > 60 ? text.slice(0, 60) + '...' : text,
            dashUrl('chat'),
            'message'
        );
    } catch(e) {
        toast('메시지 전송에 실패했어요', 'error');
        input.value = text; // 복원
    }
}

async function markChatAsRead() {
    if (!_chatMatchKey || !window._chatSession) return;
    try {
        await db.from('chat_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('match_key', _chatMatchKey)
            .eq('receiver_id', window._chatSession.user.id)
            .is('read_at', null);
        // 배지 초기화
        const badge = document.getElementById('chat-badge');
        if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
    } catch(e) {}
}

async function updateChatBadge() {
    if (!_chatMatchKey || !window._chatSession) return;
    try {
        const { count } = await db.from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('match_key', _chatMatchKey)
            .eq('receiver_id', window._chatSession.user.id)
            .is('read_at', null);
        const badge = document.getElementById('chat-badge');
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch(e) {}
}

window.addEventListener('beforeunload', () => {
    if (_chatChannel) db.removeChannel(_chatChannel);
});

// ── Pull-to-refresh ──
(function() {
    let startY = 0, pulling = false, triggered = false;
    const threshold = 80;
    let indicator = null;

    function createIndicator() {
        const el = document.createElement('div');
        el.id = 'ptr-indicator';
        el.style.cssText = 'position:fixed;top:-50px;left:50%;transform:translateX(-50%);z-index:9998;transition:top .25s cubic-bezier(.4,0,.2,1),opacity .2s;opacity:0;';
        el.innerHTML = `<div style="width:36px;height:36px;border-radius:50%;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;">
            <svg id="ptr-spinner" width="20" height="20" viewBox="0 0 20 20" style="transition:transform .2s;">
                <circle cx="10" cy="10" r="8" fill="none" stroke="#d1d5db" stroke-width="2.5"/>
                <circle id="ptr-arc" cx="10" cy="10" r="8" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="50.27" stroke-dashoffset="50.27" transform="rotate(-90 10 10)"/>
            </svg>
        </div>`;
        document.body.appendChild(el);
        return el;
    }

    document.addEventListener('touchstart', e => {
        if (window.scrollY === 0 && !triggered) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!pulling || triggered) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 10) {
            if (!indicator) indicator = createIndicator();
            const progress = Math.min(1, dy / threshold);
            const top = Math.min(24, dy * 0.3);
            indicator.style.top = top + 'px';
            indicator.style.opacity = progress;
            // 원호 진행
            const arc = indicator.querySelector('#ptr-arc');
            arc.style.strokeDashoffset = 50.27 * (1 - progress);
            // threshold 넘으면 회전 표시
            const spinner = indicator.querySelector('#ptr-spinner');
            if (dy > threshold) {
                spinner.style.transform = 'rotate(' + ((dy - threshold) * 3) + 'deg)';
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!pulling || triggered) return;
        pulling = false;
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > threshold && window.scrollY === 0) {
            triggered = true;
            // 스피닝 애니메이션
            if (indicator) {
                const spinner = indicator.querySelector('#ptr-spinner');
                spinner.style.transition = 'none';
                spinner.style.animation = 'ptr-spin .6s linear infinite';
                // 스타일 주입
                if (!document.getElementById('ptr-spin-style')) {
                    const style = document.createElement('style');
                    style.id = 'ptr-spin-style';
                    style.textContent = '@keyframes ptr-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
                    document.head.appendChild(style);
                }
            }
            setTimeout(() => location.reload(), 500);
        } else {
            // 취소 — 인디케이터 복귀
            if (indicator) {
                indicator.style.top = '-50px';
                indicator.style.opacity = '0';
                setTimeout(() => { if (indicator) { indicator.remove(); indicator = null; } }, 300);
            }
        }
    }, { passive: true });
})();
