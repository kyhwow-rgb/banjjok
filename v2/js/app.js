/* ==========================================================================
   반쪽 v2 — Main App Logic
   ========================================================================== */

(async function init() {
  // --- Auth State ---
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await AppState.setUser(session.user);
    routeAfterAuth();
  } else {
    AppState.showScreen('screen-auth');
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await AppState.setUser(session.user);
      routeAfterAuth();
    } else if (event === 'SIGNED_OUT') {
      AppState.unsubscribeAll();
      clearWatermark();
      AppState.showScreen('screen-auth');
    }
  });

  // --- Auth Forms ---
  document.getElementById('show-signup').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('auth-login').classList.add('hidden');
    document.getElementById('auth-signup').classList.remove('hidden');
  });

  document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('auth-signup').classList.add('hidden');
    document.getElementById('auth-login').classList.remove('hidden');
  });

  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-signup').addEventListener('click', handleSignup);

  // --- Gate Logout ---
  document.getElementById('btn-gate-logout')?.addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  // --- Mode Toggle ---
  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    AppState.setMode(mode);
  });

  document.addEventListener('mode-change', e => {
    const { mode } = e.detail;
    document.querySelectorAll('.mode-content').forEach(m => m.classList.remove('active'));
    document.getElementById(`mode-${mode}`).classList.add('active');

    // Load data for the new mode
    if (mode === 'matchmaker') {
      loadMyPeopleTab();
    } else {
      loadIntroductionsTab();
    }
  });

  // --- Tab Bars ---
  document.querySelectorAll('.tab-bar').forEach(bar => {
    bar.addEventListener('click', e => {
      const item = e.target.closest('.tab-item');
      if (!item) return;
      const tabId = item.dataset.tab;

      bar.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      item.classList.add('active');

      const parent = bar.closest('.mode-content');
      parent.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      AppState.setTab(tabId);

      // Load tab data
      if (tabId === 'tab-introductions') loadIntroductionsTab();
      else if (tabId === 'tab-chats') loadChatTab();
      else if (tabId === 'tab-my') loadMyTab();
      else if (tabId === 'tab-my-people') loadMyPeopleTab();
      else if (tabId === 'tab-introduce') loadIntroduceTab();
      else if (tabId === 'tab-requests') loadRequestsTab();
      else if (tabId === 'tab-history') loadHistoryTab();
      else if (tabId === 'tab-mm-my') loadMatchmakerMyTab();
    });
  });

  // --- Notification Bell ---
  document.getElementById('btn-notifications')?.addEventListener('click', toggleNotifPanel);
})();

// --- Route after auth ---
function routeAfterAuth() {
  const profile = AppState.getProfile();

  if (!profile) {
    // New user — needs onboarding
    AppState.showScreen('screen-onboarding');
    initOnboarding();
    return;
  }

  // Check if profile is incomplete (no gender means onboarding not done)
  if (!profile.gender) {
    AppState.showScreen('screen-onboarding');
    initOnboarding();
    return;
  }

  if (profile.status === 'pending_reputation') {
    AppState.showScreen('screen-reputation-gate');
    loadReputationGate();
    return;
  }

  if (profile.status === 'pending') {
    AppState.showScreen('screen-reputation-gate');
    document.querySelector('.gate-container h2').textContent = '관리자 검토 중';
    document.querySelector('.gate-desc').textContent = '추천인의 평판이 작성되었습니다. 관리자 승인을 기다리고 있습니다.';
    document.getElementById('gate-status-text').textContent = '검토 중';
    loadReputationGate();
    return;
  }

  if (profile.status === 'rejected') {
    AppState.showScreen('screen-reputation-gate');
    document.querySelector('.gate-container h2').textContent = '가입이 승인되지 않았어요';
    document.querySelector('.gate-desc').textContent = '관리자에게 문의해주세요.';
    document.getElementById('gate-status-text').textContent = '거절됨';
    return;
  }

  // Approved — show main app
  AppState.showScreen('screen-main');
  initMainApp();
}

// --- Reputation Gate ---
async function loadReputationGate() {
  const profile = AppState.getProfile();
  if (!profile) return;

  if (profile.invited_by) {
    const { data: inviter } = await sb.from('applicants')
      .select('name')
      .eq('id', profile.invited_by)
      .maybeSingle();
    document.getElementById('gate-recommender').textContent = inviter?.name || '알 수 없음';
  }

  document.getElementById('gate-requested-at').textContent =
    new Date(profile.created_at).toLocaleDateString('ko-KR');

  // Check if reputation exists
  const { data: reps } = await sb.from('reputations')
    .select('id')
    .eq('target_id', profile.id);

  if (reps && reps.length > 0) {
    document.getElementById('gate-status-text').textContent = '평판 작성됨';
    document.getElementById('gate-status-text').style.background = '#D1FAE5';
    document.getElementById('gate-status-text').style.color = '#065F46';
  }

  // Subscribe to status changes (for auto-redirect when approved)
  const channel = sb.channel('my-status')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'applicants',
      filter: `id=eq.${profile.id}`
    }, async payload => {
      if (payload.new.status === 'approved') {
        await AppState.refreshProfile();
        AppState.showScreen('screen-main');
        initMainApp();
        showApprovedModal();
      } else if (payload.new.status === 'pending') {
        document.querySelector('.gate-container h2').textContent = '관리자 검토 중';
        document.querySelector('.gate-desc').textContent = '추천인의 평판이 작성되었습니다. 관리자 승인을 기다리고 있습니다.';
        document.getElementById('gate-status-text').textContent = '검토 중';
      }
    })
    .subscribe();
  AppState.subscribe('my-status', channel);
}

// --- Main App Init ---
async function initMainApp() {
  const profile = AppState.getProfile();

  // Set initial mode based on roles — 주선자 역할이 있으면 주선자 모드로 시작
  // (setMode 의 mode-change 이벤트보다 먼저 호출될 수 있어 mode-content 직접 활성화)
  const initialMode = profile.is_matchmaker ? 'matchmaker' : 'participant';
  AppState.setMode(initialMode, true);  // force — 이전 세션 모드와 같아도 강제 전환
  document.querySelector(`[data-mode="${initialMode}"]`).classList.add('active');
  document.querySelector(`[data-mode="${initialMode === 'matchmaker' ? 'participant' : 'matchmaker'}"]`).classList.remove('active');
  document.querySelectorAll('.mode-content').forEach(m => m.classList.remove('active'));
  document.getElementById(`mode-${initialMode}`).classList.add('active');
  if (initialMode === 'matchmaker' && typeof loadMyPeopleTab === 'function') loadMyPeopleTab();
  else if (initialMode === 'participant' && typeof loadIntroductionsTab === 'function') loadIntroductionsTab();

  // Hide mode toggle if user has only one role
  if (!profile.is_participant || !profile.is_matchmaker) {
    document.getElementById('mode-toggle').style.display = 'none';
  } else {
    document.getElementById('mode-toggle').style.display = '';
  }

  // Admin detection — 관리자는 바로 대시보드로
  const isAdmin = await AppState.checkAdmin();
  if (isAdmin) {
    showAdminDashboard();
    logEvent('app_open');
    return;
  }

  // Apply watermark
  if (profile.name && profile.phone) {
    applyWatermark(profile.name, profile.phone);
  }

  // Load initial tab data
  const mode = AppState.getMode();
  if (mode === 'participant') {
    loadIntroductionsTab();
  } else {
    loadMyPeopleTab();
  }
  loadMyTab();

  // Setup notifications
  loadNotifications();
  subscribeNotifications();

  // Setup Realtime subscriptions
  setupSubscriptions();

  // Update last_seen
  sb.from('applicants').update({ last_seen_at: new Date().toISOString() }).eq('user_id', profile.user_id).then(() => {});

  logEvent('app_open');
}

// --- Realtime Subscriptions ---
function setupSubscriptions() {
  const profile = AppState.getProfile();
  if (!profile) return;

  const mode = AppState.getMode();

  if (mode === 'participant') {
    const introChannel = sb.channel('my-introductions')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'introductions',
        filter: `person_a_id=eq.${profile.id}`,
      }, () => loadIntroductionsTab())
      .subscribe();
    AppState.subscribe('introductions-a', introChannel);

    const introChannelB = sb.channel('my-introductions-b')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'introductions',
        filter: `person_b_id=eq.${profile.id}`,
      }, () => loadIntroductionsTab())
      .subscribe();
    AppState.subscribe('introductions-b', introChannelB);

  } else if (mode === 'matchmaker') {
    const reqChannel = sb.channel('my-requests')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'introduction_requests',
      }, () => loadRequestsTab())
      .subscribe();
    AppState.subscribe('requests', reqChannel);
  }
}

// Re-setup subscriptions on mode change
document.addEventListener('mode-change', () => {
  AppState.unsubscribeAll();
  setupSubscriptions();
  subscribeNotifications();
});

// --- Auth Handlers ---
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) { toast('이메일과 비밀번호를 입력해주세요.'); return; }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    toast('로그인 실패: ' + error.message);
  }
}

async function handleSignup() {
  const code = document.getElementById('signup-invite').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const name = document.getElementById('signup-name').value.trim();
  const isParticipant = document.getElementById('signup-participant').checked;
  const isMatchmaker = document.getElementById('signup-matchmaker').checked;

  if (!code) { toast('초대 코드를 입력해주세요.'); return; }
  if (!email) { toast('이메일을 입력해주세요.'); return; }
  if (password.length < 6) { toast('비밀번호는 6자 이상이어야 합니다.'); return; }
  if (!name) { toast('이름을 입력해주세요.'); return; }
  if (!isParticipant && !isMatchmaker) { toast('역할을 하나 이상 선택해주세요.'); return; }

  // Supercode check (관리자 직접 가입용)
  const SUPERCODE_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'; // sha256('admin')
  let isSupercode = false;
  try {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(code));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    isSupercode = (hashHex === SUPERCODE_HASH);
  } catch {}

  // Pre-verify invite code (코드만 노출하지 않는 verify_invite_code RPC 사용)
  let inviterId = null;
  if (!isSupercode) {
    const { data: verifyData, error: verifyErr } = await sb.rpc('verify_invite_code', { p_code: code });
    if (verifyErr || !verifyData || verifyData.length === 0) {
      toast('유효하지 않은 초대 코드입니다.');
      return;
    }
    inviterId = verifyData[0].created_by;
  }

  // Sign up — auth user 생성
  const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
  if (authErr) { toast('가입 실패: ' + authErr.message); return; }

  // Create applicant + consume invite code in one atomic transaction (RPC)
  const { data: newApplicantId, error: signupErr } = await sb.rpc('signup_with_invite', {
    p_invite_code: isSupercode ? null : code,
    p_name: name,
    p_email: email,
    p_is_participant: isParticipant,
    p_is_matchmaker: isMatchmaker,
    p_is_supercode: isSupercode,
  });

  if (signupErr) {
    console.error('[handleSignup] signup_with_invite failed:', signupErr);
    toast('가입 실패: ' + (signupErr.message || '코드가 이미 사용되었거나 유효하지 않아요.'));
    return;
  }

  // Notify inviter to write reputation
  if (inviterId) {
    const { error: notifErr } = await sb.rpc('create_notification', {
      p_user_id: inviterId,
      p_type: 'reputation_request',
      p_title: `${name}님의 평판을 작성해주세요`,
      p_body: '초대한 분의 가입을 완료하려면 평판 작성이 필요해요.',
      p_data: { target_id: newApplicantId }
    });
    if (notifErr) console.error('[handleSignup] notify inviter failed:', notifErr);
  }

  if (isSupercode) {
    const { error: adminErr } = await sb.from('admin_users').insert({ user_id: authData.user.id });
    if (adminErr) console.error('[handleSignup] admin_users insert failed:', adminErr);
  }

  toast(isSupercode ? '가입 완료!' : '가입 완료! 추천인의 평판 작성을 기다려주세요.');
  logEvent('signup', { role: isParticipant && isMatchmaker ? 'both' : isMatchmaker ? 'matchmaker' : 'participant' });
}
