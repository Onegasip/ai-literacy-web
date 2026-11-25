/* my-thought.js — 내가 찾은 AI의 장점/한계 쓰기 → DB.saveMember */

document.addEventListener('DOMContentLoaded', async () => {
  const student = requireStudent();
  if (!student) return;
  if (!student.member) {          // 번호(=이야기)를 아직 안 골랐으면
    goTo('student/stories.html');
    return;
  }
  const { group, member } = student;

  const form = document.getElementById('thoughtForm');
  const fields = {
    strength: document.getElementById('strength'),
    limit: document.getElementById('limit'),
  };
  const errors = {
    strength: document.getElementById('strengthError'),
    limit: document.getElementById('limitError'),
  };
  const saveState = document.getElementById('saveState');
  const nextBox = document.getElementById('nextBox');
  let dirty = false;

  document.getElementById('backBtn').href = `story.html?id=${member}`;

  /* 위쪽 "○모둠 ○번 · 이야기 N 제목" */
  const who = document.getElementById('who');
  who.textContent = `${group}모둠 ${member}번 · 이야기 ${member}`;
  loadJSON(`data/stories/story${member}.json`)
    .then((story) => { if (story.title) who.textContent = `${group}모둠 ${member}번 · 이야기 ${member} ${story.title}`; })
    .catch(() => {});

  /* 저장된 내용 불러오기 */
  const saved = await DB.getMember(group, member);
  if (saved) {
    fields.strength.value = saved.strength || '';
    fields.limit.value = saved.limit || '';
    if (saved.strength && saved.limit) {
      setState('saved', saved.updatedAt);
      nextBox.hidden = false;
    }
  }

  function setState(kind, time) {
    saveState.className = 'save-state';
    if (kind === 'saved') {
      saveState.classList.add('is-saved');
      saveState.textContent = `✔ 저장됨 ${formatTime(time)}`;
    } else if (kind === 'dirty') {
      saveState.classList.add('is-dirty');
      saveState.textContent = '저장하지 않은 내용이 있어요';
    } else {
      saveState.textContent = '';
    }
  }

  /* 고치는 중이면 안내, 빨간 표시 지우기 */
  Object.entries(fields).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      dirty = true;
      setState('dirty');
      if (el.value.trim()) {
        el.classList.remove('is-invalid');
        errors[key].hidden = true;
      }
    });
  });

  /* 저장하기 */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      strength: fields.strength.value.trim(),
      limit: fields.limit.value.trim(),
    };

    let firstEmpty = null;
    Object.keys(fields).forEach((key) => {
      const empty = !data[key];
      fields[key].classList.toggle('is-invalid', empty);
      errors[key].hidden = !empty;
      if (empty && !firstEmpty) firstEmpty = fields[key];
    });
    if (firstEmpty) {
      showToast('빈칸을 채워 주세요');
      firstEmpty.focus();
      return;
    }

    try {
      const doc = await DB.saveMember(group, member, data);
      dirty = false;
      setState('saved', doc.updatedAt);
      showToast('저장했어요!');
      nextBox.hidden = false;
    } catch (err) {
      console.error(err);
      showToast('저장하지 못했어요. 다시 눌러 주세요');
    }
  });

  /* 모둠으로 — 저장 안 한 내용이 있으면 확인 */
  document.getElementById('groupBtn').addEventListener('click', async () => {
    if (dirty) {
      const ok = await confirmDialog('고친 내용을 아직 저장하지 않았어요.\n저장하지 않고 넘어갈까요?', {
        okText: '그냥 넘어가기', cancelText: '돌아가기',
      });
      if (!ok) return;
    }
    goTo('student/group.html');
  });
});
