/* ==========================================================================
   반쪽 v2 — Notifications
   ========================================================================== */

let _notifications = [];

async function loadNotifications() {
  const profile = AppState.getProfile();
  if (!profile) return;
  const { data } = await sb.from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(30);
  _notifications = data || [];
  renderNotifBadge();
}

function renderNotifBadge() {
  const unread = _notifications.filter(n => !n.is_read).length;
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.toggle('hidden', unread === 0);
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (_notifications.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:32px;"><p>알림이 없어요.</p></div>';
    return;
  }

  const NOTIF_ICONS = {
    'introduction_received': 'fa-envelope',
    'match_created': 'fa-heart',
    'message': 'fa-comment',
    'reputation_written': 'fa-star',
    'reputation_request': 'fa-pen',
    'request_received': 'fa-inbox',
    'admin_approved': 'fa-check-circle',
  };

  list.innerHTML = _notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="handleNotifClick('${n.id}')">
      <div class="notif-icon"><i class="fa-solid ${NOTIF_ICONS[n.type] || 'fa-bell'}"></i></div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-text">${esc(n.body)}</div>` : ''}
        <div class="notif-time">${formatTimeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

async function handleNotifClick(id) {
  const n = _notifications.find(x => x.id === id);
  if (!n) return;

  // 읽음 처리
  await readNotif(id);
  closeNotifPanel();

  const data = n.data || {};
  const type = n.type;

  try {
    // 평판 작성 요청 → 주선자 모드 → 내 사람들 → 평판 모달
    if (type === 'reputation_request' && data.target_id) {
      AppState.setMode('matchmaker');
      document.querySelector('.mode-btn[data-mode=matchmaker]')?.classList.add('active');
      document.querySelector('.mode-btn[data-mode=participant]')?.classList.remove('active');
      switchToTab('tab-my-people');
      await new Promise(r => setTimeout(r, 400));
      const { data: target } = await sb.from('applicants').select('id, name').eq('id', data.target_id).maybeSingle();
      if (target) openReputationModal(target.id, target.name);
      return;
    }

    // 매칭 성사 → 참가자 모드 → 대화 → 해당 채팅방
    if (type === 'match_created' && data.match_id) {
      AppState.setMode('participant');
      document.querySelector('.mode-btn[data-mode=participant]')?.classList.add('active');
      document.querySelector('.mode-btn[data-mode=matchmaker]')?.classList.remove('active');
      switchToTab('tab-chats');
      await new Promise(r => setTimeout(r, 500));
      if (typeof openChatRoom === 'function') openChatRoom(data.match_id);
      return;
    }

    // 새 메시지 → 대화 탭 → 해당 채팅방
    if (type === 'message' && data.match_id) {
      AppState.setMode('participant');
      switchToTab('tab-chats');
      await new Promise(r => setTimeout(r, 400));
      if (typeof openChatRoom === 'function') openChatRoom(data.match_id);
      return;
    }

    // 소개 응답 도착 → 참가자 모드 → 소개 탭
    if (type === 'introduction_received') {
      AppState.setMode('participant');
      switchToTab('tab-introductions');
      return;
    }

    // 가입 자동 승인 → 환영 팝업 + 메인 화면
    if (type === 'approved') {
      AppState.setMode('participant');
      switchToTab('tab-introductions');
      if (typeof showApprovedModal === 'function') showApprovedModal();
      return;
    }

    // 주선자 요청 도착 → 주선자 모드 → 요청함
    if (type === 'request_received') {
      AppState.setMode('matchmaker');
      switchToTab('tab-requests');
      return;
    }

    // 주선자 ↔ 참가자 1:1 메시지 → 채팅 모달 자동 오픈
    if (type === 'mm_chat_message' && data.partner_id) {
      const profile = AppState.getProfile();
      // role: 받은 사람이 주선자면 본인은 'matchmaker', 참가자면 'participant'
      const myRole = profile?.is_matchmaker ? 'matchmaker' : 'participant';
      // data.role 값이 있으면 더 정확한 판단 가능
      const role = data.role === 'participant_to_matchmaker' ? 'matchmaker' : (data.role === 'matchmaker_to_participant' ? 'participant' : myRole);
      if (typeof openMmChat === 'function') openMmChat(data.partner_id, role);
      return;
    }
  } catch (e) {
    console.error('[handleNotifClick] navigation error:', e);
  }
}

function switchToTab(tabId) {
  // 모든 tab-bar 에서 활성 상태 토글
  document.querySelectorAll('.tab-bar').forEach(bar => {
    const items = bar.querySelectorAll('.tab-item');
    let matched = false;
    items.forEach(item => {
      if (item.dataset.tab === tabId) {
        item.classList.add('active');
        matched = true;
      } else {
        item.classList.remove('active');
      }
    });
    if (matched) {
      const parent = bar.closest('.mode-content');
      parent?.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(tabId)?.classList.add('active');
    }
  });
  AppState.setTab(tabId);
  // Trigger tab loader
  if (tabId === 'tab-introductions') loadIntroductionsTab?.();
  else if (tabId === 'tab-chats') loadChatTab?.();
  else if (tabId === 'tab-my') loadMyTab?.();
  else if (tabId === 'tab-my-people') loadMyPeopleTab?.();
  else if (tabId === 'tab-introduce') loadIntroduceTab?.();
  else if (tabId === 'tab-requests') loadRequestsTab?.();
  else if (tabId === 'tab-history') loadHistoryTab?.();
  else if (tabId === 'tab-mm-my') loadMatchmakerMyTab?.();
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const backdrop = document.getElementById('notif-backdrop');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeNotifPanel();
  } else {
    renderNotifList();
    panel.classList.add('open');
    backdrop.classList.add('open');
  }
}

function closeNotifPanel() {
  document.getElementById('notif-panel').classList.remove('open');
  document.getElementById('notif-backdrop').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('notif-panel')?.classList.contains('open')) {
    closeNotifPanel();
  }
});

document.addEventListener('tab-change', closeNotifPanel);
document.addEventListener('mode-change', closeNotifPanel);

async function readNotif(id) {
  await sb.from('notifications').update({ is_read: true }).eq('id', id);
  const n = _notifications.find(n => n.id === id);
  if (n) n.is_read = true;
  renderNotifBadge();
  renderNotifList();
}

async function markAllRead() {
  const profile = AppState.getProfile();
  if (!profile) return;
  const unreadIds = _notifications.filter(n => !n.is_read).map(n => n.id);
  if (unreadIds.length === 0) return;
  await sb.from('notifications').update({ is_read: true }).in('id', unreadIds);
  _notifications.forEach(n => n.is_read = true);
  renderNotifBadge();
  renderNotifList();
  toast('모두 읽음 처리했어요.');
}

function subscribeNotifications() {
  const profile = AppState.getProfile();
  if (!profile) return;
  const channel = sb.channel('my-notifications')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${profile.id}`
    }, payload => {
      _notifications.unshift(payload.new);
      renderNotifBadge();
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(payload.new.title || '반쪽', { body: payload.new.body || '' });
      }
    })
    .subscribe();
  AppState.subscribe('notifications', channel);
}
