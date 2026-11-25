/* stories.js — 이야기 1~4 선택. 고른 이야기 번호 = 학생 번호 */

document.addEventListener('DOMContentLoaded', async () => {
  const student = requireStudent();
  if (!student) return;

  const grid = document.getElementById('storyGrid');
  grid.innerHTML = '<p class="muted center">이야기를 불러오는 중…</p>';

  // story1~4.json 을 한꺼번에 읽는다. 하나가 실패해도 나머지는 보여준다.
  const ids = Array.from({ length: MEMBER_COUNT }, (_, i) => i + 1);
  const results = await Promise.allSettled(
    ids.map((id) => loadJSON(`data/stories/story${id}.json`))
  );

  grid.innerHTML = '';
  results.forEach((r, i) => {
    const id = ids[i];
    const story = r.status === 'fulfilled' ? r.value : null;
    if (!story) console.warn(`story${id}.json 읽기 실패`, r.reason);
    grid.appendChild(makeCard(id, story, student.member === id));
  });
});

function makeCard(id, story, picked) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'story-card' + (picked ? ' is-picked' : '') + (story ? '' : ' is-error');

  const title = story ? story.title : `이야기 ${id}`;
  const intro = story ? story.intro : '이야기를 불러오지 못했어요.';

  card.innerHTML = `
    <span class="story-num">${id}</span>
    <span class="story-body">
      <span class="story-name">${escapeHtml(title)}</span>
      <span class="story-intro">${escapeHtml(intro)}</span>
      ${picked ? '<span class="story-picked-tag">✔ 내가 고른 이야기</span>' : ''}
    </span>`;

  card.disabled = !story;
  card.addEventListener('click', () => {
    setStudent({ member: id });
    goTo(`student/story.html?id=${id}`);
  });
  return card;
}
