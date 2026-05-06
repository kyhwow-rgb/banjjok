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
        toast('가입이 승인되었어요!');
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

  // Set initial mode based on roles
  if (profile.is_matchmaker && !profile.is_participant) {
    AppState.setMode('matchmaker');
    document.querySelector('[data-mode="matchmaker"]').classList.add('active');
    document.querySelector('[data-mode="participant"]').classList.remove('active');
  }

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

  let inviteData = null;
  if (!isSupercode) {
    // Verify invite code
    const { data, error: inviteErr } = await sb
      .from('invite_codes')
      .select('id, code, created_by, is_used')
      .eq('code', code)
      .eq('is_used', false)
      .maybeSingle();

    if (inviteErr || !data) {
      toast('유효하지 않은 초대 코드입니다.');
      return;
    }
    inviteData = data;
  }

  // Sign up
  const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
  if (authErr) { toast('가입 실패: ' + authErr.message); return; }

  // Create applicant record
  const { error: profileErr } = await sb.from('applicants').insert({
    user_id: authData.user.id,
    name,
    email,
    invited_by: inviteData?.created_by || null,
    status: isSupercode ? 'approved' : 'pending_reputation',
    is_participant: isParticipant,
    is_matchmaker: isMatchmaker,
  });

  if (profileErr) { toast('프로필 생성 실패'); return; }

  if (inviteData) {
    // Mark invite code as used
    const { data: newApplicant } = await sb.from('applicants').select('id').eq('user_id', authData.user.id).single();
    await sb.from('invite_codes').update({
      is_used: true,
      used_by: newApplicant?.id,
      used_at: new Date().toISOString(),
    }).eq('id', inviteData.id);

    // Notify inviter to write reputation
    if (inviteData.created_by) {
      await sb.rpc('create_notification', {
        p_user_id: inviteData.created_by,
        p_type: 'reputation_request',
        p_title: `${name}님의 평판을 작성해주세요`,
        p_body: '초대한 분의 가입을 완료하려면 평판 작성이 필요해요.',
        p_data: { target_id: newApplicant?.id }
      });
    }
  }

  if (isSupercode) {
    // 슈퍼코드로 가입한 경우 admin_users에도 등록
    const { data: newAdmin } = await sb.from('applicants').select('id').eq('user_id', authData.user.id).single();
    if (newAdmin) {
      await sb.from('admin_users').insert({ user_id: authData.user.id }).then(() => {}, () => {});
    }
  }

  toast('가입 완료! 추천인의 평판 작성을 기다려주세요.');
  logEvent('signup', { role: isParticipant && isMatchmaker ? 'both' : isMatchmaker ? 'matchmaker' : 'participant' });
}
