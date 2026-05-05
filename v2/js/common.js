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
