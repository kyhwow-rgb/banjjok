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
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="readNotif('${n.id}')">
      <div class="notif-icon"><i class="fa-solid ${NOTIF_ICONS[n.type] || 'fa-bell'}"></i></div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-text">${esc(n.body)}</div>` : ''}
        <div class="notif-time">${formatTimeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
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
