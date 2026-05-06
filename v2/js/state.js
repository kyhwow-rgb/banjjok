/* ==========================================================================
   반쪽 v2 — AppState Singleton
   Centralized state management with Realtime subscription lifecycle.
   ========================================================================== */

const AppState = (() => {
  let currentUser = null;
  let currentProfile = null;
  let currentMode = 'participant'; // 'participant' | 'matchmaker'
  let currentTab = null;
  const subscriptions = new Map(); // key -> RealtimeChannel

  // --- State Getters ---
  function getUser() { return currentUser; }
  function getProfile() { return currentProfile; }
  function getMode() { return currentMode; }

  // --- Auth ---
  async function setUser(user) {
    currentUser = user;
    if (user) {
      const { data } = await sb.from('applicants').select('*').eq('user_id', user.id).maybeSingle();
      currentProfile = data;
    } else {
      currentProfile = null;
    }
  }

  // --- Mode Toggle ---
  function setMode(mode) {
    if (mode === currentMode) return;
    // Cleanup all subscriptions from previous mode
    unsubscribeAll();
    currentMode = mode;
    // Notify UI
    document.dispatchEvent(new CustomEvent('mode-change', { detail: { mode } }));
  }

  // --- Tab ---
  function setTab(tabId) {
    currentTab = tabId;
    document.dispatchEvent(new CustomEvent('tab-change', { detail: { tab: tabId } }));
  }
  function getTab() { return currentTab; }

  // --- Realtime Subscriptions ---
  function subscribe(key, channel) {
    // Remove existing subscription with same key
    if (subscriptions.has(key)) {
      subscriptions.get(key).unsubscribe();
    }
    subscriptions.set(key, channel);
  }

  function unsubscribe(key) {
    if (subscriptions.has(key)) {
      subscriptions.get(key).unsubscribe();
      subscriptions.delete(key);
    }
  }

  function unsubscribeAll() {
    for (const [key, channel] of subscriptions) {
      channel.unsubscribe();
    }
    subscriptions.clear();
  }

  // --- Screen Navigation ---
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  // --- Admin ---
  let isAdmin = false;

  async function refreshProfile() {
    if (!currentUser) return;
    const { data } = await sb.from('applicants').select('*').eq('user_id', currentUser.id).maybeSingle();
    currentProfile = data;
  }

  async function checkAdmin() {
    if (!currentUser) { isAdmin = false; return false; }
    const { data } = await sb.from('admin_users').select('user_id').eq('user_id', currentUser.id).maybeSingle();
    isAdmin = !!data;
    return isAdmin;
  }

  function getIsAdmin() { return isAdmin; }

  return {
    getUser, getProfile, getMode, getTab, getIsAdmin,
    setUser, setMode, setTab,
    refreshProfile, checkAdmin,
    subscribe, unsubscribe, unsubscribeAll,
    showScreen,
  };
})();
