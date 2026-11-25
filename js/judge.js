/* judge.js — AI 활용 판단 사례를 하나씩 보여주고, 반 전체 O/X 인원을 기록
 *  사례: data/judge-cases.json   기록: DB.getJudge / DB.saveJudge (judge/{사례id})
 *  주소 끝 #2 처럼 몇 번째 사례인지 기억한다 (새로고침해도 그대로)
 */

const $ = (id) => document.getElementById(id);
const KEYS = ['firstO', 'firstX', 'finalO', 'finalX'];
const MAX_COUNT = 99;

let cases = [];
let index = 0;
let record = null;   // 현재 사례의 O/X 기록
let shownQ = 0;      // 공개한 질문 수

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

  // O/X 기록
  record = (await DB.getJudge(caseId(c))) || { firstO: 0, firstX: 0, finalO: 0, finalX: 0 };
  renderCounts();
}

const caseId = (c) => String(c.id ?? `case${index + 1}`);

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

async function changeCount(key, step) {
  const next = Math.min(MAX_COUNT, Math.max(0, (record[key] || 0) + step));
  if (next === record[key]) return;
  record = { ...record, [key]: next };
  renderCounts();
  const savingIndex = index;
  try {
    const saved = await DB.saveJudge(caseId(cases[savingIndex]), record);
    if (savingIndex === index) record = saved; // 그 사이 다른 사례로 넘어갔으면 덮어쓰지 않음
  } catch (err) {
    console.error(err);
    showToast('저장하지 못했어요');
  }
}

function renderCounts() {
  KEYS.forEach((key) => {
    const el = document.querySelector(`.counter[data-key="${key}"] [data-count]`);
    el.textContent = record[key] || 0;
    el.parentElement.querySelector('[data-step="-1"]').disabled = !record[key];
  });
  renderCompare();
}

/* ---------- 처음 vs 최종 막대 (최종 판단까지 입력되면) ---------- */
function renderCompare() {
  const finalTotal = (record.finalO || 0) + (record.finalX || 0);
  $('compare').hidden = finalTotal === 0;
  if (finalTotal === 0) return;

  const bar = (label, o, x) => {
    const total = o + x;
    const pO = total ? Math.round((o / total) * 100) : 0;
    const pX = total ? 100 - pO : 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar" role="img" aria-label="${label}: O ${o}명, X ${x}명">
          <span class="bar-o" style="width:${pO}%">${o ? `O ${o}명 (${pO}%)` : ''}</span>
          <span class="bar-x" style="width:${pX}%">${x ? `X ${x}명 (${pX}%)` : ''}</span>
        </div>
      </div>`;
  };

  $('bars').innerHTML =
    bar('처음', record.firstO || 0, record.firstX || 0) +
    bar('최종', record.finalO || 0, record.finalX || 0);
}
