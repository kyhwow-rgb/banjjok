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
  });

  // --- Tab Bars ---
  document.querySelectorAll('.tab-bar').forEach(bar => {
    bar.addEventListener('click', e => {
      const item = e.target.closest('.tab-item');
      if (!item) return;
      const tabId = item.dataset.tab;

      // Update tab bar UI
      bar.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      item.classList.add('active');

      // Show tab content
      const parent = bar.closest('.mode-content');
      parent.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      AppState.setTab(tabId);
    });
  });
})();

// --- Route after auth ---
function routeAfterAuth() {
  const profile = AppState.getProfile();

  if (!profile) {
    // New user — needs profile setup (TODO: onboarding flow)
    AppState.showScreen('screen-main');
    return;
  }

  if (profile.status === 'pending_reputation') {
    AppState.showScreen('screen-reputation-gate');
    loadReputationGate();
    return;
  }

  if (profile.status === 'pending') {
    // Waiting for admin approval
    AppState.showScreen('screen-reputation-gate');
    document.querySelector('.gate-container h2').textContent = '관리자 검토 중';
    document.querySelector('.gate-desc').textContent = '추천인의 평판이 작성되었습니다. 관리자 승인을 기다리고 있습니다.';
    return;
  }

  // Approved — show main app
  AppState.showScreen('screen-main');
  initMainApp();
}

// --- Reputation Gate ---
async function loadReputationGate() {
  // TODO: Load recommender info, requested date, current status
}

// --- Main App Init ---
function initMainApp() {
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
  }

  // Apply watermark
  if (profile.name && profile.phone) {
    applyWatermark(profile.name, profile.phone);
  }

  // Setup Realtime subscriptions for current mode
  setupSubscriptions();
}

// --- Realtime Subscriptions ---
function setupSubscriptions() {
  const profile = AppState.getProfile();
  if (!profile) return;

  const mode = AppState.getMode();

  if (mode === 'participant') {
    // Subscribe to introductions where I'm a participant
    const introChannel = sb.channel('my-introductions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'introductions',
        filter: `person_a_id=eq.${profile.id}`,
      }, payload => {
        // TODO: handle new/updated introductions
        console.log('Introduction update:', payload);
      })
      .subscribe();
    AppState.subscribe('introductions-a', introChannel);

    const introChannelB = sb.channel('my-introductions-b')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'introductions',
        filter: `person_b_id=eq.${profile.id}`,
      }, payload => {
        console.log('Introduction update (B):', payload);
      })
      .subscribe();
    AppState.subscribe('introductions-b', introChannelB);

  } else if (mode === 'matchmaker') {
    // Subscribe to introduction requests targeting me
    const reqChannel = sb.channel('my-requests')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'introduction_requests',
        filter: `responder_matchmaker_id=eq.${profile.id}`,
      }, payload => {
        // TODO: handle new request
        console.log('New request:', payload);
      })
      .subscribe();
    AppState.subscribe('requests', reqChannel);
  }
}

// Re-setup subscriptions on mode change
document.addEventListener('mode-change', () => {
  setupSubscriptions();
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

  if (!code) { toast('초대 코드를 입력해주세요.'); return; }
  if (!email) { toast('이메일을 입력해주세요.'); return; }
  if (password.length < 6) { toast('비밀번호는 6자 이상이어야 합니다.'); return; }
  if (!name) { toast('이름을 입력해주세요.'); return; }

  // Verify invite code
  const { data: inviteData, error: inviteErr } = await sb
    .from('applicants')
    .select('id, name')
    .eq('invite_code', code)
    .maybeSingle();

  if (inviteErr || !inviteData) {
    toast('유효하지 않은 초대 코드입니다.');
    return;
  }

  // Sign up
  const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
  if (authErr) { toast('가입 실패: ' + authErr.message); return; }

  // Create applicant record
  const { error: profileErr } = await sb.from('applicants').insert({
    user_id: authData.user.id,
    name,
    email,
    invited_by: inviteData.id,
    status: 'pending_reputation',
    is_participant: true,
    is_matchmaker: false,
  });

  if (profileErr) { toast('프로필 생성 실패'); return; }

  // TODO: Notify inviter to write reputation
  toast('가입 완료! 추천인의 평판 작성을 기다려주세요.');
}
