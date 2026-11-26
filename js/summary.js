/* summary.js — data/summary.json 의 AI 능력/한계 정리를 하나씩 공개 */

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireTeacher()) return;

  let data;
  try {
    data = await loadJSON('data/summary.json');
  } catch (e) {
    console.warn(e);
    $('errorText').hidden = false;
    return;
  }

  if (data.title) {
    $('summaryTitle').textContent = data.title;
    document.title = data.title;
  }

  $('abilityList').innerHTML = (data.abilities || []).map(itemHtml).join('');
  $('limitList').innerHTML = (data.limits || []).map(itemHtml).join('');

  if (data.conclusion) {
    $('conclusionWrap').className = 'conclusion-wrap';
    $('conclusionWrap').innerHTML = `
      <button type="button" class="reveal conclusion" aria-expanded="false">
        <span class="reveal-cover">💡 핵심 문장 — 눌러서 확인해요</span>
        <span class="reveal-content">${escapeHtml(data.conclusion)}</span>
      </button>`;
  }

  /* 클릭하면 공개 / 다시 누르면 가리기 */
  document.querySelector('main').addEventListener('click', (e) => {
    const card = e.target.closest('.reveal');
    if (card) setOpen(card, !card.classList.contains('is-open'));
  });

  $('showAllBtn').addEventListener('click', () => allCards().forEach((c) => setOpen(c, true)));
  $('hideAllBtn').addEventListener('click', () => allCards().forEach((c) => setOpen(c, false)));
});

function itemHtml(item, i) {
  const stories = (item.stories || [])
    .map((n) => `<span class="story-chip">이야기 ${escapeHtml(n)}</span>`)
    .join('');
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

function allCards() {
  return document.querySelectorAll('.reveal');
}

function setOpen(card, open) {
  card.classList.toggle('is-open', open);
  card.setAttribute('aria-expanded', String(open));
}
