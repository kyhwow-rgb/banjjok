/* ==========================================================================
   반쪽 v2 — Chat
   ========================================================================== */

let _chatRooms = [];
let _currentMatchId = null;
let _chatChannel = null;
let _chatSendThrottle = false;

async function loadChatTab() {
  const profile = AppState.getProfile();
  if (!profile) return;

  const { data: matches } = await sb.from('matches')
    .select('*, applicant_a:applicant_a_id(id, name, photo_url, photos, gender), applicant_b:applicant_b_id(id, name, photo_url, photos, gender)')
    .or(`applicant_a_id.eq.${profile.id},applicant_b_id.eq.${profile.id}`)
    .order('created_at', { ascending: false });

  const emptyEl = document.getElementById('chat-empty');
  const listEl = document.getElementById('chat-list');

  if (!matches || matches.length === 0) {
    emptyEl?.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl?.classList.add('hidden');

  // Get last messages for each match
  const matchIds = matches.map(m => m.id);
  const { data: lastMsgs } = await sb.from('chat_messages')
    .select('match_id, content, created_at, sender_id')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false });

  const lastMsgMap = {};
  (lastMsgs || []).forEach(msg => {
    if (!lastMsgMap[msg.match_id]) lastMsgMap[msg.match_id] = msg;
  });

  _chatRooms = matches.map(m => {
    const partner = m.applicant_a_id === profile.id ? m.applicant_b : m.applicant_a;
    return { matchId: m.id, status: m.status, partner, lastMsg: lastMsgMap[m.id] };
  });

  renderChatRoomList();
}

function renderChatRoomList() {
  const listEl = document.getElementById('chat-list');
  if (!listEl) return;

  listEl.innerHTML = _chatRooms.map(room => {
    const partner = room.partner || {};
    const photoSrc = (partner.photos && partner.photos[0]) || partner.photo_url || '';
    const lastMsg = room.lastMsg;

    return `
      <div class="chat-room-item" onclick="openChatRoom('${room.matchId}')">
        ${photoSrc ? `<img class="chat-room-avatar" src="${esc(photoSrc)}" alt="">` : `<div class="chat-room-avatar" style="display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fa-solid fa-user"></i></div>`}
        <div class="chat-room-info">
          <div class="chat-room-name">${esc(partner.name || '알 수 없음')} ${room.status === 'ended' ? '<span style="font-size:11px;color:var(--muted);">(종료)</span>' : ''}</div>
          <div class="chat-room-last-msg">${lastMsg ? esc(lastMsg.content) : '대화를 시작해보세요!'}</div>
        </div>
        <div class="chat-room-meta">
          ${lastMsg ? `<div class="chat-room-time">${formatTimeAgo(lastMsg.created_at)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function openChatRoom(matchId) {
  _currentMatchId = matchId;
  const room = _chatRooms.find(r => r.matchId === matchId);
  if (!room) return;

  // Show chat room view
  document.getElementById('chat-room-view').classList.remove('hidden');
  document.getElementById('chat-room-partner-info').textContent = room.partner?.name || '';

  // Show/hide input bar based on match status
  const inputBar = document.getElementById('chat-input-bar');
  const endedNotice = document.getElementById('chat-ended-notice');
  if (room.status === 'ended') {
    inputBar.classList.add('hidden');
    endedNotice.classList.remove('hidden');
  } else {
    inputBar.classList.remove('hidden');
    endedNotice.classList.add('hidden');
  }

  // Load messages
  const { data: messages } = await sb.from('chat_messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  renderChatMessages(messages || []);

  // Subscribe to realtime
  if (_chatChannel) {
    _chatChannel.unsubscribe();
  }
  _chatChannel = sb.channel(`chat-${matchId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages',
      filter: `match_id=eq.${matchId}`
    }, payload => {
      const profile = AppState.getProfile();
      if (payload.new.sender_id !== profile.id) {
        appendChatBubble(payload.new);
      }
    })
    .subscribe();

  // Mark as read
  markChatAsRead(matchId);

  // Auto-scroll
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function renderChatMessages(messages) {
  const profile = AppState.getProfile();
  const container = document.getElementById('chat-messages');

  container.innerHTML = messages.map(msg => {
    const isMine = msg.sender_id === profile.id;
    return `
      <div class="chat-bubble ${isMine ? 'chat-mine' : 'chat-theirs'}">
        ${esc(msg.content)}
        <div class="chat-time">${formatChatTime(msg.created_at)}</div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function appendChatBubble(msg) {
  const profile = AppState.getProfile();
  const isMine = msg.sender_id === profile.id;
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-bubble ${isMine ? 'chat-mine' : 'chat-theirs'}`;
  div.innerHTML = `${esc(msg.content)}<div class="chat-time">${formatChatTime(msg.created_at)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  if (_chatSendThrottle) return;
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || !_currentMatchId) return;
  if (content.length > 500) { toast('메시지는 500자 이내로 입력해주세요.'); return; }

  _chatSendThrottle = true;
  setTimeout(() => _chatSendThrottle = false, 1000);

  input.value = '';
  input.style.height = 'auto';

  // Optimistic UI
  const profile = AppState.getProfile();
  appendChatBubble({ sender_id: profile.id, content, created_at: new Date().toISOString() });

  const { error } = await sb.rpc('send_chat_message', {
    p_match_id: _currentMatchId,
    p_content: content
  });

  if (error) {
    toast('메시지 전송 실패');
    console.error('Chat send error:', error);
  }
}

function closeChatRoom() {
  _currentMatchId = null;
  if (_chatChannel) {
    _chatChannel.unsubscribe();
    _chatChannel = null;
  }
  document.getElementById('chat-room-view').classList.add('hidden');
}

async function markChatAsRead(matchId) {
  const profile = AppState.getProfile();
  await sb.from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .neq('sender_id', profile.id)
    .is('read_at', null);
}

function formatChatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// Enter key to send
document.addEventListener('keydown', e => {
  if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
