/* summary.js — 교사 정리 판서 (TV에 크게)
 *  학생 발표를 듣고 교사가 아래 입력 줄에 '능력' / '한계' 항목과 '오늘의 핵심 문장'을 적는다.
 *  저장: DB.changeBoard(op) (트랜잭션) / 받기: DB.watchBoard (실시간, 새로고침해도 유지)
 *  항목이 많아 넘치면 판서 글자 크기를 자동으로 줄인다 (fitBoard)
 *  [참고 예시 보기]: data/summary.json 예시 정답을 가렸다가 하나씩 보는 창 (기본 숨김)
 */

const $ = (id) => document.getElementById(id);
const COLS = { abilities: 'abilityList', limits: 'limitList' };
const COL_LABEL = { abilities: '능력', limits: '한계' };

let board = { abilities: [], limits: [], conclusion: '', rev: 0 };
let loaded = false;
let mode = 'abilities';      // 입력 줄이 적을 곳: abilities | limits | conclusion
let editingId = null;        // 고치는 중인 항목
const tags = new Set();      // 고른 모둠 태그
let chain = Promise.resolve();

document.addEventListener('DOMContentLoaded', () => {
  if (!requireTeacher()) return;

  buildTagButtons();
  setMode('abilities');
  render();

  /* 실시간 판서 — 저장 중 받은 옛 값은 rev 비교로 거른다 (rev 0 = 전체 초기화로 비었음) */
  DB.watchBoard((b) => {
    loaded = true;
    if (b.rev >= board.rev || b.rev === 0) accept(b);
    else render();
  });

  /* 입력 줄 */
  $('entryForm').addEventListener('submit', (e) => { e.preventDefault(); submitEntry(); });
  document.querySelectorAll('.seg-btn').forEach((btn) => btn.addEventListener('click', () => {
    if (editingId && btn.dataset.col === 'conclusion') resetEntry();
    setMode(btn.dataset.col);
    $('entryKeyword').focus();
  }));
  $('entryCancel').addEventListener('click', () => { resetEntry(); $('entryKeyword').focus(); });
  $('conclusionView').addEventListener('click', () => {
    if (document.body.classList.contains('is-present')) return;
    resetEntry();
    setMode('conclusion');
    $('entryKeyword').focus();
  });

  /* 항목: 누르면 고치기, ▲▼ 순서, ✕ 지우기 */
  $('board').addEventListener('click', async (e) => {
    const li = e.target.closest('.board-item');
    if (!li || document.body.classList.contains('is-present')) return;
    const id = li.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'up') run({ type: 'move', id, dir: -1 });
    else if (act === 'down') run({ type: 'move', id, dir: 1 });
    else if (act === 'remove') {
      const item = findItem(id);
      const ok = await confirmDialog(`"${item?.keyword || ''}" 항목을 지울까요?`, { okText: '지우기', cancelText: '취소', danger: true });
      if (!ok) return;
      if (editingId === id) resetEntry();
      run({ type: 'remove', id });
    } else if (e.target.closest('.item-main')) {
      startEdit(id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-overlay:not([hidden])') && editingId) resetEntry();
  });

  /* 발표 모드: 입력 줄과 항목 버튼을 숨기고 판서만 크게 */
  $('presentBtn').addEventListener('click', () => {
    const on = document.body.classList.toggle('is-present');
    $('presentBtn').setAttribute('aria-pressed', String(on));
    $('presentBtn').textContent = on ? '입력 모드' : '발표 모드';
    if (on) resetEntry();
    render();
  });

  /* 넘치면 글자 크기 자동 조정 */
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitBoard); }).observe($('board'));
  if (document.fonts) document.fonts.ready.then(fitBoard);

  setupExample();
});

/* ---------- 판서 그리기 ---------- */
function accept(b) {
  board = b;
  if (editingId && !findItem(editingId)) resetEntry(); // 다른 화면에서 지워짐
  render();
}

function findItem(id) {
  return board.abilities.find((x) => x.id === id) || board.limits.find((x) => x.id === id) || null;
}

function render() {
  const present = document.body.classList.contains('is-present');
  Object.entries(COLS).forEach(([col, listId]) => {
    const items = board[col];
    const list = $(listId);
    if (!items.length) {
      list.innerHTML = `<li class="board-empty">${!loaded ? '판서를 불러오는 중… (인터넷 연결을 확인해 주세요)'
        : present ? '아직 적은 내용이 없어요' : `학생 발표를 듣고 아래 입력 줄에 ${COL_LABEL[col]}을 적어요`}</li>`;
      return;
    }
    list.innerHTML = items.map((it, i) => `
      <li class="board-item${it.id === editingId ? ' is-editing' : ''}" data-id="${escapeHtml(it.id)}">
        <button type="button" class="item-main" aria-label="${escapeHtml(it.keyword)} 고치기">
          <span class="item-line">
            <span class="item-keyword">${escapeHtml(it.keyword)}</span>
            ${(it.groups || []).map((g) => `<span class="item-tag" data-g="${g}">${g}모둠</span>`).join('')}
          </span>
          ${it.desc ? `<span class="item-desc">${escapeHtml(it.desc)}</span>` : ''}
        </button>
        <span class="item-tools">
          <button type="button" class="tool-btn" data-act="up" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="tool-btn" data-act="down" aria-label="아래로" ${i === items.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" class="tool-btn tool-remove" data-act="remove" aria-label="지우기">✕</button>
        </span>
      </li>`).join('');
  });
  $('conclusionText').textContent = board.conclusion || (present ? '' : '아직 적지 않았어요 — 눌러서 적기');
  $('conclusionView').classList.toggle('is-empty', !board.conclusion);
  $('entryAdd').disabled = !loaded;
  fitBoard();
}

/* 판서가 넘치면 --board-scale 을 줄여 한 화면에 맞춘다 (1 → 최소 0.5)
 * 넘치지 않는 가장 큰 크기를 이분 탐색으로 찾는다 */
function fitBoard() {
  const el = $('board');
  const set = (s) => el.style.setProperty('--board-scale', s);
  const overflow = () => [...el.querySelectorAll('.board-list')].some((l) => l.scrollHeight > l.clientHeight)
    || el.scrollHeight > el.clientHeight;
  set(1);
  if (!overflow()) return;
  let lo = 0.5;
  let hi = 1;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    set(mid);
    if (overflow()) hi = mid; else lo = mid;
  }
  // 줄바꿈 때문에 크기와 넘침이 딱 맞게 비례하지 않을 수 있어, 넘치면 조금 더 줄인다
  set(lo);
  while (overflow() && lo > 0.5) { lo = Math.max(0.5, lo - 0.02); set(lo); }
}

/* ---------- 바꾸기 (차례대로 하나씩) ---------- */
function run(op) {
  chain = chain.then(async () => {
    try {
      const b = await DB.changeBoard(op);
      if (b.rev >= board.rev) accept(b);
      return true;
    } catch (err) {
      if (err?.code === 'full' || err?.code === 'empty') showToast(err.message, 3000);
      else { console.error(err); showToast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요', 3500); }
      return false;
    }
  });
  return chain;
}

/* ---------- 입력 줄 ---------- */
function buildTagButtons() {
  const box = $('entryTags');
  for (let g = 1; g <= GROUP_COUNT; g++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tag-btn';
    b.dataset.g = g;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${g}모둠`);
    b.title = `${g}모둠 (이야기 ${storyOf(g)})`;
    b.textContent = g;
    b.addEventListener('click', () => {
      if (tags.has(g)) tags.delete(g); else tags.add(g);
      b.setAttribute('aria-pressed', String(tags.has(g)));
    });
    box.appendChild(b);
  }
}

function setMode(col) {
  mode = col;
  document.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.col === col)));
  const kw = $('entryKeyword');
  const isConclusion = col === 'conclusion';
  $('entryForm').classList.toggle('is-conclusion', isConclusion);
  $('entryForm').dataset.col = col;
  kw.maxLength = isConclusion ? 150 : 30;
  kw.placeholder = isConclusion ? '오늘의 핵심 문장 (150자까지)' : `${COL_LABEL[col]} 키워드 (꼭 적기)`;
  kw.setAttribute('aria-label', isConclusion ? '오늘의 핵심 문장' : '키워드');
  if (isConclusion) kw.value = board.conclusion || '';
  else if (!editingId && kw.value === board.conclusion) kw.value = '';
  updateAddLabel();
}

function updateAddLabel() {
  $('entryAdd').textContent = mode === 'conclusion' ? '핵심 문장 저장' : editingId ? '수정 저장' : '추가';
  $('entryCancel').hidden = !editingId;
}

function startEdit(id) {
  const it = findItem(id);
  if (!it) return;
  editingId = id;
  setMode(board.abilities.some((x) => x.id === id) ? 'abilities' : 'limits');
  $('entryKeyword').value = it.keyword;
  $('entryDesc').value = it.desc || '';
  tags.clear();
  (it.groups || []).forEach((g) => tags.add(g));
  document.querySelectorAll('.tag-btn').forEach((b) => b.setAttribute('aria-pressed', String(tags.has(Number(b.dataset.g)))));
  updateAddLabel();
  render();
  $('entryKeyword').focus();
}

function resetEntry() {
  editingId = null;
  $('entryKeyword').value = mode === 'conclusion' ? (board.conclusion || '') : '';
  $('entryDesc').value = '';
  tags.clear();
  document.querySelectorAll('.tag-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  updateAddLabel();
  render();
}

async function submitEntry() {
  const kw = $('entryKeyword');
  if (mode === 'conclusion') {
    if (await run({ type: 'conclusion', text: kw.value })) showToast('핵심 문장을 저장했어요');
    return;
  }
  const keyword = kw.value.trim();
  if (!keyword) {
    showToast('키워드를 적어 주세요');
    kw.focus();
    return;
  }
  const item = { keyword, desc: $('entryDesc').value.trim(), groups: [...tags] };
  const op = editingId ? { type: 'update', id: editingId, col: mode, item } : { type: 'add', col: mode, item };
  if (await run(op)) {
    resetEntry();
    kw.focus();
  }
}

/* ---------- 참고 예시 (data/summary.json) ---------- */
function setupExample() {
  let loadedExample = false;
  const modal = $('exampleModal');
  const open = async () => {
    modal.hidden = false;
    $('exampleClose').focus();
    if (loadedExample) return;
    try {
      const data = await loadJSON('data/summary.json');
      if (data.title) $('exampleTitle').textContent = `참고 예시 — ${data.title}`;
      $('exampleAbilities').innerHTML = (data.abilities || []).map(revealHtml).join('');
      $('exampleLimits').innerHTML = (data.limits || []).map(revealHtml).join('');
      $('exampleConclusion').innerHTML = data.conclusion ? `
        <button type="button" class="reveal conclusion" aria-expanded="false">
          <span class="reveal-cover">💡 핵심 문장 — 눌러서 확인해요</span>
          <span class="reveal-content">${escapeHtml(data.conclusion)}</span>
        </button>` : '';
      loadedExample = true;
    } catch (e) {
      console.warn(e);
      $('errorText').hidden = false;
    }
  };
  const close = () => { modal.hidden = true; $('exampleBtn').focus(); };
  $('exampleBtn').addEventListener('click', open);
  $('exampleClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { close(); return; }
    const card = e.target.closest('.reveal');
    if (card) setOpen(card, !card.classList.contains('is-open'));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  $('showAllBtn').addEventListener('click', () => modal.querySelectorAll('.reveal').forEach((c) => setOpen(c, true)));
  $('hideAllBtn').addEventListener('click', () => modal.querySelectorAll('.reveal').forEach((c) => setOpen(c, false)));
}

function revealHtml(item, i) {
  const stories = (item.stories || []).map((n) => `<span class="story-chip">이야기 ${escapeHtml(n)}</span>`).join('');
  return `
    <li>
      <button type="button" class="reveal" aria-expanded="false">
        <span class="reveal-cover" aria-hidden="true">
          <span class="cover-num">${i + 1}</span>
          <span>?</span>
          <span class="cover-hint">눌러서 확인</span>
        </span>
        <span class="reveal-content">
          <span class="reveal-head">
            <span class="reveal-keyword">${escapeHtml(item.keyword)}</span>
            ${stories ? `<span class="reveal-stories">${stories}</span>` : ''}
          </span>
          ${item.desc ? `<span class="reveal-desc">${escapeHtml(item.desc)}</span>` : ''}
        </span>
      </button>
    </li>`;
}

function setOpen(card, open) {
  card.classList.toggle('is-open', open);
  card.setAttribute('aria-expanded', String(open));
}
