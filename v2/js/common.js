/* ==========================================================================
   반쪽 v2 — Common Utilities & Supabase Init
   ========================================================================== */

// --- Supabase ---
const SUPABASE_URL = 'https://nhayianbkdjtxjndhsnz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYXlpYW5ia2RqdHhqbmRoc256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Mzk4MzMsImV4cCI6MjA5MzUxNTgzM30.8dmK8CcU_UsXqPaGSlo6QhXTZYvnlEbuzRR4nl5lq0s';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Escaping ---
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Toast ---
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, duration);
}

// --- Age Calc ---
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// --- MBTI Compatibility Matrix ---
const MBTI_COMPAT = {
  INTJ: { ENFP: 5, ENTP: 5, INFJ: 4, INTJ: 3, INFP: 4, ENTJ: 4, INTP: 4, ENFJ: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  INTP: { ENTJ: 5, ENFJ: 4, INFJ: 4, INTJ: 4, ENTP: 4, INTP: 3, INFP: 3, ENFP: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  ENTJ: { INTP: 5, INFP: 4, INTJ: 4, ENTP: 4, ENTJ: 3, ENFJ: 3, ENFP: 3, INFJ: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  ENTP: { INFJ: 5, INTJ: 5, ENFP: 4, ENTP: 3, INTP: 4, ENTJ: 4, ENFJ: 3, INFP: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  INFJ: { ENTP: 5, ENFP: 5, INFP: 4, INTJ: 4, INFJ: 3, ENFJ: 3, INTP: 4, ENTJ: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  INFP: { ENFJ: 5, ENTJ: 4, INFJ: 4, ENFP: 3, INFP: 3, INTP: 3, INTJ: 4, ENTP: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  ENFJ: { INFP: 5, ISFP: 4, ENFP: 4, INFJ: 3, ENFJ: 3, ENTJ: 3, INTP: 4, ENTP: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, INTJ: 3, ESTP: 2, ESFP: 2 },
  ENFP: { INFJ: 5, INTJ: 5, ENFJ: 4, ENTP: 4, ENFP: 3, INFP: 3, ENTJ: 3, INTP: 3, ISTJ: 2, ISFJ: 2, ESTJ: 2, ESFJ: 2, ISTP: 2, ISFP: 2, ESTP: 2, ESFP: 2 },
  ISTJ: { ESFJ: 4, ISFJ: 3, ESTJ: 3, ISTJ: 3, ESFP: 3, ISFP: 3, ESTP: 3, ISTP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ISFJ: { ESTP: 4, ESFJ: 3, ISTJ: 3, ISFJ: 3, ESFP: 3, ISFP: 3, ESTJ: 3, ISTP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ESTJ: { ISFP: 4, ISTJ: 3, ESFJ: 3, ESTJ: 3, ISTP: 3, ESTP: 3, ESFP: 3, ISFJ: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ESFJ: { ISTP: 4, ISTJ: 4, ISFJ: 3, ESTJ: 3, ESFJ: 3, ESFP: 3, ISFP: 3, ESTP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ISTP: { ESFJ: 4, ESTJ: 3, ISTJ: 3, ISFJ: 3, ISTP: 3, ESTP: 3, ISFP: 3, ESFP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ISFP: { ESTJ: 4, ENFJ: 4, ESFJ: 3, ISTJ: 3, ISFJ: 3, ISFP: 3, ESFP: 3, ISTP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ESTP: 2, ENFP: 2 },
  ESTP: { ISFJ: 4, ISTJ: 3, ISTP: 3, ESTJ: 3, ESFJ: 3, ESTP: 3, ESFP: 3, ISFP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
  ESFP: { ISTJ: 3, ISFJ: 3, ESTJ: 3, ESFJ: 3, ISTP: 3, ISFP: 3, ESTP: 3, ESFP: 3, INTJ: 2, INTP: 2, ENTJ: 2, ENTP: 2, INFJ: 2, INFP: 2, ENFJ: 2, ENFP: 2 },
};

// --- Compatibility Report (v2: text-based, no numeric score) ---
function compatibilityReport(personA, personB) {
  const items = [];

  // Age
  const ageA = calcAge(personA.birth_date);
  const ageB = calcAge(personB.birth_date);
  if (personA.preferred_age_min && personA.preferred_age_max) {
    const inRange = ageB >= personA.preferred_age_min && ageB <= personA.preferred_age_max;
    items.push({ key: '나이', status: inRange ? 'match' : 'mismatch', text: inRange ? '이상형 범위 안' : `범위 밖 (${ageB}세)` });
  }

  // MBTI
  if (personA.mbti && personB.mbti) {
    const score = (MBTI_COMPAT[personA.mbti] || {})[personB.mbti] || 3;
    const label = score >= 4 ? '좋음' : score >= 3 ? '보통' : '낮음';
    items.push({ key: 'MBTI', status: score >= 4 ? 'match' : 'neutral', text: `${label} (${personA.mbti} × ${personB.mbti})` });
  }

  // Job
  if (personA.preferred_job && personB.job) {
    const match = personA.preferred_job.includes(personB.job);
    items.push({ key: '직업', status: match ? 'match' : 'neutral', text: match ? '이상형 일치' : '이상형 명시 안 함' });
  }

  // Location
  if (personA.location && personB.location) {
    const same = personA.location === personB.location;
    items.push({ key: '지역', status: same ? 'match' : 'mismatch', text: same ? `동일 (${personA.location})` : `거리 있음 (${personA.location} ↔ ${personB.location})` });
  }

  // Height
  if (personA.preferred_height_min && personB.height) {
    const inRange = personB.height >= personA.preferred_height_min && personB.height <= (personA.preferred_height_max || 999);
    items.push({ key: '키', status: inRange ? 'match' : 'mismatch', text: inRange ? '이상형 범위 안' : `범위 밖 (${personB.height}cm)` });
  }

  return items;
}

// --- Admin Check ---
async function checkIsAdmin() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data } = await sb.from('admin_users').select('id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

// --- 직업 점수 ---
const JOB_SCORES = { '전문직':95, '연구·기술직':85, '공공·금융·교육직':80, '대기업·중견기업직':75, '사업·전문자유직':70, '일반사무·기술직':60, '대학생/대학원생':45, '대학원생':50, '대학생':40, '학생':40, '기타':30 };
function calcJobScore(jc) { return JOB_SCORES[jc] || 50; }

// --- 키 범위 매칭 ---
function heightInRange(h, range, candidateGender) {
  if (!h || !range) return false;
  if (candidateGender === 'female') {
    if (range === '155미만') return h < 155;
    if (range === '155~160') return h >= 155 && h < 160;
    if (range === '160~165') return h >= 160 && h < 165;
    if (range === '165~170') return h >= 165 && h < 170;
    if (range === '170이상') return h >= 170;
  } else {
    if (range === '170미만') return h < 170;
    if (range === '170~175') return h >= 170 && h < 175;
    if (range === '175~180') return h >= 175 && h < 180;
    if (range === '180~185') return h >= 180 && h < 185;
    if (range === '185이상') return h >= 185;
  }
  return false;
}

// --- 매칭 점수 (주선자용 상세 분석) ---
function calcMatchScore(viewer, candidate, opts) {
  let w = { height: 20, job: 20, location: 15, age: 20, mbti: 15, religion: 10 };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total === 0) return 50;

  let ideal = {};
  if (viewer.ideal_type) {
    try { ideal = typeof viewer.ideal_type === 'string' ? JSON.parse(viewer.ideal_type) : viewer.ideal_type; } catch {}
  }

  // 1. 키
  let heightScore = 50;
  if (candidate.height) {
    const pref = ideal['키'] || [];
    if (pref.length === 0) { heightScore = 70; }
    else { heightScore = pref.some(range => heightInRange(candidate.height, range, candidate.gender)) ? 95 : 30; }
  }

  // 2. 직업
  const jobScore = calcJobScore(candidate.job);

  // 3. 지역
  let locationScore = 50;
  if (candidate.location && viewer.location) {
    const prefLoc = ideal['지역'] || [];
    if (prefLoc.includes('상관없음') || prefLoc.length === 0) {
      locationScore = candidate.location === viewer.location ? 80 : 60;
    } else {
      locationScore = prefLoc.some(p => candidate.location.includes(p) || p.includes(candidate.location)) ? 95 : 30;
    }
  }

  // 4. 나이
  let ageScore = 50;
  if (candidate.birth_date) {
    const yStart = ideal['생년_시작'], yEnd = ideal['생년_끝'];
    if (yStart != null && yEnd != null) {
      const candYear = new Date(candidate.birth_date).getFullYear();
      const minY = Math.min(yStart, yEnd), maxY = Math.max(yStart, yEnd);
      if (candYear >= minY && candYear <= maxY) { ageScore = 95; }
      else { const dist = candYear < minY ? (minY - candYear) : (candYear - maxY); ageScore = Math.max(15, 85 - dist * 12); }
    } else if (viewer.birth_date) {
      const diff = Math.abs(calcAge(candidate.birth_date) - calcAge(viewer.birth_date));
      ageScore = diff <= 3 ? 85 : diff <= 5 ? 70 : diff <= 8 ? 50 : 30;
    }
  }

  // 5. MBTI
  let mbtiScore = calcMbtiCompat(viewer.mbti, candidate.mbti);
  const prefMbti = ideal['성향'] || [];
  if (prefMbti.length > 0 && !prefMbti.includes('상관없음') && candidate.mbti) {
    const matchCount = prefMbti.filter(p => candidate.mbti.toUpperCase().includes(p)).length;
    mbtiScore = Math.min(100, mbtiScore + matchCount * 8);
  }

  // 6. 종교
  let religionScore = 50;
  const prefReligion = ideal['종교'] || [];
  if (prefReligion.length > 0 && !prefReligion.includes('상관없음') && candidate.religion) {
    religionScore = prefReligion.includes(candidate.religion) ? 90 : 30;
  } else if (viewer.religion && candidate.religion) {
    religionScore = viewer.religion === candidate.religion ? 80 : 50;
  }

  const weighted = (heightScore * w.height + jobScore * w.job + locationScore * w.location + ageScore * w.age + mbtiScore * w.mbti + religionScore * w.religion) / total;
  const finalScore = Math.min(100, Math.max(0, Math.round(weighted)));

  if (opts && opts.detailed) {
    return {
      total: finalScore,
      categories: [
        { key: 'height', score: heightScore, weight: w.height, label: '키', icon: 'fa-ruler-vertical' },
        { key: 'job', score: jobScore, weight: w.job, label: '직업', icon: 'fa-briefcase' },
        { key: 'location', score: locationScore, weight: w.location, label: '지역', icon: 'fa-location-dot' },
        { key: 'age', score: ageScore, weight: w.age, label: '나이', icon: 'fa-cake-candles' },
        { key: 'mbti', score: mbtiScore, weight: w.mbti, label: 'MBTI', icon: 'fa-brain' },
        { key: 'religion', score: religionScore, weight: w.religion, label: '종교', icon: 'fa-hands-praying' },
      ]
    };
  }
  return finalScore;
}

function calcMbtiCompat(m1, m2) {
  if (!m1 || !m2) return 50;
  const a = m1.toUpperCase(), b = m2.toUpperCase();
  if (a === b) return 65;
  return (MBTI_COMPAT[a] || {})[b] || (MBTI_COMPAT[b] || {})[a] || 50;
}

// --- 이미지 압축 ---
async function compressToBlob(file, maxKB = 200) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const MAX = 1200;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        const tryBlob = (q) => new Promise(r => canvas.toBlob(b => r(b), 'image/jpeg', q));
        (async () => {
          let blob = await tryBlob(quality);
          while (blob.size > maxKB * 1024 && quality > 0.25) {
            quality -= 0.08;
            blob = await tryBlob(quality);
          }
          resolve(blob);
        })();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Storage 사진 업로드 ---
async function uploadPhotoToStorage(file, userId, index) {
  const blob = await compressToBlob(file);
  const filename = `${userId}/${Date.now()}_${index}.jpg`;
  const { data, error } = await sb.storage
    .from('photos')
    .upload(filename, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw new Error('사진 업로드 실패: ' + error.message);
  const { data: { publicUrl } } = sb.storage.from('photos').getPublicUrl(filename);
  return publicUrl;
}

// --- Storage 사진 삭제 ---
async function deleteUserPhotosFromStorage(userId) {
  try {
    const { data: files } = await sb.storage.from('photos').list(userId);
    if (files && files.length > 0) {
      await sb.storage.from('photos').remove(files.map(f => `${userId}/${f.name}`));
    }
  } catch (e) { console.log('Storage cleanup error:', e.message); }
}

// --- 이상형 칩 시스템 ---
const HEIGHT_OPTIONS_FOR_FEMALE_TARGET = ['155미만', '155~160', '160~165', '165~170', '170이상'];
const HEIGHT_OPTIONS_FOR_MALE_TARGET = ['170미만', '170~175', '175~180', '180~185', '185이상'];

function getHeightOptions(myGender) {
  if (myGender === 'male') return HEIGHT_OPTIONS_FOR_FEMALE_TARGET;
  if (myGender === 'female') return HEIGHT_OPTIONS_FOR_MALE_TARGET;
  return [];
}

const IDEAL_CATEGORIES = [
  { key: '키', label: '선호하는 키 (복수 선택)', getOptions: (g) => getHeightOptions(g) },
  { key: '성향', label: '선호하는 MBTI', options: ['E', 'I', 'N', 'S', 'F', 'T', 'P', 'J', '상관없음'] },
  { key: '지역', label: '선호하는 지역', options: ['서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주', '상관없음'] },
  { key: '흡연', label: '흡연 여부', options: ['비흡연자 선호', '흡연 OK', '전자담배 OK'] },
  { key: '음주', label: '음주 여부', options: ['안 마시는 분', '가끔 한 잔', '자주 즐기는 분', '상관없음'] },
  { key: '종교', label: '선호하는 종교', options: ['무교', '기독교', '천주교', '불교', '상관없음'] },
];

function buildIdealChipsHtml(containerId, idealData, myGender) {
  let selected = {};
  if (idealData) {
    try { selected = typeof idealData === 'string' ? JSON.parse(idealData) : idealData; } catch {}
  }
  const currentYear = new Date().getFullYear();
  const yearStart = selected['생년_시작'] || (currentYear - 35);
  const yearEnd = selected['생년_끝'] || (currentYear - 22);

  let html = `
    <div class="chip-group">
      <span class="chip-group-label">선호 생년 범위</span>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.88em;">
        <input type="number" id="ideal-year-start" value="${yearStart}" min="1950" max="${currentYear - 17}" style="width:76px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;text-align:center;">
        <span style="color:var(--muted);">년생 ~</span>
        <input type="number" id="ideal-year-end" value="${yearEnd}" min="1950" max="${currentYear - 17}" style="width:76px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;text-align:center;">
        <span style="color:var(--muted);">년생</span>
      </div>
    </div>`;

  IDEAL_CATEGORIES.forEach(cat => {
    const opts = cat.getOptions ? cat.getOptions(myGender) : (cat.options || []);
    if (!opts.length) {
      if (cat.key === '키') {
        html += `<div class="chip-group"><span class="chip-group-label">${cat.label}</span>
          <div style="font-size:.82em;color:var(--muted);padding:8px 0;">먼저 성별을 선택해주세요</div></div>`;
      }
      return;
    }
    html += `<div class="chip-group"><span class="chip-group-label">${cat.label}</span><div class="chip-list">`;
    opts.forEach(opt => {
      const isOn = selected[cat.key] && Array.isArray(selected[cat.key]) && selected[cat.key].includes(opt);
      html += `<button type="button" class="chip${isOn ? ' on' : ''}" data-cat="${cat.key}" data-val="${opt}" onclick="this.classList.toggle('on')">${opt}</button>`;
    });
    html += `</div></div>`;
  });
  return html;
}

function collectIdealData(containerId, memoId) {
  const data = {};
  document.querySelectorAll(`#${containerId} .chip.on`).forEach(c => {
    const cat = c.dataset.cat;
    if (!data[cat]) data[cat] = [];
    data[cat].push(c.dataset.val);
  });
  const yearStartEl = document.getElementById('ideal-year-start');
  const yearEndEl = document.getElementById('ideal-year-end');
  const currentYear = new Date().getFullYear();
  if (yearStartEl) { const v = parseInt(yearStartEl.value); if (!isNaN(v)) data['생년_시작'] = Math.max(1950, Math.min(currentYear - 17, v)); }
  if (yearEndEl) { const v = parseInt(yearEndEl.value); if (!isNaN(v)) data['생년_끝'] = Math.max(1950, Math.min(currentYear - 17, v)); }
  if (data['생년_시작'] && data['생년_끝'] && data['생년_시작'] > data['생년_끝']) {
    [data['생년_시작'], data['생년_끝']] = [data['생년_끝'], data['생년_시작']];
  }
  const memo = document.getElementById(memoId)?.value.trim();
  if (memo) data.memo = memo;
  return Object.keys(data).length ? data : null;
}

function renderIdealDisplay(idealData) {
  if (!idealData) return '';
  let data;
  try { data = typeof idealData === 'string' ? JSON.parse(idealData) : idealData; } catch { return ''; }
  const lines = [];
  if (data['생년_시작'] != null || data['생년_끝'] != null) {
    lines.push(`<span class="pm-ideal-chip">${data['생년_시작'] ?? '?'} ~ ${data['생년_끝'] ?? '?'}년생</span>`);
  }
  IDEAL_CATEGORIES.filter(cat => data[cat.key] && data[cat.key].length).forEach(cat => {
    data[cat.key].forEach(v => { lines.push(`<span class="pm-ideal-chip">${esc(v)}</span>`); });
  });
  if (data.memo) lines.push(`<div style="margin-top:6px;font-size:.82em;color:var(--muted);font-style:italic;">"${esc(data.memo)}"</div>`);
  return lines.join(' ');
}

// --- 시간 표시 ---
function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return new Date(iso).toLocaleDateString('ko-KR');
}

// --- 이벤트 로깅 ---
function logEvent(eventType, detail = {}) {
  const profile = AppState?.getProfile?.();
  sb.from('event_logs').insert({
    actor_id: profile?.id || null,
    event_type: eventType,
    detail: detail
  }).then(() => {}, () => {}); // fire-and-forget
}

// --- Watermark ---
function applyWatermark(name, phone) {
  const canvas = document.getElementById('watermark');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth * 2;
  canvas.height = window.innerHeight * 2;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '24px Pretendard';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.rotate(-25 * Math.PI / 180);

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const text = `${name} · ${phone} · ${ts}`;

  for (let y = -canvas.height; y < canvas.height * 2; y += 200) {
    for (let x = -canvas.width; x < canvas.width * 2; x += 400) {
      ctx.fillText(text, x, y);
    }
  }
}
