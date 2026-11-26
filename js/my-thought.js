/* my-thought.js — 내가 찾은 AI의 장점/한계 쓰기 → DB.saveMember
 *  선택이 풀리면(교사 [선택 풀기]·모둠 초기화) 저장하지 않고 이야기 선택 화면으로 보낸다
 *   - 화면을 보는 중: DB.watchGroup 으로 바로 알아챔
 *   - 저장 직전: checkClaim 으로 한 번 더 확인
 *   - 그래도 저장되면: 보안 규칙이 거절 → err.code 'released' */

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
  const deviceId = getDeviceId();
  const nextBox = document.getElementById('nextBox');
  let dirty = false;

  const storyNo = storyOf(group);
  document.getElementById('backBtn').href = 'story.html';

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
    const doneNotice = slowSaveNotice(); // 3.5초 넘게 걸리면 "인터넷이 끊겼어요" 안내
    try {
      // 저장 직전 확인: 선택이 풀렸으면 저장하지 않는다 (null = 연결 안 됨 → 막지 않음)
      const claim = await withTimeout(checkClaim(student), 2500, null);
      if (claim === false) {
        doneNotice();
        dirty = false;
        leaveReleased();
        return;
      }
      const doc = await DB.saveMember(group, member, data, deviceId);
      doneNotice();
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
      doneNotice();
      if (err?.code === 'released') {   // 저장하는 사이 선택이 풀림
        dirty = false;
        leaveReleased();
        return;
      }
      console.error(err);
      setState('dirty');
      showToast('저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요', 3000);
    }
  });

  /* 실시간: 내 선택이 풀리면 바로 안내하고 이야기 선택 화면으로 (group.js와 같은 방식) */
  DB.watchGroup(group, ({ members }) => {
    const me = members.find((m) => m.member === member);
    if (me?.claimedBy !== deviceId) {
      dirty = false;
      leaveReleased();
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
  let myName = student.name || '';
  let storyTitle = '';
  const showWho = () => {
    who.textContent = `${group}모둠 ${member}번 ${myName}`.trim() + ` · 이야기 ${storyNo}${storyTitle ? ' ' + storyTitle : ''}`;
  };
  showWho();
  loadJSON(`data/stories/story${storyNo}.json`)
    .then((story) => { storyTitle = story.title || ''; showWho(); })
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
  if (saved?.claimedBy !== deviceId) {
    dirty = false;
    leaveReleased();
    return;
  }

  // DB의 이름으로 다시 표시 (다른 기기에서 고친 이름도 반영)
  if (saved.name && saved.name !== myName) {
    myName = saved.name;
    setStudent({ name: myName });
    showWho();
    renderStudentBadge();
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
