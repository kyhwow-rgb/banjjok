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

  listEl.innerHTML = intros.map(intro => {
    const partnerId = intro.person_a_id === profile.id ? intro.person_b_id : intro.person_a_id;
    const partner = partnerMap[partnerId] || {};
    const myResponse = intro.person_a_id === profile.id ? intro.person_a_response : intro.person_b_response;
    const age = calcAge(partner.birth_date);
    const photoSrc = (partner.photos && partner.photos[0]) || partner.photo_url || '';
    const matchmakerName = intro.primary_matchmaker?.name || '주선자';
    const compat = compatibilityReport(profile, partner);

    let statusHtml = '';
    let actionsHtml = '';

    if (intro.status === 'matched') {
      statusHtml = '<span class="intro-status-badge matched">매칭 성사</span>';
    } else if (intro.status === 'declined') {
      statusHtml = '<span class="intro-status-badge declined">거절됨</span>';
    } else if (intro.status === 'expired') {
      statusHtml = '<span class="intro-status-badge expired">만료됨</span>';
    } else if (myResponse === 'yes') {
      statusHtml = '<span class="intro-status-badge pending">응답 대기 중</span>';
    } else if (myResponse === 'no') {
      statusHtml = '<span class="intro-status-badge declined">거절함</span>';
    } else {
      actionsHtml = `
        <div class="intro-actions">
          <button class="btn-no" onclick="respondToIntroduction('${intro.id}', 'no')">다음에</button>
          <button class="btn-yes" onclick="respondToIntroduction('${intro.id}', 'yes')">좋아요</button>
        </div>`;
    }

    return `
      <div class="intro-card">
        <div class="intro-card-header">
          <span class="intro-matchmaker"><i class="fa-solid fa-hand-holding-heart"></i> ${esc(matchmakerName)}님의 소개</span>
          ${statusHtml}
        </div>
        <div class="intro-person" onclick="openProfileModal('${partnerId}')" style="cursor:pointer;">
          ${photoSrc ? `<img class="intro-person-photo" src="${esc(photoSrc)}" alt="">` : `<div class="intro-person-photo" style="display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
          <div class="intro-person-info">
            <div class="intro-person-name">${esc(partner.name || '알 수 없음')}</div>
            <div class="intro-person-detail">${age ? age + '세' : ''} · ${esc(partner.job || '')} · ${esc(partner.location || '')}</div>
          </div>
        </div>
        ${intro.note ? `<div class="intro-note">"${esc(intro.note)}"</div>` : ''}
        ${compat.length > 0 ? `<div class="compat-list">${compat.map(c => `
          <div class="compat-item">
            <span class="compat-icon ${c.status === 'match' ? 'compat-match' : c.status === 'mismatch' ? 'compat-mismatch' : 'compat-neutral'}">
              <i class="fa-solid ${c.status === 'match' ? 'fa-check' : c.status === 'mismatch' ? 'fa-xmark' : 'fa-minus'}"></i>
            </span>
            <span>${esc(c.key)}: ${esc(c.text)}</span>
          </div>`).join('')}</div>` : ''}
        ${actionsHtml}
      </div>`;
  }).join('');
}

async function respondToIntroduction(introId, response) {
  const label = response === 'yes' ? '수락' : '거절';
  if (!confirm(`이 소개를 ${label}하시겠어요?`)) return;

  const { data, error } = await sb.rpc('respond_to_introduction', {
    p_introduction_id: introId,
    p_response: response
  });

  if (error) { toast('응답 실패: ' + error.message); return; }

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

// --- Profile Modal ---
async function openProfileModal(applicantId) {
  const { data: person } = await sb.from('applicants')
    .select('*')
    .eq('id', applicantId)
    .maybeSingle();
  if (!person) { toast('프로필을 불러올 수 없어요.'); return; }

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
