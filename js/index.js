/* index.js — 첫 화면: 모둠 선택 + 교사 비밀번호 */

document.addEventListener('DOMContentLoaded', () => {
  /* 1~6모둠 버튼 만들기 */
  const grid = document.getElementById('groupGrid');
  for (let g = 1; g <= GROUP_COUNT; g++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn group-btn';
    btn.dataset.g = g;
    btn.innerHTML = `<span class="group-num">${g}</span><span class="group-label">모둠</span>`
      + `<span class="group-story" data-story="${storyOf(g)}">이야기 ${storyOf(g)}</span>`;
    btn.addEventListener('click', () => {
      // 모둠을 새로 고르면 번호는 이야기 선택 화면에서 다시 정한다
      setStudent({ group: g, member: null });
      goTo('student/stories.html');
    });
    grid.appendChild(btn);
  }

  /* 모둠이 맡은 이야기 제목 (불러오지 못하면 "이야기 N" 그대로) */
  grid.querySelectorAll('.group-story').forEach((el) => {
    loadJSON(`data/stories/story${el.dataset.story}.json`)
      .then((story) => { if (story.title) el.textContent = story.title; })
      .catch(() => {});
  });

  /* 교사 비밀번호 창 */
  const modal = document.getElementById('pwModal');
  const form = document.getElementById('pwForm');
  const input = document.getElementById('pwInput');
  const error = document.getElementById('pwError');

  const openModal = () => {
    input.value = '';
    error.hidden = true;
    modal.hidden = false;
    input.focus();
  };
  const closeModal = () => { modal.hidden = true; };

  document.getElementById('teacherBtn').addEventListener('click', openModal);
  document.getElementById('pwCancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (teacherLogin(input.value)) {
      goTo('teacher/results.html');
    } else {
      error.hidden = false;
      input.select();
    }
  });
});
