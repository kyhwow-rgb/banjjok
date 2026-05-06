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

  const text = `반쪽에 초대할게!\n초대 코드: ${data.code}\n가입: https://kyhwow-rgb.github.io/banjjok/v2/`;

  if (navigator.share) {
    try { await navigator.share({ text }); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    toast('초대 코드가 복사되었어요!');
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
    return `<div class="person-chip" onclick="selectPersonForIntro('${p.id}', this)" data-person-id="${p.id}">
      ${esc(p.name)} ${age ? `(${age}세)` : ''} · ${esc(p.job || '')}
    </div>`;
  }).join('');
}

async function selectPersonForIntro(personId, el) {
  _selectedPersonA = personId;
  document.querySelectorAll('#person-selector .person-chip').forEach(c => c.classList.remove('selected'));
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

  const { data: pool, error } = await sb.rpc('search_introduction_pool', {
    p_gender: gender,
    p_location: location,
  });

  const results = document.getElementById('pool-results');
  if (error || !pool || pool.length === 0) {
    results.innerHTML = '<p style="color:var(--muted);font-size:14px;padding:12px 0;">조건에 맞는 사람이 없어요.</p>';
    return;
  }

  // Get person A data for compatibility
  const { data: personA } = await sb.from('applicants').select('*').eq('id', _selectedPersonA).maybeSingle();

  results.innerHTML = pool.map(p => {
    const age = calcAge(p.birth_date);
    const photoSrc = (p.photos && p.photos[0]) || p.photo_url || '';
    const score = personA ? calcMatchScore(personA, p) : null;

    return `
      <div class="pool-card ${_selectedPersonB === p.id ? 'selected' : ''}" onclick="selectPoolPerson('${p.id}', this)">
        <div style="display:flex;gap:12px;align-items:center;">
          ${photoSrc ? `<img style="width:44px;height:44px;border-radius:50%;object-fit:cover;" src="${esc(photoSrc)}" alt="">` : `<div style="width:44px;height:44px;border-radius:50%;background:var(--surface-alt);display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${esc(p.name)} ${age ? `(${age}세)` : ''}</div>
            <div style="font-size:12px;color:var(--muted);">${esc(p.job || '')} · ${esc(p.location || '')} · ${esc(p.mbti || '')}</div>
          </div>
          ${score != null ? `<div style="font-size:13px;font-weight:600;color:var(--accent);">${score}점</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function selectPoolPerson(personId, el) {
  _selectedPersonB = personId;
  document.querySelectorAll('.pool-card').forEach(c => c.classList.remove('selected'));
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

  const { error } = await sb.from('introductions').insert({
    primary_matchmaker_id: profile.id,
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

  const { data: requests } = await sb.from('introduction_requests')
    .select('*, requester:requester_matchmaker_id(name), target:target_applicant_id(name, gender, birth_date, job, location)')
    .or(`and(request_type.eq.broadcast,status.eq.open),responder_matchmaker_id.eq.${profile.id}`)
    .neq('requester_matchmaker_id', profile.id)
    .order('created_at', { ascending: false });

  const emptyEl = document.getElementById('requests-empty');
  const listEl = document.getElementById('request-list');

  if (!requests || requests.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  listEl.innerHTML = requests.map(req => {
    const criteria = req.criteria || {};
    const age = calcAge(req.target?.birth_date);

    return `
      <div class="request-card">
        <div class="request-card-header">
          <span style="font-size:13px;font-weight:600;">${esc(req.requester?.name || '주선자')}님의 요청</span>
          <span class="request-type-badge ${req.request_type}">${req.request_type === 'broadcast' ? '전체' : '지목'}</span>
        </div>
        <div style="font-size:13px;margin-bottom:8px;">"${esc(req.target?.name || '?')} (${age ? age + '세' : '?'}, ${esc(req.target?.job || '')})에게 어울릴 분을 찾고 있어요"</div>
        <div class="request-criteria">
          ${criteria.gender ? `<span><i class="fa-solid fa-venus-mars"></i> ${criteria.gender === 'male' ? '남성' : '여성'}</span>` : ''}
          ${criteria.age_min || criteria.age_max ? `<span><i class="fa-solid fa-cake-candles"></i> ${criteria.age_min || '?'}~${criteria.age_max || '?'}세</span>` : ''}
          ${criteria.location ? `<span><i class="fa-solid fa-location-dot"></i> ${esc(criteria.location)}</span>` : ''}
          ${criteria.job ? `<span><i class="fa-solid fa-briefcase"></i> ${esc(criteria.job)}</span>` : ''}
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" onclick="respondToRequest('${req.id}')">내 사람 추천하기</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">${formatTimeAgo(req.created_at)}</div>
      </div>`;
  }).join('');
}

async function respondToRequest(requestId) {
  const profile = AppState.getProfile();
  const { data: myPeople } = await sb.from('applicants')
    .select('id, name, gender, birth_date, job')
    .eq('invited_by', profile.id)
    .eq('status', 'approved')
    .eq('is_participant', true);

  if (!myPeople || myPeople.length === 0) {
    toast('추천할 수 있는 사람이 없어요.');
    return;
  }

  const options = myPeople.map(p => `${p.name} (${calcAge(p.birth_date) || '?'}세, ${p.job || '?'})`).join('\n');
  const choice = prompt(`추천할 사람을 선택해주세요:\n\n${options}\n\n이름을 입력하세요:`);
  if (!choice) return;

  const selected = myPeople.find(p => p.name === choice.trim());
  if (!selected) { toast('일치하는 사람이 없어요.'); return; }

  const { error } = await sb.from('introduction_request_responses').insert({
    request_id: requestId,
    responder_matchmaker_id: profile.id,
    proposed_applicant_id: selected.id
  });

  if (error) { toast('응답 실패: ' + error.message); return; }
  toast('응답을 보냈어요!');
  logEvent('request_response', { request_id: requestId, proposed: selected.id });
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
    .select('*, person_a:person_a_id(name), person_b:person_b_id(name)')
    .eq('primary_matchmaker_id', profile.id)
    .order('created_at', { ascending: false });

  const emptyEl = document.getElementById('history-empty');
  const listEl = document.getElementById('history-list');

  if (!history || history.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  listEl.innerHTML = history.map(h => {
    const statusClass = h.status === 'matched' ? 'matched' : h.status === 'declined' ? 'declined' : h.status === 'expired' ? 'expired' : 'pending';
    const statusLabel = h.status === 'matched' ? '매칭 성사' : h.status === 'declined' ? '거절됨' : h.status === 'expired' ? '만료됨' : '진행 중';

    return `
      <div class="history-card">
        <div class="history-names">${esc(h.person_a?.name || '?')} ↔ ${esc(h.person_b?.name || '?')}</div>
        <span class="intro-status-badge ${statusClass}">${statusLabel}</span>
        <div class="history-date">${formatTimeAgo(h.created_at)}</div>
      </div>`;
  }).join('');
}
