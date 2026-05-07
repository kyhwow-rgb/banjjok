/* ==========================================================================
   반쪽 v2 — Admin Dashboard
   ========================================================================== */

let _adminFilter = 'all';

function showAdminDashboard() {
  AppState.showScreen('screen-admin');
  loadAdminHome();
}

function backToApp() {
  AppState.showScreen('screen-main');
}

async function adminLogout() {
  try {
    AppState.unsubscribeAll();
    await sb.auth.signOut();
  } catch (e) { console.error('Logout error:', e); }
  // signOut 후 onAuthStateChange가 screen-auth로 전환하지만
  // 혹시 안 되면 강제 전환 + 페이지 리로드
  window.location.reload();
}

// 버튼 이벤트 바인딩 (onclick 대신 addEventListener로 확실하게)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-admin-logout')?.addEventListener('click', adminLogout);
});
// DOMContentLoaded 이미 지난 경우 대비
document.getElementById('btn-admin-logout')?.addEventListener('click', adminLogout);

// Admin tab switching
document.getElementById('admin-tabs')?.addEventListener('click', e => {
  const item = e.target.closest('.tab-item');
  if (!item) return;
  const tabId = item.dataset.tab;
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#admin-tabs .tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  item.classList.add('active');

  if (tabId === 'admin-home') loadAdminHome();
  if (tabId === 'admin-applicants') loadAdminApplicants();
  if (tabId === 'admin-matches') loadAdminMatches();
  if (tabId === 'admin-reports') loadAdminReports();
});

// --- Admin Home ---
async function loadAdminHome() {
  const { data: metrics, error } = await sb.rpc('admin_health_metrics');
  if (error) { console.error('Admin metrics error:', error); return; }

  const m = metrics || {};
  document.getElementById('admin-health-metrics').innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">대시보드</h3>
    <div class="admin-metric-grid">
      <div class="admin-metric-card">
        <div class="admin-metric-value">${m.total_users || 0}</div>
        <div class="admin-metric-label">전체 회원</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value">${m.approved || 0}</div>
        <div class="admin-metric-label">승인됨</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value" style="color:var(--accent);">${m.pending || 0}</div>
        <div class="admin-metric-label">승인 대기</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value" style="color:var(--warning);">${m.pending_reputation || 0}</div>
        <div class="admin-metric-label">평판 대기</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value">${m.active_matches || 0}</div>
        <div class="admin-metric-label">활성 매칭</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value">${m.total_messages || 0}</div>
        <div class="admin-metric-label">총 메시지</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value">${m.male_count || 0}:<span>${m.female_count || 0}</span></div>
        <div class="admin-metric-label">남:여 비율</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-value" style="color:var(--error);">${m.pending_reports || 0}</div>
        <div class="admin-metric-label">미처리 신고</div>
      </div>
    </div>
    ${m.escalation_count > 0 ? `
      <div class="card" style="border-color:var(--warning);margin-bottom:12px;">
        <div style="font-weight:600;color:var(--warning);"><i class="fa-solid fa-triangle-exclamation"></i> 에스컬레이션 필요</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;">${m.escalation_count}명이 7일 이상 평판을 받지 못했어요.</div>
        <button class="btn-ghost" style="margin-top:8px;" onclick="document.querySelector('[data-tab=admin-applicants]').click();filterAdminApplicants('pending_reputation');">확인하기</button>
      </div>
    ` : ''}
  `;
}

// --- Admin Applicants ---
async function loadAdminApplicants(filter) {
  _adminFilter = filter || _adminFilter || 'all';
  const status = _adminFilter === 'all' ? null : _adminFilter;

  const { data: applicants, error } = await sb.rpc('admin_list_applicants', { p_status: status });
  if (error) { console.error('Admin list error:', error); return; }

  const listEl = document.getElementById('admin-applicant-list');
  if (!applicants || applicants.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:32px;"><p>해당하는 신청자가 없어요.</p></div>';
    return;
  }

  listEl.innerHTML = applicants.map(a => {
    const age = calcAge(a.birth_date);
    const photoSrc = (a.photos && a.photos[0]) || a.photo_url || '';
    const statusLabel = a.status === 'approved' ? '승인됨' : a.status === 'pending' ? '승인 대기' : a.status === 'pending_reputation' ? '평판 대기' : a.status === 'rejected' ? '거절됨' : a.status;

    return `
      <div class="admin-applicant-card" onclick="openAdminDetail('${a.id}')">
        ${photoSrc ? `<img class="admin-avatar" src="${esc(photoSrc)}" alt="">` : `<div class="admin-avatar" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;"><i class="fa-solid fa-user"></i></div>`}
        <div class="admin-card-info">
          <div class="admin-card-name">${esc(a.name)} ${a.gender === 'male' ? '♂' : a.gender === 'female' ? '♀' : ''} ${age ? `(${age}세)` : ''}</div>
          <div class="admin-card-detail">${esc(a.job || '')} · ${esc(a.location || '')} · ${statusLabel}</div>
        </div>
        <div class="admin-card-actions">
          ${a.status === 'pending' ? `
            <button class="admin-btn-approve" onclick="event.stopPropagation();adminApprove('${a.id}')">승인</button>
            <button class="admin-btn-reject" onclick="event.stopPropagation();adminReject('${a.id}')">거절</button>
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

function filterAdminApplicants(filter, btn) {
  _adminFilter = filter;
  document.querySelectorAll('#admin-filters .chip').forEach(c => c.classList.remove('on'));
  if (btn) btn.classList.add('on');
  loadAdminApplicants(filter);
}

async function openAdminDetail(applicantId) {
  // Reuse participant's openProfileModal
  await openProfileModal(applicantId);
}

async function adminApprove(applicantId) {
  if (!confirm('이 신청자를 승인하시겠어요?')) return;
  const { error } = await sb.rpc('admin_update_status', { p_applicant_id: applicantId, p_status: 'approved' });
  if (error) { toast('승인 실패: ' + error.message); return; }
  toast('승인되었어요.');
  loadAdminApplicants();
}

async function adminReject(applicantId) {
  if (!confirm('이 신청자를 거절하시겠어요?')) return;
  const { error } = await sb.rpc('admin_update_status', { p_applicant_id: applicantId, p_status: 'rejected' });
  if (error) { toast('거절 실패: ' + error.message); return; }
  toast('거절되었어요.');
  loadAdminApplicants();
}

// --- Admin Matches ---
async function loadAdminMatches() {
  const { data: matches, error } = await sb.rpc('admin_list_matches');
  if (error) { console.error('Admin matches error:', error); return; }

  const listEl = document.getElementById('admin-match-list');
  if (!matches || matches.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:32px;"><p>매칭이 없어요.</p></div>';
    return;
  }

  listEl.innerHTML = matches.map(m => `
    <div class="history-card">
      <div class="history-names">${esc(m.a_name)} ↔ ${esc(m.b_name)}</div>
      <span class="intro-status-badge ${m.status === 'active' ? 'matched' : 'expired'}">${m.status === 'active' ? '활성' : '종료'}</span>
      <div class="history-date">${formatTimeAgo(m.created_at)}</div>
    </div>
  `).join('');
}

// --- Admin Reports ---
async function loadAdminReports() {
  const { data: reports, error } = await sb.rpc('admin_list_reports');
  if (error) { console.error('Admin reports error:', error); return; }

  const listEl = document.getElementById('admin-report-list');
  if (!reports || reports.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:32px;"><p>신고가 없어요.</p></div>';
    return;
  }

  listEl.innerHTML = reports.map(r => `
    <div class="request-card">
      <div class="request-card-header">
        <span style="font-size:13px;font-weight:600;">${esc(r.reporter_name)} → ${esc(r.target_name)}</span>
        <span class="intro-status-badge ${r.status === 'pending' ? 'pending' : 'expired'}">${r.status === 'pending' ? '미처리' : '처리됨'}</span>
      </div>
      <div style="font-size:13px;margin-top:6px;">${esc(r.reason)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">${formatTimeAgo(r.created_at)}</div>
    </div>
  `).join('');
}
