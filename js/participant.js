/* ==========================================================================
   반쪽 v2 — Participant (Introductions Tab)
   ========================================================================== */

async function loadIntroductionsTab() {
  const profile = AppState.getProfile();
  if (!profile || !profile.is_participant) return;

  const { data: intros, error } = await sb.from('introductions')
    .select('*, primary_matchmaker:primary_matchmaker_id(name)')
    .or(`person_a_id.eq.${profile.id},person_b_id.eq.${profile.id}`)
    .order('created_at', { ascending: false });

  if (error) { console.error('Load introductions error:', error); return; }

  const emptyEl = document.getElementById('intro-empty');
  const listEl = document.getElementById('intro-list');

  if (!intros || intros.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  // Load partner profiles
  const partnerIds = intros.map(i => i.person_a_id === profile.id ? i.person_b_id : i.person_a_id);
  const { data: partners } = await sb.from('applicants')
    .select('id, name, gender, birth_date, job, location, mbti, photo_url, photos, height, religion, bio')
    .in('id', [...new Set(partnerIds)]);
  const partnerMap = {};
  (partners || []).forEach(p => partnerMap[p.id] = p);

  // Store intros+partners on listEl for openIntroDetail access
  listEl._intros = intros;
  listEl._partnerMap = partnerMap;

  listEl.innerHTML = intros.map((intro, idx) => {
    const partnerId = intro.person_a_id === profile.id ? intro.person_b_id : intro.person_a_id;
    const partner = partnerMap[partnerId] || {};
    const myResponse = intro.person_a_id === profile.id ? intro.person_a_response : intro.person_b_response;
    const age = calcAge(partner.birth_date);
    const photoSrc = (partner.photos && partner.photos[0]) || partner.photo_url || '';
    const matchmakerName = intro.primary_matchmaker?.name || '주선자';

    let statusBadge = '';
    if (intro.status === 'matched') {
      statusBadge = '<span class="intro-status-badge matched">매칭 성사</span>';
    } else if (intro.status === 'declined') {
      statusBadge = '<span class="intro-status-badge declined">거절됨</span>';
    } else if (intro.status === 'expired') {
      statusBadge = '<span class="intro-status-badge expired">만료됨</span>';
    } else if (myResponse === 'yes') {
      statusBadge = '<span class="intro-status-badge pending">응답 대기 중</span>';
    } else if (myResponse === 'no') {
      statusBadge = '<span class="intro-status-badge declined">거절함</span>';
    }

    const isPending = !myResponse && intro.status === 'pending';

    return `
      <div class="intro-card" onclick="openIntroDetail(${idx})" style="cursor:pointer;">
        <div class="intro-card-header">
          <span class="intro-matchmaker"><i class="fa-solid fa-hand-holding-heart"></i> ${esc(matchmakerName)}님의 소개</span>
          ${statusBadge}
        </div>
        <div class="intro-person">
          ${photoSrc ? `<img class="intro-person-photo" src="${esc(photoSrc)}" alt="">` : `<div class="intro-person-photo" style="display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
          <div class="intro-person-info">
            <div class="intro-person-name">${esc(partner.name || '알 수 없음')}</div>
            <div class="intro-person-detail">${age ? age + '세' : ''} · ${esc(partner.job || '')} · ${esc(partner.location || '')}</div>
          </div>
          ${isPending ? '<svg style="flex-shrink:0;color:#94A3B8" width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
        </div>
      </div>`;
  }).join('');
}

async function respondToIntroduction(introId, response) {
  const { data, error } = await sb.rpc('respond_to_introduction', {
    p_introduction_id: introId,
    p_response: response
  });

  if (error) { toast('응답 실패: ' + error.message); return; }

  closeIntroDetail();

  if (data?.matched) {
    toast('매칭이 성사되었어요! 대화 탭에서 확인해보세요.');
  } else if (data?.declined) {
    toast('소개를 거절했어요.');
  } else {
    toast('응답했어요. 상대방의 답변을 기다려주세요.');
  }

  logEvent('introduction_response', { introduction_id: introId, response });
  loadIntroductionsTab();
}

// --- Intro Detail Overlay ---
function openIntroDetail(idx) {
  const listEl = document.getElementById('intro-list');
  const intros = listEl._intros || [];
  const partnerMap = listEl._partnerMap || {};
  const profile = AppState.getProfile();

  const intro = intros[idx];
  if (!intro) return;

  const partnerId = intro.person_a_id === profile.id ? intro.person_b_id : intro.person_a_id;
  const partner = partnerMap[partnerId] || {};
  const myResponse = intro.person_a_id === profile.id ? intro.person_a_response : intro.person_b_response;
  const isPending = !myResponse && intro.status === 'pending';

  const age = calcAge(partner.birth_date);
  const photoSrc = (partner.photos && partner.photos[0]) || partner.photo_url || '';
  const matchmakerName = intro.primary_matchmaker?.name || '주선자';

  // Step counter (pending intros only)
  const pendingIntros = intros.filter(i => {
    const mr = i.person_a_id === profile.id ? i.person_a_response : i.person_b_response;
    return !mr && i.status === 'pending';
  });
  const pendingIdx = pendingIntros.indexOf(intro);
  const stepEl = document.getElementById('idNavStep');
  stepEl.textContent = pendingIntros.length > 1 && pendingIdx >= 0
    ? `${pendingIdx + 1} / ${pendingIntros.length}` : '';

  // Avatar
  const avatarEl = document.getElementById('idAvatar');
  if (photoSrc) {
    avatarEl.src = photoSrc;
    avatarEl.style.display = '';
  } else {
    avatarEl.src = '';
    avatarEl.style.display = 'none';
  }

  // Name
  document.getElementById('idHeroName').textContent = partner.name || '알 수 없음';

  // Trust card
  document.getElementById('idRecName').textContent = matchmakerName;
  document.getElementById('idRecRel').textContent = '소개해준 사람';
  const noteWrap = document.getElementById('idNoteWrap');
  const noteEl = document.getElementById('idNote');
  if (intro.note) {
    noteEl.textContent = intro.note;
    noteWrap.style.display = '';
  } else {
    noteWrap.style.display = 'none';
  }

  // Basic info rows
  const infoRows = [
    { key: '나이',   val: age ? age + '세' : null },
    { key: '키',     val: partner.height ? partner.height + 'cm' : null },
    { key: '직업',   val: partner.job || null },
    { key: '사는 곳', val: partner.location || null },
    { key: '학력',   val: partner.education || null },
    { key: '종교',   val: partner.religion || null },
  ];
  document.getElementById('idInfoRows').innerHTML = infoRows
    .filter(r => r.val)
    .map(r => `
      <div class="id-info__row">
        <span class="id-info__row-key">${esc(r.key)}</span>
        <span class="id-info__row-val">${esc(r.val)}</span>
      </div>`).join('');

  // Action buttons
  const btnYes = document.getElementById('idBtnYes');
  const btnNo  = document.getElementById('idBtnNo');
  if (isPending) {
    btnYes.style.display = '';
    btnNo.style.display  = '';
    btnYes.onclick = () => respondToIntroduction(intro.id, 'yes');
    btnNo.onclick  = () => respondToIntroduction(intro.id, 'no');
  } else {
    btnYes.style.display = 'none';
    btnNo.style.display  = 'none';
  }

  // Photo fullscreen
  const fs = document.getElementById('idPhotoFs');
  const fsImg = document.getElementById('idPhotoFsImg');
  const avatarWrap = document.getElementById('idAvatarWrap');
  avatarWrap.onclick = () => {
    if (!photoSrc) return;
    fsImg.src = photoSrc;
    fs.classList.add('is-open');
  };
  avatarWrap.style.cursor = photoSrc ? 'pointer' : 'default';
  document.getElementById('idPhotoFsClose').onclick = () => fs.classList.remove('is-open');
  fs.onclick = (e) => { if (e.target === fs) fs.classList.remove('is-open'); };

  // Open
  document.getElementById('intro-detail-overlay').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeIntroDetail() {
  document.getElementById('intro-detail-overlay').classList.remove('is-open');
  document.getElementById('idPhotoFs').classList.remove('is-open');
  document.body.style.overflow = '';
}

// Wire back button (once, on DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('idNavBack')?.addEventListener('click', closeIntroDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeIntroDetail();
  });
});

// --- Profile Modal ---
async function openProfileModal(applicantId) {
  let person;
  if (AppState.getIsAdmin && AppState.getIsAdmin()) {
    const { data, error } = await sb.rpc('admin_get_applicant', { p_id: applicantId });
    if (error || !data) { toast('프로필을 불러올 수 없어요.'); return; }
    person = data;
  } else {
    const { data } = await sb.from('applicants').select('*').eq('id', applicantId).maybeSingle();
    if (!data) { toast('프로필을 불러올 수 없어요.'); return; }
    person = data;
  }

  // Load reputations (anonymous - don't show writer)
  const { data: reps } = await sb.from('reputations')
    .select('personality, strengths, dating_style, overall, score, relationship, created_at')
    .eq('target_id', applicantId);

  const age = calcAge(person.birth_date);
  const photos = person.photos || (person.photo_url ? [person.photo_url] : []);

  const body = document.getElementById('profile-modal-body');
  body.innerHTML = `
    ${photos.length > 0 ? `<div class="pm-photos">${photos.map(p => `<img class="pm-photo" src="${esc(p)}" alt="">`).join('')}</div>` : ''}

    <h2 style="font-size:20px;font-weight:800;margin-bottom:4px;">${esc(person.name)}</h2>
    <p style="color:var(--muted);font-size:14px;margin-bottom:16px;">${age ? age + '세' : ''} · ${esc(person.job || '')} · ${esc(person.location || '')}</p>

    <div class="pm-section">
      <div class="pm-section-title">기본 정보</div>
      <div class="pm-grid">
        <div class="pm-grid-item"><div class="pm-grid-label">키</div><div class="pm-grid-value">${person.height ? person.height + 'cm' : '—'}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">MBTI</div><div class="pm-grid-value">${esc(person.mbti || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">종교</div><div class="pm-grid-value">${esc(person.religion || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">흡연</div><div class="pm-grid-value">${esc(person.smoking || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">음주</div><div class="pm-grid-value">${esc(person.drinking || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">학력</div><div class="pm-grid-value">${esc(person.education || '—')}</div></div>
      </div>
    </div>

    ${person.bio ? `<div class="pm-section"><div class="pm-section-title">소개</div><div class="pm-bio">${esc(person.bio)}</div></div>` : ''}

    ${reps && reps.length > 0 ? `
      <div class="pm-section">
        <div class="pm-section-title">평판 (${reps.length}건)</div>
        ${reps.map(r => `
          <div class="pm-reputation">
            <div class="pm-rep-content">
              ${r.personality ? `<div><strong>성격:</strong> ${esc(r.personality)}</div>` : ''}
              ${r.strengths ? `<div><strong>장점:</strong> ${esc(r.strengths)}</div>` : ''}
              ${r.dating_style ? `<div><strong>연애:</strong> ${esc(r.dating_style)}</div>` : ''}
              ${r.overall ? `<div><strong>총평:</strong> ${esc(r.overall)}</div>` : ''}
            </div>
            <div class="pm-rep-meta">${r.relationship || ''} · ${'★'.repeat(r.score || 0)} · ${formatTimeAgo(r.created_at)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-ghost" style="color:var(--error);" onclick="reportUser('${applicantId}')"><i class="fa-solid fa-flag"></i> 신고</button>
      <button class="btn-ghost" style="color:var(--muted);" onclick="blockUser('${applicantId}')"><i class="fa-solid fa-ban"></i> 차단</button>
    </div>
  `;

  document.getElementById('profile-modal-overlay').classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profile-modal-overlay').classList.remove('open');
}
