/* results.js — 교사: 1~6모둠 결과 모아보기, 크게 보기, 초기화, CSV 내보내기
 *  데이터는 DB.watchAll 로만 읽는다 (Firebase 실시간으로 교체 가능)
 */

const $ = (id) => document.getElementById(id);

let allGroups = [];   // 마지막으로 받은 전체 데이터
let openGroup = null; // 크게 보기 중인 모둠 번호
let watcher = null;

const isDone = (m) => Boolean(m && (m.strength || m.limit));

/** 작성 완료 / 참여 인원 — 참여 = 이야기를 고른 학생(+ 선택이 풀렸지만 글이 있는 학생) */
function progressOf(members) {
  const joined = members.filter((m) => m.claimedBy || isDone(m)).length;
  const done = members.filter(isDone).length;
  return { done, joined, full: joined > 0 && done === joined };
}
const progressText = ({ done, joined }) =>
  joined === 0 ? '아직 고른 학생 없음' : `작성 완료 ${done}/${joined}명`;

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

  $('detailBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-release]');
    if (btn && openGroup) releaseMember(openGroup, Number(btn.dataset.release));
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
    const p = progressOf(members);
    return `
      <article class="group-card" data-g="${group}" tabindex="0" role="button" aria-label="${group}모둠 크게 보기">
        <div class="card-head">
          <h2 class="card-name">${group}모둠</h2>
          <span class="progress-pill${p.full ? ' is-full' : ''}">${progressText(p)}</span>
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
  $('detailTitle').textContent = `${g}모둠 — ${progressText(progressOf(members))}`;

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
        <section class="member-box${m.claimedBy ? '' : ' is-unclaimed'}">
          <h3>${m.member}번 <small>${isDone(m) ? formatTime(m.updatedAt) : ''}</small></h3>
          <div class="member-text">
            ${isDone(m)
              ? item('👍 장점', 'strength', m.strength) + item('🤔 한계', 'limit', m.limit)
              : `<p class="sum-empty">${m.claimedBy ? '아직 작성 중이에요' : '아직 고른 학생이 없어요'}</p>`}
          </div>
          <div class="member-foot">
            ${m.claimedBy
              ? `<button type="button" class="btn btn-ghost release-btn" data-release="${m.member}">선택 풀기</button>`
              : `<span class="claim-none">${isDone(m) ? '선택 풀림 — 학생이 다시 고를 수 있어요' : ''}</span>`}
          </div>
        </section>`).join('')}
    </div>`;
}

/* ---------- 선택 풀기 (학생 한 명) ---------- */
async function releaseMember(g, m) {
  const ok = await confirmDialog(
    `${g}모둠 ${m}번 학생의 이야기 선택을 풀까요?\n\n쓴 글은 그대로 남아요.\n그 학생은 이야기 선택 화면에서 다시 골라야 해요.`,
    { okText: '선택 풀기', cancelText: '취소' }
  );
  if (!ok) return;
  try {
    await DB.releaseMember(g, m);
    showToast(`${g}모둠 ${m}번 선택을 풀었어요`);
  } catch (err) {
    console.error(err);
    showToast('선택을 풀지 못했어요. 연결을 확인해 주세요', 3000);
  }
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
    `1~${GROUP_COUNT}모둠의 모든 결과와\nAI 활용 판단 O/X 기록을 모두 지울까요?\n되돌릴 수 없어요.\n\n초기화 전에 결과 내보내기를 먼저 하세요.`,
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

  // AI 활용 판단 O/X 기록 (judge-cases.json 순서대로, 사례 제목 함께)
  const judges = await DB.getAllJudges();
  let cases = [];
  try {
    const data = await loadJSON('data/judge-cases.json');
    cases = Array.isArray(data.cases) ? data.cases : [];
  } catch (e) {
    console.warn('judge-cases.json 읽기 실패 — 사례 id만 내보냅니다', e);
  }
  const ids = cases.map((c, i) => String(c.id ?? `case${i + 1}`));
  Object.keys(judges).forEach((id) => { if (!ids.includes(id)) ids.push(id); });

  if (ids.length) {
    rows.push([]);
    rows.push(['AI 활용 판단']);
    rows.push(['사례 ID', '사례 제목', '처음 O', '처음 X', '최종 O', '최종 X', '수정시각']);
    ids.forEach((id) => {
      const c = cases.find((x, i) => String(x.id ?? `case${i + 1}`) === id);
      const j = judges[id] || {};
      rows.push([id, c?.title || '', j.firstO ?? '', j.firstX ?? '', j.finalO ?? '', j.finalX ?? '', fullTime(j.updatedAt)]);
    });
  }

  downloadCSV(`${todayStamp()}_AI리터러시_결과.csv`, rows);
  showToast('CSV 파일을 내려받았어요');
}
