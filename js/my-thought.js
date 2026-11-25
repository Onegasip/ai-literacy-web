/* my-thought.js — 내가 찾은 AI의 장점/한계 쓰기 → DB.saveMember */

document.addEventListener('DOMContentLoaded', async () => {
  const student = requireStudent(true);
  if (!student) return;
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

  const current = () => ({
    strength: fields.strength.value.trim(),
    limit: fields.limit.value.trim(),
  });
  const same = (a, b) => a.strength === b.strength && a.limit === b.limit;

  function setState(kind, time) {
    saveState.className = 'save-state';
    if (kind === 'saved') {
      saveState.classList.add('is-saved');
      saveState.textContent = `✔ 저장됨 ${formatTime(time)}`;
    } else if (kind === 'dirty') {
      saveState.classList.add('is-dirty');
      saveState.textContent = '저장하지 않은 내용이 있어요';
    } else if (kind === 'saving') {
      saveState.textContent = '저장하는 중…';
    } else {
      saveState.textContent = '';
    }
  }

  /* ---------- 이벤트 연결을 먼저 (불러오기가 실패해도 저장 버튼이 동작하도록) ---------- */

  const counters = Object.values(fields).map(attachCharCounter); // "120 / 300"

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = current();

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

    setState('saving');
    try {
      const doc = await DB.saveMember(group, member, data);
      nextBox.hidden = false;
      // 저장하는 동안 글을 더 고쳤으면 '저장됨'이 아니다
      if (same(current(), data)) {
        dirty = false;
        setState('saved', doc.updatedAt);
        showToast('저장했어요!');
      } else {
        setState('dirty');
        showToast('고친 내용이 있어요. 한 번 더 저장해 주세요');
      }
    } catch (err) {
      console.error(err);
      setState('dirty');
      showToast('저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요', 3000);
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.getElementById('groupBtn').addEventListener('click', async () => {
    if (dirty) {
      const ok = await confirmDialog('고친 내용을 아직 저장하지 않았어요.\n저장하지 않고 넘어갈까요?', {
        okText: '그냥 넘어가기', cancelText: '돌아가기',
      });
      if (!ok) return;
      dirty = false; // 브라우저 경고창이 또 뜨지 않게
    }
    goTo('student/group.html');
  });

  /* ---------- 위쪽 "○모둠 ○번 · 이야기 N 제목" ---------- */
  const who = document.getElementById('who');
  who.textContent = `${group}모둠 ${member}번 · 이야기 ${member}`;
  loadJSON(`data/stories/story${member}.json`)
    .then((story) => { if (story.title) who.textContent = `${group}모둠 ${member}번 · 이야기 ${member} ${story.title}`; })
    .catch(() => {});

  /* ---------- 저장된 내용 불러오기 (실패해도 쓰던 글은 그대로) ---------- */
  let saved;
  try {
    saved = await DB.getMember(group, member);
  } catch (err) {
    console.warn(err);
    showToast('저장된 글을 불러오지 못했어요. 새로 써도 저장할 수 있어요', 3500);
    return;
  }

  // 선택이 풀렸거나(선생님 [선택 풀기]·모둠 초기화) 다른 기기의 번호면 다시 고르기
  if (saved?.claimedBy !== getDeviceId()) {
    dirty = false;
    leaveReleased();
    return;
  }

  // 불러오는 동안 이미 쓰기 시작했으면 덮어쓰지 않는다
  if (!dirty) {
    fields.strength.value = saved.strength || '';
    fields.limit.value = saved.limit || '';
    counters.forEach((update) => update());
    if (saved.strength && saved.limit) {
      setState('saved', saved.updatedAt);
      nextBox.hidden = false;
    }
  }
});
