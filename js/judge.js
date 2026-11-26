/* judge.js — AI 활용 판단 사례를 하나씩 보여주고, 반 전체 O/X 인원을 기록
 *  사례: data/judge-cases.json   기록: DB.watchJudge(실시간) / DB.changeJudge(한 칸씩, 트랜잭션)
 *  주소 끝 #2 처럼 몇 번째 사례인지 기억한다 (새로고침해도 그대로)
 *
 *  O/X 숫자 = 서버 기록(base) + 아직 저장 중인 누름(pending)
 *   - +/− 누름은 줄(queue)에 넣고 하나씩 DB.changeJudge → 빠르게 연타해도, 화면 두 개에서 눌러도 정확
 *   - 저장 중에 온 실시간 값은 rev(바뀐 횟수)가 더 큰 것만 쓴다
 */

const $ = (id) => document.getElementById(id);
const KEYS = ['firstO', 'firstX', 'finalO', 'finalX'];
const MAX_TOTAL = CLASS_SIZE; // 처음/최종 각각 O+X 최대 (common.js의 우리 반 인원)

let cases = [];
let index = 0;
let shownQ = 0;      // 공개한 질문 수

const ZERO = { firstO: 0, firstX: 0, finalO: 0, finalX: 0, rev: 0 };
let base = { ...ZERO };  // 현재 사례의 서버 기록
let loaded = false;      // 현재 사례 기록을 서버에서 받았나 (못 받았으면 +/− 잠금, 연결되면 자동으로 풀림)
let stopWatch = null;
let latestSnap = null;   // 저장 중(busy)에 받은 실시간 값 — 끝나면 rev 비교해서 반영
const queue = [];        // 저장 기다리는 누름 [{id, key, step}] (사례를 넘겨도 끝까지 저장)
let busy = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireTeacher()) return;

  try {
    const data = await loadJSON('data/judge-cases.json');
    cases = Array.isArray(data.cases) ? data.cases : [];
    if (data.title) {
      $('pageTitle').textContent = data.title;
      document.title = data.title;
    }
  } catch (e) {
    console.warn(e);
  }
  if (cases.length === 0) {
    $('errorText').hidden = false;
    return;
  }
  $('judgeApp').hidden = false;

  buildCounters();

  $('prevBtn').addEventListener('click', () => go(index - 1));
  $('nextBtn').addEventListener('click', () => go(index + 1));
  $('thinkBtn').addEventListener('click', showNextQuestion);
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-overlay')) return;
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  });
  window.addEventListener('hashchange', () => go(hashIndex(), false));

  go(hashIndex(), false);
});

function hashIndex() {
  const n = parseInt(location.hash.slice(1), 10);
  return n >= 1 && n <= cases.length ? n - 1 : 0;
}

/* ---------- 사례 이동 ---------- */
async function go(i, updateHash = true) {
  if (i < 0 || i >= cases.length) return;
  index = i;
  if (updateHash) history.replaceState(null, '', `#${i + 1}`);
  await render();
}

async function render() {
  const c = cases[index];

  $('progress').textContent = `${index + 1} / ${cases.length}`;
  $('caseTitle').textContent = c.title || `사례 ${index + 1}`;
  $('caseSituation').textContent = c.situation || '';
  $('prevBtn').disabled = index === 0;
  $('nextBtn').disabled = index === cases.length - 1;

  // 그림 — 없거나 못 읽으면 회색 박스
  const media = $('caseMedia');
  const placeholder = () => { media.innerHTML = '<div class="media-placeholder">그림 준비 중</div>'; };
  if (c.image) {
    const img = new Image();
    img.alt = c.imageAlt || '';
    img.onerror = placeholder;
    img.src = ROOT + c.image;
    media.replaceChildren(img);
  } else {
    placeholder();
  }

  // 생각해 볼 점 — 사례를 바꾸면 다시 가린다
  shownQ = 0;
  $('thinkList').innerHTML = '';
  updateThinkBtn();

  // O/X 기록 — 실시간으로 받는다. 받기 전(인터넷 끊김 포함)에는 +/− 잠금, 받으면 자동으로 풀림
  watchCase(caseId(index));
}

function watchCase(id) {
  if (stopWatch) stopWatch();
  base = { ...ZERO };
  loaded = false;
  latestSnap = null;
  renderCounts();
  stopWatch = DB.watchJudge(id, (doc) => {
    if (id !== currentId()) return;
    const snap = doc ? { ...ZERO, ...doc } : { ...ZERO };
    loaded = true;
    if (busy) {
      if (!latestSnap || (snap.rev || 0) >= (latestSnap.rev || 0)) latestSnap = snap;
    } else {
      base = !doc ? snap : ((snap.rev || 0) >= (base.rev || 0) ? snap : base);
    }
    renderCounts();
  });
}

const caseId = (i) => String(cases[i].id ?? `case${i + 1}`);
const currentId = () => caseId(index);

/* ---------- 생각해 볼 점 (하나씩 공개) ---------- */
function questionsOf(c) {
  return Array.isArray(c.questions) ? c.questions : [];
}

function showNextQuestion() {
  const qs = questionsOf(cases[index]);
  if (shownQ >= qs.length) return;
  const li = document.createElement('li');
  li.innerHTML = `<span class="q-num">Q${shownQ + 1}.</span><span>${escapeHtml(qs[shownQ])}</span>`;
  $('thinkList').appendChild(li);
  shownQ++;
  updateThinkBtn();
}

function updateThinkBtn() {
  const total = questionsOf(cases[index]).length;
  const btn = $('thinkBtn');
  btn.hidden = total === 0;
  btn.disabled = shownQ >= total;
  if (shownQ === 0) btn.textContent = '💭 생각해 볼 점';
  else if (shownQ < total) btn.textContent = `💭 다음 질문 (${shownQ}/${total})`;
  else btn.textContent = `💭 질문을 모두 봤어요 (${total}/${total})`;
}

/* ---------- O/X 카운터 ---------- */
function buildCounters() {
  document.querySelectorAll('.counter').forEach((el) => {
    const key = el.dataset.key;
    const ox = key.endsWith('O') ? 'O' : 'X';
    const stage = key.startsWith('first') ? '처음' : '최종';
    el.innerHTML = `
      <span class="ox" aria-hidden="true">${ox}</span>
      <button type="button" class="btn btn-ghost step" data-step="-1" aria-label="${stage} 판단 ${ox} 한 명 빼기">−</button>
      <span class="count" data-count aria-live="polite">0</span>
      <button type="button" class="btn step" data-step="1" aria-label="${stage} 판단 ${ox} 한 명 더하기">+</button>`;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-step]');
      if (btn) changeCount(key, Number(btn.dataset.step));
    });
  });
}

/* 화면에 보일 기록 = 서버 기록 + 이 사례에서 아직 저장 중인 누름 (DB와 같은 규칙으로 계산) */
function shown() {
  const r = { ...base };
  queue.filter((q) => q.id === currentId()).forEach(({ key, step }) => {
    const next = applyStep(r, key, step);
    if (next) Object.assign(r, next);
  });
  return r;
}

/* 한 칸을 step만큼 바꾼 값, 바꿀 수 없으면 null (0 미만·단계 합계 초과) */
function applyStep(r, key, step) {
  const value = (r[key] || 0) + step;
  if (value < 0) return null;
  if (step > 0 && stageTotal(r, key) + step > MAX_TOTAL) return null;
  return { [key]: value };
}

/* 처음/최종 단계별 합계 (O+X) */
const stageTotal = (r, key) => {
  const stage = key.startsWith('first') ? 'first' : 'final';
  return (r[`${stage}O`] || 0) + (r[`${stage}X`] || 0);
};

function changeCount(key, step) {
  if (!loaded) return;
  const r = shown();
  if (!applyStep(r, key, step)) {
    if (step > 0) showToast(`O와 X를 합쳐 ${MAX_TOTAL}명까지 넣을 수 있어요`);
    return;
  }
  queue.push({ id: currentId(), key, step });
  renderCounts();
  pump();
}

/* 줄에 있는 누름을 하나씩 DB에 저장 */
async function pump() {
  if (busy) return;
  busy = true;
  let slowTimer = null;
  while (queue.length) {
    const job = queue[0];
    slowTimer = setTimeout(() => showToast('인터넷 연결을 기다리는 중이에요…', 3000), 4000);
    try {
      const doc = await DB.changeJudge(job.id, job.key, job.step, MAX_TOTAL);
      clearTimeout(slowTimer);
      queue.shift();
      if (job.id === currentId() && doc) base = { ...ZERO, ...doc };
    } catch (err) {
      clearTimeout(slowTimer);
      console.error(err);
      queue.length = 0; // 저장 못 한 누름은 버리고 서버 값으로 되돌림
      showToast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요', 3500);
    }
    renderCounts();
  }
  busy = false;
  if (latestSnap && (latestSnap.rev || 0) > (base.rev || 0)) base = latestSnap;
  latestSnap = null;
  renderCounts();
}

function renderCounts() {
  const r = shown();
  KEYS.forEach((key) => {
    const counter = document.querySelector(`.counter[data-key="${key}"]`);
    counter.querySelector('[data-count]').textContent = loaded ? (r[key] || 0) : '…';
    counter.querySelector('[data-step="-1"]').disabled = !loaded || !r[key];
    counter.querySelector('[data-step="1"]').disabled = !loaded || stageTotal(r, key) >= MAX_TOTAL;
  });
  const status = $('voteStatus');
  if (status) status.hidden = loaded;
  renderCompare(r);
}

/* ---------- 처음 vs 최종 막대 (최종 판단까지 입력되면) ---------- */
function renderCompare(record) {
  const finalTotal = (record.finalO || 0) + (record.finalX || 0);
  $('compare').hidden = !loaded || finalTotal === 0;
  if (!loaded || finalTotal === 0) return;

  // 막대 안 글자는 칸 너비에 맞게 (넓으면 "O 12명 (60%)", 좁으면 숫자만, 아주 좁으면 비움)
  // 정확한 숫자는 막대 아래 범례에 항상 표시
  const inside = (ox, n, p) => {
    if (!n) return '';
    if (p >= 34) return `${ox} ${n}명 (${p}%)`;
    if (p >= 10) return String(n);
    return '';
  };
  const bar = (label, o, x) => {
    const total = o + x;
    const pO = total ? Math.round((o / total) * 100) : 0;
    const pX = total ? 100 - pO : 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar" role="img" aria-label="${label}: O ${o}명, X ${x}명">
          <span class="bar-o" style="width:${pO}%">${inside('O', o, pO)}</span>
          <span class="bar-x" style="width:${pX}%">${inside('X', x, pX)}</span>
        </div>
        <span class="bar-legend"><b class="o">O ${o}명</b> · <b class="x">X ${x}명</b></span>
      </div>`;
  };

  $('bars').innerHTML =
    bar('처음', record.firstO || 0, record.firstX || 0) +
    bar('최종', record.finalO || 0, record.finalX || 0);
}
