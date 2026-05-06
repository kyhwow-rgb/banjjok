/* ==========================================================================
   반쪽 v2 — Profile & Onboarding
   ========================================================================== */

let _photoFiles = [null, null, null];
let _selectedGender = null;
let _onboardStep = 1;
const ONBOARD_TOTAL_STEPS = 4;

// --- Onboarding ---
function initOnboarding() {
  _onboardStep = 1;
  showOnboardStep(1);
  renderPhotoSlots('onboard-photo-slots');

  // Gender selector
  document.getElementById('onboard-gender-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('.gender-btn');
    if (!btn) return;
    _selectedGender = btn.dataset.gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Step navigation
  document.getElementById('onboard-next-1')?.addEventListener('click', () => onboardNext(1));
  document.getElementById('onboard-next-2')?.addEventListener('click', () => onboardNext(2));
  document.getElementById('onboard-next-3')?.addEventListener('click', () => onboardNext(3));
  document.getElementById('onboard-back-2')?.addEventListener('click', () => onboardBack(2));
  document.getElementById('onboard-back-3')?.addEventListener('click', () => onboardBack(3));
  document.getElementById('onboard-back-4')?.addEventListener('click', () => onboardBack(4));
  document.getElementById('onboard-submit')?.addEventListener('click', submitOnboarding);
}

function showOnboardStep(step) {
  _onboardStep = step;
  document.querySelectorAll('.onboard-step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`onboard-step-${step}`);
  if (el) el.classList.add('active');
  const bar = document.getElementById('onboard-progress-bar');
  if (bar) bar.style.width = `${(step / ONBOARD_TOTAL_STEPS) * 100}%`;
}

function onboardNext(fromStep) {
  if (fromStep === 1) {
    if (!_selectedGender) { toast('성별을 선택해주세요.'); return; }
    const phone = document.getElementById('onboard-phone').value.trim();
    const birth = document.getElementById('onboard-birth').value.trim();
    if (!phone) { toast('전화번호를 입력해주세요.'); return; }
    if (!birth) { toast('생년월일을 입력해주세요.'); return; }
    showOnboardStep(2);
  } else if (fromStep === 2) {
    // Photos optional, proceed
    const profile = AppState.getProfile();
    if (profile && profile.is_participant) {
      // Render ideal chips
      document.getElementById('onboard-ideal-chips').innerHTML = buildIdealChipsHtml('onboard-ideal-chips', null, _selectedGender);
      showOnboardStep(3);
    } else {
      // Matchmaker-only: skip ideal type
      showOnboardStep(4);
    }
  } else if (fromStep === 3) {
    showOnboardStep(4);
  }
}

function onboardBack(toStep) {
  const profile = AppState.getProfile();
  if (toStep === 4 && profile && !profile.is_participant) {
    showOnboardStep(2); // Skip ideal step back for matchmaker-only
  } else {
    showOnboardStep(toStep - 1);
  }
}

async function submitOnboarding() {
  const terms = document.getElementById('onboard-terms');
  const watermark = document.getElementById('onboard-watermark-terms');
  if (!terms?.checked || !watermark?.checked) { toast('약관에 동의해주세요.'); return; }

  const user = AppState.getUser();
  if (!user) { toast('로그인이 필요합니다.'); return; }

  toast('프로필 저장 중...');

  // Upload photos
  let photoUrls = [];
  for (let i = 0; i < 3; i++) {
    if (_photoFiles[i]) {
      try {
        const url = await uploadPhotoToStorage(_photoFiles[i], user.id, i);
        photoUrls.push(url);
      } catch (e) { console.error('Photo upload error:', e); }
    }
  }

  // Collect ideal type data
  let idealType = null;
  const profile = AppState.getProfile();
  if (profile && profile.is_participant) {
    idealType = collectIdealData('onboard-ideal-chips', 'onboard-ideal-memo');
  }

  const updateData = {
    gender: _selectedGender,
    phone: document.getElementById('onboard-phone').value.trim(),
    birth_date: document.getElementById('onboard-birth').value.trim(),
    height: parseInt(document.getElementById('onboard-height').value) || null,
    job: document.getElementById('onboard-job').value,
    location: document.getElementById('onboard-location').value,
    mbti: document.getElementById('onboard-mbti').value,
    religion: document.getElementById('onboard-religion').value,
    smoking: document.getElementById('onboard-smoking').value,
    drinking: document.getElementById('onboard-drinking').value,
    bio: document.getElementById('onboard-bio').value.trim(),
    ideal_type: idealType,
    photo_url: photoUrls[0] || null,
    photos: photoUrls.length > 0 ? photoUrls : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('applicants')
    .update(updateData)
    .eq('user_id', user.id);

  if (error) { toast('프로필 저장 실패: ' + error.message); return; }

  await AppState.refreshProfile();
  toast('프로필이 완성되었어요!');
  logEvent('onboarding_complete');

  // Route to appropriate screen
  const updated = AppState.getProfile();
  if (updated && updated.status === 'pending_reputation') {
    AppState.showScreen('screen-reputation-gate');
    loadReputationGate();
  } else if (updated && (updated.status === 'approved')) {
    AppState.showScreen('screen-main');
    initMainApp();
  } else {
    AppState.showScreen('screen-reputation-gate');
    loadReputationGate();
  }
}

// --- Photo Slots ---
function renderPhotoSlots(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  _photoFiles = [null, null, null];
  container.innerHTML = [0, 1, 2].map(i => `
    <div class="photo-slot" id="photo-slot-${i}">
      <div class="photo-placeholder"><i class="fa-solid fa-camera"></i><div>사진 ${i + 1}</div></div>
      <input type="file" accept="image/*" onchange="handlePhotoSelect(${i}, this)">
    </div>
  `).join('');
}

function handlePhotoSelect(index, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('5MB 이하 사진만 업로드 가능해요.'); return; }
  _photoFiles[index] = file;

  const reader = new FileReader();
  reader.onload = e => {
    const slot = document.getElementById(`photo-slot-${index}`);
    slot.classList.add('has-photo');
    slot.innerHTML = `
      <img src="${e.target.result}" alt="사진 ${index + 1}">
      <button class="photo-remove" onclick="removePhoto(event, ${index})">&times;</button>
      <input type="file" accept="image/*" onchange="handlePhotoSelect(${index}, this)">
    `;
  };
  reader.readAsDataURL(file);
}

function removePhoto(event, index) {
  event.stopPropagation();
  event.preventDefault();
  _photoFiles[index] = null;
  const slot = document.getElementById(`photo-slot-${index}`);
  slot.classList.remove('has-photo');
  slot.innerHTML = `
    <div class="photo-placeholder"><i class="fa-solid fa-camera"></i><div>사진 ${index + 1}</div></div>
    <input type="file" accept="image/*" onchange="handlePhotoSelect(${index}, this)">
  `;
}

// --- MY Tab ---
async function loadMyTab() {
  const profile = AppState.getProfile();
  if (!profile) return;
  const container = document.getElementById('my-profile');
  if (!container) return;

  const age = calcAge(profile.birth_date);
  const photoSrc = (profile.photos && profile.photos[0]) || profile.photo_url || '';

  container.innerHTML = `
    <div class="my-profile-header">
      ${photoSrc ? `<img class="my-profile-avatar" src="${esc(photoSrc)}" alt="">` : `<div class="my-profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
      <div class="my-profile-name">${esc(profile.name)}</div>
      <div class="my-profile-sub">${age ? age + '세' : ''} ${esc(profile.job || '')} ${esc(profile.location || '')}</div>
    </div>

    <div class="my-section">
      <div class="my-section-title">내 정보</div>
      <div class="pm-grid">
        <div class="pm-grid-item"><div class="pm-grid-label">키</div><div class="pm-grid-value">${profile.height ? profile.height + 'cm' : '—'}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">MBTI</div><div class="pm-grid-value">${esc(profile.mbti || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">종교</div><div class="pm-grid-value">${esc(profile.religion || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">흡연</div><div class="pm-grid-value">${esc(profile.smoking || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">음주</div><div class="pm-grid-value">${esc(profile.drinking || '—')}</div></div>
        <div class="pm-grid-item"><div class="pm-grid-label">학력</div><div class="pm-grid-value">${esc(profile.education || '—')}</div></div>
      </div>
    </div>

    ${profile.bio ? `<div class="my-section"><div class="my-section-title">소개</div><div class="pm-bio">${esc(profile.bio)}</div></div>` : ''}

    ${profile.ideal_type ? `<div class="my-section"><div class="my-section-title">이상형</div><div>${renderIdealDisplay(profile.ideal_type)}</div></div>` : ''}

    <div class="my-section">
      <div class="my-section-title">설정</div>
      <div class="my-menu-item" onclick="openProfileEditModal()">
        <span><i class="fa-solid fa-pen"></i> 프로필 수정</span>
        <i class="fa-solid fa-chevron-right chevron"></i>
      </div>
      ${!profile.is_matchmaker ? `<div class="my-menu-item" onclick="enableMatchmakerRole()">
        <span><i class="fa-solid fa-hand-holding-heart"></i> 주선자 역할 추가</span>
        <i class="fa-solid fa-chevron-right chevron"></i>
      </div>` : ''}
      ${!profile.is_participant ? `<div class="my-menu-item" onclick="enableParticipantRole()">
        <span><i class="fa-solid fa-heart"></i> 참가자 역할 추가</span>
        <i class="fa-solid fa-chevron-right chevron"></i>
      </div>` : ''}
    </div>

    <button class="btn-secondary" id="btn-logout" style="margin-top:8px;">
      <i class="fa-solid fa-right-from-bracket"></i> 로그아웃
    </button>
  `;

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    AppState.unsubscribeAll();
    await sb.auth.signOut();
    AppState.showScreen('screen-auth');
  });
}

async function enableMatchmakerRole() {
  const { error } = await sb.from('applicants')
    .update({ is_matchmaker: true })
    .eq('user_id', AppState.getUser().id);
  if (error) { toast('역할 추가 실패'); return; }
  await AppState.refreshProfile();
  toast('주선자 역할이 추가되었어요!');
  document.getElementById('mode-toggle').style.display = '';
  loadMyTab();
}

async function enableParticipantRole() {
  const { error } = await sb.from('applicants')
    .update({ is_participant: true })
    .eq('user_id', AppState.getUser().id);
  if (error) { toast('역할 추가 실패'); return; }
  await AppState.refreshProfile();
  toast('참가자 역할이 추가되었어요!');
  document.getElementById('mode-toggle').style.display = '';
  loadMyTab();
}

function openProfileEditModal() {
  // For now, redirect to onboarding with existing data pre-filled
  toast('프로필 수정 기능은 곧 추가될 예정이에요.');
}

// --- Report / Block ---
async function reportUser(targetId) {
  const reason = prompt('신고 사유를 입력해주세요.');
  if (!reason || !reason.trim()) return;
  const profile = AppState.getProfile();
  const { error } = await sb.from('reports').insert({
    reporter_id: profile.id, target_id: targetId, reason: reason.trim()
  });
  if (error) { toast('신고 접수 실패'); return; }
  toast('신고가 접수되었어요.');
  logEvent('report_user', { target_id: targetId });
}

async function blockUser(blockedId) {
  if (!confirm('이 사용자를 차단하시겠어요?')) return;
  const profile = AppState.getProfile();
  const { error } = await sb.from('blocks').insert({
    blocker_id: profile.id, blocked_id: blockedId
  });
  if (error) { toast('차단 실패'); return; }
  toast('차단되었어요.');
  logEvent('block_user', { blocked_id: blockedId });
}

// --- Reputation ---
let _repTargetId = null;
let _repScore = 3;

function openReputationModal(targetId, targetName) {
  _repTargetId = targetId;
  _repScore = 3;
  document.getElementById('reputation-target-info').textContent = targetName || '';
  document.getElementById('rep-relationship').value = '';
  document.getElementById('rep-personality').value = '';
  document.getElementById('rep-strengths').value = '';
  document.getElementById('rep-dating-style').value = '';
  document.getElementById('rep-overall').value = '';
  updateRepStars(3);
  document.getElementById('reputation-modal-overlay').classList.add('open');
}

function closeReputationModal() {
  document.getElementById('reputation-modal-overlay').classList.remove('open');
  _repTargetId = null;
}

function setRepScore(score) {
  _repScore = score;
  updateRepStars(score);
}

function updateRepStars(score) {
  const buttons = document.querySelectorAll('#rep-score button');
  buttons.forEach((btn, i) => btn.classList.toggle('active', i < score));
}

async function saveReputation() {
  if (!_repTargetId) return;
  const profile = AppState.getProfile();
  const relationship = document.getElementById('rep-relationship').value;
  const personality = document.getElementById('rep-personality').value.trim();
  const strengths = document.getElementById('rep-strengths').value.trim();

  if (!relationship) { toast('관계를 선택해주세요.'); return; }
  if (!personality) { toast('성격을 적어주세요.'); return; }

  const { error } = await sb.from('reputations').upsert({
    writer_id: profile.id,
    target_id: _repTargetId,
    relationship,
    personality,
    strengths,
    dating_style: document.getElementById('rep-dating-style').value.trim(),
    overall: document.getElementById('rep-overall').value.trim(),
    score: _repScore,
  }, { onConflict: 'writer_id,target_id' });

  if (error) { toast('평판 저장 실패: ' + error.message); return; }

  // Check if this was the required reputation gate
  const { data: target } = await sb.from('applicants').select('status, invited_by').eq('id', _repTargetId).maybeSingle();
  if (target && target.status === 'pending_reputation' && target.invited_by === profile.id) {
    await sb.from('applicants').update({ status: 'pending' }).eq('id', _repTargetId);
    await sb.rpc('create_notification', {
      p_user_id: _repTargetId,
      p_type: 'reputation_written',
      p_title: '평판이 작성되었어요!',
      p_body: '관리자 검토 후 가입이 완료됩니다.'
    });
  }

  toast('평판이 저장되었어요!');
  closeReputationModal();
  logEvent('reputation_written', { target_id: _repTargetId });
}
