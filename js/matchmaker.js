/* ==========================================================================
   반쪽 v2 — Matchmaker (내 사람들, 소개하기, 요청함, 이력)
   ========================================================================== */

let _selectedPersonA = null;
let _selectedPersonB = null;

// --- 내 사람들 ---
async function loadMyPeopleTab() {
  const profile = AppState.getProfile();
  if (!profile || !profile.is_matchmaker) return;

  const { data: people } = await sb.from('applicants')
    .select('id, name, gender, birth_date, photo_url, photos, status, job, location')
    .eq('invited_by', profile.id)
    .order('created_at', { ascending: false });

  const emptyEl = document.getElementById('people-empty');
  const listEl = document.getElementById('people-list');

  if (!people || people.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  listEl.innerHTML = people.map(p => {
    const age = calcAge(p.birth_date);
    const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
    const statusClass = p.status === 'approved' ? 'approved' : p.status === 'pending_reputation' ? 'pending_reputation' : 'pending';
    const statusLabel = p.status === 'approved' ? '승인됨' : p.status === 'pending_reputation' ? '평판 대기' : p.status === 'pending' ? '검토 중' : p.status;

    return `
      <div class="people-card" onclick="openProfileModal('${p.id}')">
        ${photoSrc ? `<img class="people-avatar" src="${esc(photoSrc)}" alt="">` : `<div class="people-avatar" style="display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
        <div class="people-info">
          <div class="people-name">${esc(p.name)}</div>
          <div class="people-detail">${age ? age + '세' : ''} · ${esc(p.job || '')} · ${esc(p.location || '')}</div>
        </div>
        <span class="people-status ${statusClass}">${statusLabel}</span>
        ${p.status === 'pending_reputation' ? `<button class="btn-ghost" style="font-size:12px;" onclick="event.stopPropagation();openReputationModal('${p.id}','${esc(p.name)}')">평판 작성</button>` : ''}
        <button class="btn-ghost" style="font-size:12px;color:var(--accent);" onclick="event.stopPropagation();openMmChat('${p.id}','matchmaker')"><i class="fa-solid fa-comment"></i></button>
      </div>`;
  }).join('');

  // Add invite code button at bottom
  listEl.innerHTML += `
    <div style="padding:16px;text-align:center;">
      <button class="btn-primary" style="width:auto;padding:10px 20px;" onclick="shareInviteCode()">
        <i class="fa-solid fa-share"></i> 초대 코드 공유
      </button>
    </div>`;
}

async function shareInviteCode() {
  const profile = AppState.getProfile();
  if (!profile) return;

  const { data, error } = await sb.from('invite_codes')
    .insert({ created_by: profile.id })
    .select('code')
    .single();

  if (error) { toast('초대 코드 생성 실패'); return; }

  const link = 'https://kyhwow-rgb.github.io/banjjok/';
  const text = `[반쪽] ${profile.name}님이 당신을 소개팅에 초대했어요!\n\n반쪽은 지인이 연결해주는 신뢰 기반 소개팅이에요.\n아래 링크에서 초대 코드를 입력하면 가입할 수 있어요.\n\n초대 코드: ${data.code}\n가입 링크: ${link}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: '반쪽 — 지인이 연결해주는 소개팅',
        text,
        url: link,
      });
    } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    toast(`복사 완료! 카톡 등으로 붙여넣어 초대하세요\n(링크는 가입 페이지로 연결돼요)`);
  }
}

// --- 소개하기 ---
async function loadIntroduceTab() {
  const profile = AppState.getProfile();
  if (!profile || !profile.is_matchmaker) return;

  _selectedPersonA = null;
  _selectedPersonB = null;
  document.getElementById('introduce-step-2')?.classList.add('hidden');
  document.getElementById('introduce-step-3')?.classList.add('hidden');

  const { data: myPeople } = await sb.from('applicants')
    .select('id, name, gender, birth_date, photo_url, photos, job, location, mbti')
    .eq('invited_by', profile.id)
    .eq('status', 'approved')
    .eq('is_participant', true);

  const selector = document.getElementById('person-selector');
  if (!myPeople || myPeople.length === 0) {
    selector.innerHTML = '<p style="color:var(--muted);font-size:14px;">승인된 참가자가 없어요. 먼저 초대 코드를 공유해주세요.</p>';
    return;
  }

  selector.innerHTML = myPeople.map(p => {
    const age = calcAge(p.birth_date);
    const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
    return `<div class="person-row-card" onclick="selectPersonForIntro('${p.id}', this)" data-person-id="${p.id}">
      ${photoSrc ? `<img class="prc-photo" src="${esc(photoSrc)}" alt="">` : `<div class="prc-photo prc-photo-empty"><i class="fa-solid fa-user"></i></div>`}
      <div class="prc-info">
        <div class="prc-name">${esc(p.name)} <span class="prc-meta">${p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : ''} ${age ? age + '세' : ''}</span></div>
        <div class="prc-detail">${esc(p.job || '직업 미입력')} · ${esc(p.location || '')} ${p.height ? '· ' + p.height + 'cm' : ''} ${p.mbti ? '· ' + esc(p.mbti) : ''}</div>
      </div>
    </div>`;
  }).join('');
}

async function selectPersonForIntro(personId, el) {
  _selectedPersonA = personId;
  document.querySelectorAll('#person-selector .person-row-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  // Load the selected person to determine opposite gender
  const { data: personA } = await sb.from('applicants').select('gender').eq('id', personId).maybeSingle();
  const oppositeGender = personA?.gender === 'male' ? 'female' : 'male';

  document.getElementById('pool-gender').value = oppositeGender;
  document.getElementById('introduce-step-2').classList.remove('hidden');
  document.getElementById('introduce-step-3').classList.add('hidden');
  _selectedPersonB = null;

  searchPool();
}

async function searchPool() {
  const gender = document.getElementById('pool-gender').value || null;
  const location = document.getElementById('pool-location').value || null;
  const job = document.getElementById('pool-job')?.value || null;
  const minAge = parseInt(document.getElementById('pool-min-age')?.value) || null;
  const maxAge = parseInt(document.getElementById('pool-max-age')?.value) || null;
  const minHeight = parseInt(document.getElementById('pool-min-height')?.value) || null;
  const maxHeight = parseInt(document.getElementById('pool-max-height')?.value) || null;

  const { data: pool, error } = await sb.rpc('search_introduction_pool', {
    p_gender: gender,
    p_location: location,
    p_job: job,
    p_min_age: minAge,
    p_max_age: maxAge,
    p_min_height: minHeight,
    p_max_height: maxHeight,
  });

  const results = document.getElementById('pool-results');
  if (error) console.error('[searchPool] error:', error);
  if (error || !pool || pool.length === 0) {
    results.innerHTML = '<p style="color:var(--muted);font-size:14px;padding:12px 0;">조건에 맞는 사람이 없어요.</p>';
    return;
  }

  // Get person A data for compatibility score
  const { data: personA } = await sb.from('applicants').select('*').eq('id', _selectedPersonA).maybeSingle();

  results.innerHTML = pool.map((p, idx) => {
    const age = calcAge(p.birth_date);
    const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
    const score = personA ? calcMatchScore(personA, p) : null;
    const selected = _selectedPersonB === p.id ? 'selected' : '';

    return `
      <div class="person-row-card ${selected}" onclick="selectPoolPerson('${p.id}', this)" data-person-id="${p.id}">
        <div class="prc-num">${idx + 1}</div>
        ${photoSrc ? `<img class="prc-photo" src="${esc(photoSrc)}" alt="">` : `<div class="prc-photo prc-photo-empty"><i class="fa-solid fa-user"></i></div>`}
        <div class="prc-info">
          <div class="prc-name">${esc(p.name)} <span class="prc-meta">${p.gender === 'male' ? '♂' : '♀'} ${age ? age + '세' : ''}</span> ${score != null ? `<span class="prc-score">${score}점</span>` : ''}</div>
          <div class="prc-detail">
            ${p.height ? p.height + 'cm · ' : ''}${esc(p.job || '직업 미입력')} · ${esc(p.location || '지역 미입력')} ${p.mbti ? '· ' + esc(p.mbti) : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

async function selectPoolPerson(personId, el) {
  _selectedPersonB = personId;
  document.querySelectorAll('#pool-results .person-row-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  // Show compatibility report
  const { data: personA } = await sb.from('applicants').select('*').eq('id', _selectedPersonA).maybeSingle();
  const { data: personB } = await sb.from('applicants').select('*').eq('id', _selectedPersonB).maybeSingle();

  if (personA && personB) {
    const compatA = compatibilityReport(personA, personB);
    const compatB = compatibilityReport(personB, personA);

    document.getElementById('intro-compat-report').innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${esc(personA.name)}님 입장에서 본 ${esc(personB.name)}님</div>
        <div class="compat-list">${compatA.map(c => `
          <div class="compat-item">
            <span class="compat-icon ${c.status === 'match' ? 'compat-match' : c.status === 'mismatch' ? 'compat-mismatch' : 'compat-neutral'}">
              <i class="fa-solid ${c.status === 'match' ? 'fa-check' : c.status === 'mismatch' ? 'fa-xmark' : 'fa-minus'}"></i>
            </span>
            <span>${esc(c.key)}: ${esc(c.text)}</span>
          </div>`).join('')}</div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${esc(personB.name)}님 입장에서 본 ${esc(personA.name)}님</div>
        <div class="compat-list">${compatB.map(c => `
          <div class="compat-item">
            <span class="compat-icon ${c.status === 'match' ? 'compat-match' : c.status === 'mismatch' ? 'compat-mismatch' : 'compat-neutral'}">
              <i class="fa-solid ${c.status === 'match' ? 'fa-check' : c.status === 'mismatch' ? 'fa-xmark' : 'fa-minus'}"></i>
            </span>
            <span>${esc(c.key)}: ${esc(c.text)}</span>
          </div>`).join('')}</div>
      </div>`;
  }

  document.getElementById('introduce-step-3').classList.remove('hidden');
}

async function confirmSendIntroduction() {
  if (!_selectedPersonA || !_selectedPersonB) { toast('두 사람을 모두 선택해주세요.'); return; }
  if (!confirm('소개를 보내시겠어요?')) return;

  const profile = AppState.getProfile();
  const note = document.getElementById('intro-note').value.trim();

  // Cross-network: if person B was invited by a different matchmaker, set referred_by so
  // that matchmaker also has read access and can be notified.
  const { data: personBRow } = await sb.from('applicants')
    .select('invited_by, gender, is_participant, status')
    .eq('id', _selectedPersonB).maybeSingle();
  const { data: personARow } = await sb.from('applicants')
    .select('gender, is_participant, status')
    .eq('id', _selectedPersonA).maybeSingle();

  // Client-side guards (server CHECKs catch these too — these surface friendlier errors).
  if (!personARow || !personBRow) { toast('상대 정보를 불러올 수 없어요.'); return; }
  if (personARow.gender && personBRow.gender && personARow.gender === personBRow.gender) {
    toast('같은 성별은 매칭할 수 없어요.'); return;
  }
  if (!personARow.is_participant || !personBRow.is_participant
      || personARow.status !== 'approved' || personBRow.status !== 'approved') {
    toast('승인된 참가자만 소개할 수 있어요.'); return;
  }

  const referredBy = (personBRow.invited_by && personBRow.invited_by !== profile.id)
    ? personBRow.invited_by : null;

  const { error } = await sb.from('introductions').insert({
    primary_matchmaker_id: profile.id,
    referred_by_matchmaker_id: referredBy,
    person_a_id: _selectedPersonA,
    person_b_id: _selectedPersonB,
    note: note || null,
    person_a_response: 'pending',
    person_b_response: 'pending',
    status: 'pending'
  });

  if (error) { toast('소개 전송 실패: ' + error.message); return; }

  // Notify both people
  await sb.rpc('create_notification', { p_user_id: _selectedPersonA, p_type: 'introduction_received', p_title: '소개가 도착했어요!', p_body: '주선자가 새로운 소개를 보냈어요.' });
  await sb.rpc('create_notification', { p_user_id: _selectedPersonB, p_type: 'introduction_received', p_title: '소개가 도착했어요!', p_body: '주선자가 새로운 소개를 보냈어요.' });
  // Notify referred matchmaker if different
  if (referredBy) {
    await sb.rpc('create_notification', { p_user_id: referredBy, p_type: 'introduction_received', p_title: '내 사람이 소개되었어요', p_body: `${profile.name}님이 새 소개를 보냈어요.` });
  }

  toast('소개를 보냈어요!');
  logEvent('introduction_sent', { person_a: _selectedPersonA, person_b: _selectedPersonB });

  // Reset
  _selectedPersonA = null;
  _selectedPersonB = null;
  loadIntroduceTab();
}

// --- 요청함 ---
async function loadRequestsTab() {
  const profile = AppState.getProfile();
  if (!profile || !profile.is_matchmaker) return;

  const { data: requests, error: requestsError } = await sb.from('introduction_requests')
    .select(`*,
      requester:requester_matchmaker_id(name, photo_url, photos),
      target:target_applicant_id(name, gender, birth_date, job, location, mbti, height, photo_url, photos)
    `)
    .or(`and(request_type.eq.broadcast,status.eq.open),responder_matchmaker_id.eq.${profile.id}`)
    .neq('requester_matchmaker_id', profile.id)
    .order('created_at', { ascending: false });

  const { data: myRequests, error: myRequestsError } = await sb.from('introduction_requests')
    .select(`*,
      target:target_applicant_id(name, gender, birth_date, job, location, mbti, height, photo_url, photos)
    `)
    .eq('requester_matchmaker_id', profile.id)
    .order('created_at', { ascending: false });

  let responseRows = [];
  if (myRequests && myRequests.length > 0) {
    const requestIds = myRequests.map(req => req.id);
    const { data: responses, error: responsesError } = await sb.from('introduction_request_responses')
      .select(`*,
        responder:responder_matchmaker_id(name, photo_url, photos),
        proposed:proposed_applicant_id(name, gender, birth_date, job, location, mbti, height, photo_url, photos)
      `)
      .in('request_id', requestIds)
      .order('created_at', { ascending: false });
    if (responsesError) console.error('[loadRequestsTab] responses failed:', responsesError);
    responseRows = responses || [];
  }

  if (requestsError) console.error('[loadRequestsTab] incoming requests failed:', requestsError);
  if (myRequestsError) console.error('[loadRequestsTab] my requests failed:', myRequestsError);

  const emptyEl = document.getElementById('requests-empty');
  const listEl = document.getElementById('request-list');

  const hasIncoming = requests && requests.length > 0;
  const hasMyRequests = myRequests && myRequests.length > 0;
  const hasResponses = responseRows.length > 0;

  if (!hasIncoming && !hasMyRequests) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  const renderRequestCard = req => {
    const criteria = req.criteria || {};
    const target = req.target || {};
    const age = calcAge(target.birth_date);
    const targetPhoto = (target.photos && target.photos[0]) || target.photo_url || '';
    const requesterPhoto = (req.requester?.photos && req.requester.photos[0]) || req.requester?.photo_url || '';

    return `
      <div class="request-card-v2">
        <div class="rcv-header">
          <div class="rcv-requester">
            ${requesterPhoto ? `<img class="rcv-requester-photo" src="${esc(requesterPhoto)}" alt="">` : '<div class="rcv-requester-photo rcv-photo-empty"><i class="fa-solid fa-user"></i></div>'}
            <span class="rcv-requester-name">${esc(req.requester?.name || '주선자')}님의 요청</span>
          </div>
          <span class="request-type-badge ${req.request_type}">${req.request_type === 'broadcast' ? '전체' : '지목'}</span>
        </div>

        <div class="rcv-target">
          ${targetPhoto ? `<img class="rcv-target-photo" src="${esc(targetPhoto)}" alt="">` : '<div class="rcv-target-photo rcv-photo-empty"><i class="fa-solid fa-user"></i></div>'}
          <div class="rcv-target-info">
            <div class="rcv-target-name">${esc(target.name || '?')} ${target.gender === 'male' ? '♂' : target.gender === 'female' ? '♀' : ''} <span class="rcv-target-age">${age ? age + '세' : ''}</span></div>
            <div class="rcv-target-detail">${target.height ? target.height + 'cm · ' : ''}${esc(target.job || '')}${target.location ? ' · ' + esc(target.location) : ''}${target.mbti ? ' · ' + esc(target.mbti) : ''}</div>
            <div class="rcv-target-headline">에게 어울릴 분을 찾고 있어요</div>
          </div>
        </div>

        <div class="rcv-criteria-block">
          <div class="rcv-criteria-label">이런 분이면 좋아요</div>
          <div class="request-criteria">
            ${criteria.gender ? `<span><i class="fa-solid fa-venus-mars"></i> ${criteria.gender === 'male' ? '남성' : '여성'}</span>` : ''}
            ${(criteria.age_min || criteria.age_max) ? `<span><i class="fa-solid fa-cake-candles"></i> ${criteria.age_min || '?'}~${criteria.age_max || '?'}세</span>` : ''}
            ${criteria.location ? `<span><i class="fa-solid fa-location-dot"></i> ${esc(criteria.location)}</span>` : ''}
            ${criteria.job ? `<span><i class="fa-solid fa-briefcase"></i> ${esc(criteria.job)}</span>` : ''}
            ${(!criteria.gender && !criteria.age_min && !criteria.age_max && !criteria.location && !criteria.job) ? '<span style="color:var(--muted);">조건 없음 (자유)</span>' : ''}
          </div>
        </div>

        <div class="rcv-actions">
          <button class="btn-primary rcv-btn" onclick="openRespondPickerModal('${req.id}', '${esc(target.name || '')}')"><i class="fa-solid fa-hand-holding-heart"></i> 내 사람 추천하기</button>
          <span class="rcv-time">${formatTimeAgo(req.created_at)}</span>
        </div>
      </div>`;
  };

  const requestMap = {};
  (myRequests || []).forEach(req => { requestMap[req.id] = req; });

  const renderResponseCard = res => {
    const req = requestMap[res.request_id] || {};
    const target = req.target || {};
    const proposed = res.proposed || {};
    const responderPhoto = (res.responder?.photos && res.responder.photos[0]) || res.responder?.photo_url || '';
    const proposedPhoto = (proposed.photos && proposed.photos[0]) || proposed.photo_url || '';
    const targetAge = calcAge(target.birth_date);
    const proposedAge = calcAge(proposed.birth_date);
    const statusLabel = res.status === 'requester_accepted' ? '수락됨' : res.status === 'requester_declined' ? '거절됨' : '검토 대기';
    const statusClass = res.status === 'requester_accepted' ? 'matched' : res.status === 'requester_declined' ? 'declined' : 'pending';

    return `
      <div class="request-card-v2 request-response-card">
        <div class="rcv-header">
          <div class="rcv-requester">
            ${responderPhoto ? `<img class="rcv-requester-photo" src="${esc(responderPhoto)}" alt="">` : '<div class="rcv-requester-photo rcv-photo-empty"><i class="fa-solid fa-user"></i></div>'}
            <span class="rcv-requester-name">${esc(res.responder?.name || '주선자')}님의 추천</span>
          </div>
          <span class="intro-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="response-pair">
          <div class="response-person">
            <div class="response-label">내 요청 대상</div>
            <div class="response-name">${esc(target.name || '?')} ${targetAge ? `<span>${targetAge}세</span>` : ''}</div>
            <div class="response-detail">${target.height ? target.height + 'cm · ' : ''}${esc(target.job || '')}${target.location ? ' · ' + esc(target.location) : ''}</div>
          </div>
          <div class="response-link"><i class="fa-solid fa-heart"></i></div>
          <div class="response-person">
            <div class="response-label">추천 후보</div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${proposedPhoto ? `<img class="response-photo" src="${esc(proposedPhoto)}" alt="">` : '<div class="response-photo rcv-photo-empty"><i class="fa-solid fa-user"></i></div>'}
              <div>
                <div class="response-name">${esc(proposed.name || '?')} ${proposedAge ? `<span>${proposedAge}세</span>` : ''}</div>
                <div class="response-detail">${proposed.height ? proposed.height + 'cm · ' : ''}${esc(proposed.job || '')}${proposed.location ? ' · ' + esc(proposed.location) : ''}${proposed.mbti ? ' · ' + esc(proposed.mbti) : ''}</div>
              </div>
            </div>
          </div>
        </div>
        ${res.status === 'pending' ? `
          <div class="rcv-actions response-actions">
            <button class="btn-ghost rcv-btn" onclick="resolveRequestResponse('${res.id}', false)">거절</button>
            <button class="btn-primary rcv-btn" onclick="resolveRequestResponse('${res.id}', true)">소개 만들기</button>
          </div>
        ` : ''}
        <div class="rcv-time" style="margin-top:8px;">${formatTimeAgo(res.created_at)}</div>
      </div>`;
  };

  const myRequestHtml = hasResponses
    ? responseRows.map(renderResponseCard).join('')
    : (hasMyRequests ? '<div class="request-empty-inline">아직 도착한 추천이 없어요.</div>' : '');

  listEl.innerHTML = `
    <div class="request-section">
      <div class="request-section-title">내 요청에 온 추천</div>
      ${myRequestHtml}
    </div>
    <div class="request-section">
      <div class="request-section-title">받은 요청</div>
      ${hasIncoming ? requests.map(renderRequestCard).join('') : '<div class="request-empty-inline">응답할 요청이 없어요.</div>'}
    </div>`;
}

let _currentRespondReqId = null;

async function openRespondPickerModal(requestId, targetName) {
  _currentRespondReqId = requestId;
  const profile = AppState.getProfile();
  const { data: myPeople } = await sb.from('applicants')
    .select('id, name, gender, birth_date, job, location, mbti, height, photo_url, photos')
    .eq('invited_by', profile.id)
    .eq('status', 'approved')
    .eq('is_participant', true);

  document.getElementById('respond-target-name').textContent = targetName || '상대';
  const list = document.getElementById('respond-people-list');

  if (!myPeople || myPeople.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:14px;padding:12px 0;text-align:center;">추천할 수 있는 사람이 없어요. 먼저 초대 코드를 공유해주세요.</p>';
  } else {
    list.innerHTML = myPeople.map(p => {
      const age = calcAge(p.birth_date);
      const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
      return `<div class="person-row-card" onclick="confirmRespondPick('${p.id}','${esc(p.name)}', this)">
        ${photoSrc ? `<img class="prc-photo" src="${esc(photoSrc)}" alt="">` : '<div class="prc-photo prc-photo-empty"><i class="fa-solid fa-user"></i></div>'}
        <div class="prc-info">
          <div class="prc-name">${esc(p.name)} <span class="prc-meta">${p.gender === 'male' ? '♂' : '♀'} ${age ? age + '세' : ''}</span></div>
          <div class="prc-detail">${p.height ? p.height + 'cm · ' : ''}${esc(p.job || '')} ${p.location ? '· ' + esc(p.location) : ''} ${p.mbti ? '· ' + esc(p.mbti) : ''}</div>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('respond-picker-overlay').classList.add('open');
}

function closeRespondPickerModal() {
  document.getElementById('respond-picker-overlay').classList.remove('open');
  _currentRespondReqId = null;
}

async function confirmRespondPick(personId, personName, el) {
  if (!_currentRespondReqId) return;
  if (!confirm(`${personName}님을 추천하시겠어요?`)) return;
  const profile = AppState.getProfile();

  // Look up the requester so we can notify them after insert.
  const { data: req } = await sb.from('introduction_requests')
    .select('requester_matchmaker_id')
    .eq('id', _currentRespondReqId).maybeSingle();

  const { error } = await sb.from('introduction_request_responses').insert({
    request_id: _currentRespondReqId,
    responder_matchmaker_id: profile.id,
    proposed_applicant_id: personId
  });
  if (error) { toast('응답 실패: ' + error.message); return; }

  if (req?.requester_matchmaker_id) {
    await sb.rpc('create_notification', {
      p_user_id: req.requester_matchmaker_id,
      p_type: 'request_received',
      p_title: '내 요청에 추천이 도착했어요',
      p_body: `${profile.name}님이 ${personName}님을 추천했어요.`,
      p_data: { request_id: _currentRespondReqId, proposed_applicant_id: personId }
    });
  }

  toast(`${personName}님을 추천했어요!`);
  logEvent('request_response', { request_id: _currentRespondReqId, proposed: personId });
  closeRespondPickerModal();
}

async function resolveRequestResponse(responseId, accept) {
  const action = accept ? '소개를 만들까요?' : '이 추천을 거절할까요?';
  if (!confirm(action)) return;

  const { data, error } = await sb.rpc('resolve_request_response', {
    p_response_id: responseId,
    p_accept: accept,
  });

  if (error) {
    toast((accept ? '소개 생성 실패: ' : '거절 실패: ') + error.message);
    return;
  }

  if (data?.accepted) {
    toast('소개를 만들었어요. 두 참가자에게 알림을 보냈습니다.');
    logEvent('request_response_accepted', { response_id: responseId, introduction_id: data.introduction_id });
  } else {
    toast('추천을 거절했어요.');
    logEvent('request_response_declined', { response_id: responseId });
  }

  loadRequestsTab();
  loadHistoryTab();
}

// --- Broadcast 요청 생성 ---
function openCreateRequestModal() {
  const profile = AppState.getProfile();
  // Populate target person dropdown
  sb.from('applicants')
    .select('id, name, birth_date, job')
    .eq('invited_by', profile.id)
    .eq('status', 'approved')
    .eq('is_participant', true)
    .then(({ data: people }) => {
      const select = document.getElementById('req-target-person');
      select.innerHTML = '<option value="">내 사람 선택</option>' +
        (people || []).map(p => `<option value="${p.id}">${esc(p.name)} (${calcAge(p.birth_date) || '?'}세)</option>`).join('');
    });

  document.getElementById('request-modal-overlay').classList.add('open');
}

function closeRequestModal() {
  document.getElementById('request-modal-overlay').classList.remove('open');
}

async function submitBroadcastRequest() {
  const targetPerson = document.getElementById('req-target-person').value;
  const gender = document.getElementById('req-gender').value;
  if (!targetPerson) { toast('내 사람을 선택해주세요.'); return; }

  const criteria = {};
  if (gender) criteria.gender = gender;
  const ageMin = parseInt(document.getElementById('req-age-min').value);
  const ageMax = parseInt(document.getElementById('req-age-max').value);
  if (ageMin) criteria.age_min = ageMin;
  if (ageMax) criteria.age_max = ageMax;
  const loc = document.getElementById('req-location').value;
  if (loc) criteria.location = loc;
  const job = document.getElementById('req-job').value;
  if (job) criteria.job = job;

  const profile = AppState.getProfile();
  const { error } = await sb.from('introduction_requests').insert({
    requester_matchmaker_id: profile.id,
    target_applicant_id: targetPerson,
    request_type: 'broadcast',
    criteria: criteria,
    status: 'open'
  });

  if (error) { toast('요청 생성 실패: ' + error.message); return; }
  toast('소개 요청을 보냈어요!');
  closeRequestModal();
  logEvent('broadcast_request', { target: targetPerson });
}

// --- 이력 ---
async function loadHistoryTab() {
  const profile = AppState.getProfile();
  if (!profile || !profile.is_matchmaker) return;

  const { data: history } = await sb.from('introductions')
    .select(`*,
      person_a:person_a_id(id, name, gender, birth_date, job, location, mbti, height, photo_url, photos),
      person_b:person_b_id(id, name, gender, birth_date, job, location, mbti, height, photo_url, photos)
    `)
    .or(`primary_matchmaker_id.eq.${profile.id},referred_by_matchmaker_id.eq.${profile.id}`)
    .order('created_at', { ascending: false });

  const emptyEl = document.getElementById('history-empty');
  const listEl = document.getElementById('history-list');

  if (!history || history.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  const renderMini = (p) => {
    if (!p) return '<div class="hist-person hist-person-unknown"><i class="fa-solid fa-user"></i><div>알 수 없음</div></div>';
    const age = calcAge(p.birth_date);
    const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
    return `
      <div class="hist-person" onclick="event.stopPropagation();openProfileModal('${p.id}')">
        ${photoSrc ? `<img class="hist-photo" src="${esc(photoSrc)}" alt="">` : `<div class="hist-photo hist-photo-empty"><i class="fa-solid fa-user"></i></div>`}
        <div class="hist-name">${esc(p.name)} ${p.gender === 'male' ? '♂' : '♀'}</div>
        <div class="hist-detail">${age ? age + '세' : ''}${p.height ? ' · ' + p.height + 'cm' : ''}</div>
        <div class="hist-detail">${esc(p.job || '')}${p.location ? ' · ' + esc(p.location) : ''}${p.mbti ? ' · ' + esc(p.mbti) : ''}</div>
      </div>`;
  };

  listEl.innerHTML = history.map(h => {
    const statusClass = h.status === 'matched' ? 'matched' : h.status === 'declined' ? 'declined' : h.status === 'expired' ? 'expired' : 'pending';
    const statusLabel = h.status === 'matched' ? '매칭 성사' : h.status === 'declined' ? '거절됨' : h.status === 'expired' ? '만료됨' : '진행 중';

    return `
      <div class="history-card-v2">
        <div class="history-meta">
          <span class="intro-status-badge ${statusClass}">${statusLabel}</span>
          <span class="history-date">${formatTimeAgo(h.created_at)}</span>
        </div>
        <div class="history-couple">
          ${renderMini(h.person_a)}
          <div class="history-link"><i class="fa-solid fa-heart"></i></div>
          ${renderMini(h.person_b)}
        </div>
        ${h.note ? `<div class="history-note">"${esc(h.note)}"</div>` : ''}
      </div>`;
  }).join('');
}

// --- Matchmaker MY Tab ---
async function loadMatchmakerMyTab() {
  const profile = AppState.getProfile();
  if (!profile) return;

  // Stats: 추천한 사람 수, 진행 중 소개, 성사 매칭 — 각 쿼리 에러 별도 추적
  const [invitedRes, introRes, matchedRes] = await Promise.all([
    sb.from('applicants').select('id', { count: 'exact', head: true }).eq('invited_by', profile.id),
    sb.from('introductions').select('id', { count: 'exact', head: true }).eq('primary_matchmaker_id', profile.id).eq('status', 'pending'),
    sb.from('introductions').select('id', { count: 'exact', head: true }).eq('primary_matchmaker_id', profile.id).eq('status', 'matched'),
  ]);

  if (invitedRes.error) console.error('[loadMatchmakerMyTab] invited count failed:', invitedRes.error);
  if (introRes.error) console.error('[loadMatchmakerMyTab] intro count failed:', introRes.error);
  if (matchedRes.error) console.error('[loadMatchmakerMyTab] matched count failed:', matchedRes.error);

  const fmt = (res, suffix) => res.error ? '—' : `${res.count || 0}${suffix}`;
  const headerSub = invitedRes.error ? '주선자' : `주선자 · 추천한 분 ${invitedRes.count || 0}명`;

  const container = document.getElementById('mm-my-profile');
  if (!container) return;

  container.innerHTML = `
    <div class="my-profile-header">
      <div class="my-profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--muted);"><i class="fa-solid fa-hand-holding-heart"></i></div>
      <div class="my-profile-name">${esc(profile.name)}</div>
      <div class="my-profile-sub">${headerSub}</div>
    </div>

    <div class="my-section">
      <div class="my-section-title">활동 통계</div>
      <div class="pm-grid">
        <div class="pm-grid-item"><div class="pm-grid-label">추천한 분</div><div class="pm-grid-value">${fmt(invitedRes, '명')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">진행 중 소개</div><div class="pm-grid-value">${fmt(introRes, '건')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">성사된 매칭</div><div class="pm-grid-value">${fmt(matchedRes, '쌍')}</div></div>
      </div>
    </div>

    ${profile.is_participant ? `
      <div class="my-section">
        <div class="my-section-title">힌트</div>
        <p style="font-size:13px;color:var(--muted);line-height:1.5;">참가자 모드 (소개 받기)도 활성화되어 있어요. 상단 '참가자' 토글로 전환할 수 있어요.</p>
      </div>
    ` : `
      <div class="my-section">
        <div class="my-section-title">설정</div>
        <div class="my-menu-item" onclick="enableParticipantRole()">
          <span><i class="fa-solid fa-heart"></i> 참가자 역할 추가</span>
          <i class="fa-solid fa-chevron-right chevron"></i>
        </div>
      </div>
    `}

    <button class="btn-secondary" id="btn-mm-logout" style="margin-top:8px;">
      <i class="fa-solid fa-right-from-bracket"></i> 로그아웃
    </button>
  `;

  document.getElementById('btn-mm-logout')?.addEventListener('click', confirmLogout);
}
