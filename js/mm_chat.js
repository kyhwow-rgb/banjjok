/* ==========================================================================
   반쪽 v2 — Matchmaker ↔ Participant 1:1 chat
   ========================================================================== */

let _mmChatPartnerId = null;
let _mmChatRole = null; // 'matchmaker' or 'participant'
let _mmChatChannel = null;

async function openMmChat(partnerId, myRole) {
  _mmChatPartnerId = partnerId;
  _mmChatRole = myRole; // myRole: 'matchmaker' or 'participant' — 본인 역할

  const profile = AppState.getProfile();
  if (!profile) return;

  // 상대 정보 표시
  const { data: partner, error: partnerError } = await sb.from('applicants')
    .select('id, name, photo_url, photos')
    .eq('id', partnerId).maybeSingle();
  if (partnerError) {
    console.error('[openMmChat] partner load failed:', partnerError);
    toast('상대 정보를 불러오지 못했어요.');
    return;
  }
  const photo = (partner?.photos && partner.photos[0]) || partner?.photo_url || '';
  document.getElementById('mm-chat-partner-info').innerHTML = `
    ${photo ? `<img src="${esc(photo)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;">` : ''}
    ${esc(partner?.name || '상대')}
    <span style="font-size:12px;color:var(--muted);font-weight:400;">· ${myRole === 'matchmaker' ? '내 인맥' : '내 주선자'}</span>
  `;

  document.getElementById('mm-chat-overlay').classList.add('open');

  await loadMmMessages();
  subscribeMmChat();
}

function closeMmChat() {
  if (_mmChatChannel) {
    _mmChatChannel.unsubscribe();
    _mmChatChannel = null;
  }
  _mmChatPartnerId = null;
  document.getElementById('mm-chat-overlay').classList.remove('open');
}

function getPair(profile) {
  // matchmaker_id, participant_id 결정
  if (_mmChatRole === 'matchmaker') {
    return { matchmaker_id: profile.id, participant_id: _mmChatPartnerId };
  } else {
    return { matchmaker_id: _mmChatPartnerId, participant_id: profile.id };
  }
}

async function loadMmMessages() {
  const profile = AppState.getProfile();
  const { matchmaker_id, participant_id } = getPair(profile);
  const { data, error } = await sb.from('mm_messages')
    .select('*')
    .eq('matchmaker_id', matchmaker_id)
    .eq('participant_id', participant_id)
    .order('created_at', { ascending: true });

  if (error) { console.error('mm chat load error:', error); return; }
  renderMmMessages(data || []);
  // 안 읽은 메시지 읽음 처리
  const unread = (data || []).filter(m => m.sender_id !== profile.id && !m.read_at);
  if (unread.length > 0) {
    const { error: readError } = await sb.from('mm_messages').update({ read_at: new Date().toISOString() }).in('id', unread.map(m => m.id));
    if (readError) console.error('[loadMmMessages] mark read failed:', readError);
  }
}

function renderMmMessages(messages) {
  const profile = AppState.getProfile();
  const wrap = document.getElementById('mm-chat-messages');
  if (!messages || messages.length === 0) {
    wrap.innerHTML = `<p style="text-align:center;color:var(--muted);font-size:13px;padding:32px 16px;line-height:1.6;">
      아직 대화가 없어요.<br>
      ${_mmChatRole === 'participant' ? '주선자에게 어떤 분을 소개받고 싶은지 편하게 얘기해보세요!' : '인맥에게 안부나 소개 진행 상황을 전해보세요.'}
    </p>`;
    return;
  }
  wrap.innerHTML = messages.map(m => {
    const mine = m.sender_id === profile.id;
    const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return `
      <div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:8px;">
        <div style="max-width:75%;background:${mine ? 'var(--primary)' : '#fff'};color:${mine ? '#fff' : 'var(--primary)'};padding:8px 12px;border-radius:14px;font-size:13.5px;line-height:1.4;">
          ${esc(m.content)}
          <div style="font-size:10px;opacity:.6;margin-top:2px;text-align:right;">${time}</div>
        </div>
      </div>`;
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendMmMessage() {
  const profile = AppState.getProfile();
  const input = document.getElementById('mm-chat-input');
  const content = input.value.trim();
  if (!content) return;
  const { matchmaker_id, participant_id } = getPair(profile);

  const { error } = await sb.from('mm_messages').insert({
    matchmaker_id, participant_id, sender_id: profile.id, content
  });
  if (error) { toast('전송 실패: ' + error.message); return; }
  input.value = '';
  // 상대에게 알림
  const { error: notifError } = await sb.rpc('create_notification', {
    p_user_id: _mmChatPartnerId,
    p_type: 'mm_chat_message',
    p_title: `${profile.name}님의 메시지`,
    p_body: content.length > 40 ? content.substring(0, 40) + '...' : content,
    p_data: { partner_id: profile.id, role: _mmChatRole === 'matchmaker' ? 'matchmaker_to_participant' : 'participant_to_matchmaker' }
  });
  if (notifError) console.error('[sendMmMessage] notification failed:', notifError);
  await loadMmMessages();
}

function subscribeMmChat() {
  if (_mmChatChannel) _mmChatChannel.unsubscribe();
  const profile = AppState.getProfile();
  const { matchmaker_id, participant_id } = getPair(profile);
  _mmChatChannel = sb.channel(`mm-chat-${matchmaker_id}-${participant_id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'mm_messages',
      filter: `matchmaker_id=eq.${matchmaker_id}`
    }, (payload) => {
      if (payload.new.participant_id === participant_id) loadMmMessages();
    })
    .subscribe();
}
