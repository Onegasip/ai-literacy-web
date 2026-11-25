/* results.js — 교사: 1~6모둠 결과 모아보기, 크게 보기, 초기화, CSV 내보내기
 *  데이터는 DB.watchAll 로만 읽는다 (Firebase 실시간으로 교체 가능)
 */

const $ = (id) => document.getElementById(id);

let allGroups = [];   // 마지막으로 받은 전체 데이터
let openGroup = null; // 크게 보기 중인 모둠 번호
let watcher = null;

const isDone = (m) => Boolean(m && (m.strength || m.limit));

document.addEventListener('DOMContentLoaded', () => {
  if (!requireTeacher()) return;

  watcher = DB.watchAll((groups) => {
    allGroups = groups;
    renderGrid();
    if (openGroup) renderDetail(openGroup);
    $('lastUpdate').textContent = `마지막 변경 ${formatTime(Date.now())}`;
  });

  /* 카드 클릭 → 크게 보기, [초기화] → 모둠 초기화 */
  const grid = $('resultGrid');
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.group-card');
    if (!card) return;
    const g = Number(card.dataset.g);
    if (e.target.closest('[data-act="reset"]')) {
      resetGroup(g);
    } else {
      openDetail(g);
    }
  });
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('.group-card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDetail(Number(card.dataset.g));
    }
  });

  $('detailClose').addEventListener('click', closeDetail);
  $('detail').addEventListener('click', (e) => { if (e.target.id === 'detail') closeDetail(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openGroup && !document.querySelector('.modal-overlay:not(#detail)')) closeDetail();
  });

  $('exportBtn').addEventListener('click', exportCSV);
  $('resetAllBtn').addEventListener('click', resetAll);
});

/* ---------- 카드 3×2 ---------- */
function renderGrid() {
  $('resultGrid').innerHTML = allGroups.map(({ group, summary, members }) => {
    const done = members.filter(isDone).length;
    const full = done === MEMBER_COUNT;
    return `
      <article class="group-card" data-g="${group}" tabindex="0" role="button" aria-label="${group}모둠 크게 보기">
        <div class="card-head">
          <h2 class="card-name">${group}모둠</h2>
          <span class="progress-pill${full ? ' is-full' : ''}">작성 완료 ${done}/${MEMBER_COUNT}명</span>
        </div>
        ${isDone(summary) ? `
          <dl class="sum-item"><dt class="strength">👍 장점</dt><dd>${escapeHtml(summary.strength || '-')}</dd></dl>
          <dl class="sum-item"><dt class="limit">🤔 한계</dt><dd>${escapeHtml(summary.limit || '-')}</dd></dl>
        ` : '<p class="sum-empty">아직 정리 전이에요</p>'}
        <div class="card-foot">
          <span class="card-time">${summary ? formatTime(summary.updatedAt) : ''}</span>
          <button type="button" class="btn btn-ghost danger-ghost" data-act="reset">초기화</button>
        </div>
      </article>`;
  }).join('');
}

/* ---------- 크게 보기 ---------- */
function openDetail(g) {
  openGroup = g;
  renderDetail(g);
  $('detail').hidden = false;
  $('detailClose').focus();
}

function closeDetail() {
  $('detail').hidden = true;
  const card = document.querySelector(`.group-card[data-g="${openGroup}"]`);
  openGroup = null;
  if (card) card.focus();
}

function renderDetail(g) {
  const data = allGroups.find((x) => x.group === g);
  if (!data) return;
  const { summary, members } = data;
  const box = document.querySelector('.detail');
  box.style.setProperty('--gc', `var(--g${g})`);
  $('detailTitle').textContent = `${g}모둠 — 작성 완료 ${members.filter(isDone).length}/${MEMBER_COUNT}명`;

  const item = (label, cls, text) =>
    `<dl class="sum-item"><dt class="${cls}">${label}</dt><dd>${escapeHtml(text || '-')}</dd></dl>`;

  $('detailBody').innerHTML = `
    <div class="detail-summary">
      <h3>우리 모둠이 찾은 AI의 장점 / 한계</h3>
      ${isDone(summary)
        ? item('👍 장점', 'strength', summary.strength) + item('🤔 한계', 'limit', summary.limit)
        : '<p class="sum-empty" style="grid-column:1/-1;min-height:3em">아직 정리 전이에요</p>'}
    </div>
    <div class="detail-members">
      ${members.map((m) => `
        <section class="member-box">
          <h3>${m.member}번 <small>${isDone(m) ? formatTime(m.updatedAt) : ''}</small></h3>
          ${isDone(m)
            ? item('👍 장점', 'strength', m.strength) + item('🤔 한계', 'limit', m.limit)
            : '<p class="sum-empty">아직 작성 중이에요</p>'}
        </section>`).join('')}
    </div>`;
}

/* ---------- 초기화 ---------- */
async function resetGroup(g) {
  const ok = await confirmDialog(
    `${g}모둠의 모둠 정리와 1~${MEMBER_COUNT}번 생각을 모두 지울까요?\n\n초기화 전에 결과 내보내기를 먼저 하세요.`,
    { okText: `${g}모둠 초기화`, cancelText: '취소', danger: true }
  );
  if (!ok) return;
  await DB.resetGroup(g);
  showToast(`${g}모둠을 초기화했어요`);
  watcher.refresh();
}

async function resetAll() {
  const ok = await confirmDialog(
    `1~${GROUP_COUNT}모둠의 모든 결과를 지울까요?\n되돌릴 수 없어요.\n\n초기화 전에 결과 내보내기를 먼저 하세요.`,
    { okText: '전체 초기화', cancelText: '취소', danger: true }
  );
  if (!ok) return;
  await DB.resetAll();
  if (openGroup) closeDetail();
  showToast('전체 결과를 초기화했어요');
  watcher.refresh();
}

/* ---------- CSV 내보내기 ---------- */
function fullTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function exportCSV() {
  const groups = await DB.getAllGroups(); // 내보내는 순간의 최신 데이터
  const rows = [['모둠', '구분', '장점', '한계', '수정시각']];
  groups.forEach(({ group, summary, members }) => {
    rows.push([`${group}모둠`, '모둠정리', summary?.strength, summary?.limit, fullTime(summary?.updatedAt)]);
    members.forEach((m) => {
      rows.push([`${group}모둠`, `${m.member}번`, m.strength, m.limit, fullTime(m.updatedAt)]);
    });
  });
  downloadCSV(`${todayStamp()}_AI리터러시_결과.csv`, rows);
  showToast('CSV 파일을 내려받았어요');
}
