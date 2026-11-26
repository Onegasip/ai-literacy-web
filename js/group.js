/* group.js — 모둠 생각 모으기
 *  위: 1~4번 친구 생각(보기만)  아래: 모둠 공동 정리(1번 기록 담당만 입력)
 *  데이터는 DB.watchGroup 으로만 읽는다 (Firebase 실시간으로 교체 가능)
 */

const RECORDER = 1; // 모둠 정리를 쓰는 번호

document.addEventListener('DOMContentLoaded', () => {
  const student = requireStudent(true);
  if (!student) return;
  const { group, member } = student;
  const deviceId = getDeviceId();
  const isRecorder = member === RECORDER;

  document.getElementById('groupTitle').textContent = `${group}모둠 생각 모으기`;

  const grid = document.getElementById('memberGrid');
  const fields = {
    strength: document.getElementById('strength'),
    limit: document.getElementById('limit'),
  };
  const errors = {
    strength: document.getElementById('strengthError'),
    limit: document.getElementById('limitError'),
  };
  const saveState = document.getElementById('saveState');
  const saveBtn = document.getElementById('saveBtn');
  const counters = Object.values(fields).map(attachCharCounter); // "120 / 300"
  let dirty = false;
  let lastMembers = null;

  /* 이야기 제목 (카드 머리에 표시, 실패하면 "이야기 N") */
  const titles = {};
  Promise.allSettled(
    Array.from({ length: MEMBER_COUNT }, (_, i) => loadJSON(`data/stories/story${i + 1}.json`))
  ).then((results) => {
    results.forEach((r, i) => { if (r.status === 'fulfilled') titles[i + 1] = r.value.title; });
    if (lastMembers) renderMembers(lastMembers);
  });

  /* ---------- 기록 담당 / 보기 전용 ---------- */
  const note = document.getElementById('recorderNote');
  if (isRecorder) {
    note.textContent = '✏️ 나는 기록 담당! 친구들 생각을 모아서 정리해요.';
  } else {
    note.textContent = `👀 ${RECORDER}번 친구가 정리해요. 함께 이야기 나누며 지켜봐요.`;
    Object.values(fields).forEach((el) => {
      el.readOnly = true;
      el.placeholder = `${RECORDER}번 친구가 아직 정리하지 않았어요.`;
    });
    saveBtn.hidden = true;
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

  /* ---------- 친구 카드 ---------- */
  function renderMembers(members) {
    lastMembers = members;
    grid.innerHTML = members.map((m) => {
      const me = m.member === member;
      const done = m.strength || m.limit;
      const title = titles[m.member] ? `이야기 ${m.member} ${titles[m.member]}` : `이야기 ${m.member}`;
      return `
        <article class="member-card${me ? ' is-me' : ''}">
          <div class="member-head">
            <span class="member-num">${m.member}</span>
            <span class="member-story">${escapeHtml(title)}</span>
            ${me ? '<span class="me-tag">나</span>' : ''}
          </div>
          ${done ? `
            <dl class="member-item"><dt class="strength">👍 장점</dt><dd>${escapeHtml(m.strength || '-')}</dd></dl>
            <dl class="member-item"><dt class="limit">🤔 한계</dt><dd>${escapeHtml(m.limit || '-')}</dd></dl>
          ` : `<p class="member-empty">${m.claimedBy ? '아직 작성 중이에요' : '아직 이 이야기를 고른 친구가 없어요'}</p>`}
          <div class="member-foot">
            <span class="member-time">${done ? formatTime(m.updatedAt) : ''}</span>
            ${me ? '<button type="button" class="btn btn-ghost edit-btn" data-act="edit">내 생각 고치기</button>' : ''}
          </div>
        </article>`;
    }).join('');
  }

  /* 내 생각 고치기 — 카드를 새로 그려도 동작하도록 위임 */
  grid.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="edit"]')) return;
    if (dirty) {
      const ok = await confirmDialog('모둠 정리를 아직 저장하지 않았어요.\n저장하지 않고 넘어갈까요?', {
        okText: '그냥 넘어가기', cancelText: '돌아가기',
      });
      if (!ok) return;
      dirty = false; // 브라우저 경고창이 또 뜨지 않게
    }
    goTo('student/my-thought.html');
  });

  /* ---------- 모둠 정리 ---------- */
  function renderSummary(summary) {
    // 기록 담당이 고치는 중이면 입력 내용을 덮어쓰지 않는다
    if (isRecorder && dirty) return;
    fields.strength.value = summary?.strength || '';
    fields.limit.value = summary?.limit || '';
    counters.forEach((update) => update());
    setState(summary ? 'saved' : 'none', summary?.updatedAt);
  }

  if (isRecorder) {
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

    document.getElementById('summaryForm').addEventListener('submit', async (e) => {
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
      saveState.className = 'save-state';
      saveState.textContent = '저장하는 중…';
      const doneNotice = slowSaveNotice(); // 3.5초 넘게 걸리면 "인터넷이 끊겼어요" 안내
      try {
        const doc = await DB.saveGroupSummary(group, data);
        doneNotice();
        // 저장하는 동안 글을 더 고쳤으면 '저장됨'이 아니다
        const now = { strength: fields.strength.value.trim(), limit: fields.limit.value.trim() };
        if (now.strength === data.strength && now.limit === data.limit) {
          dirty = false;
          setState('saved', doc.updatedAt);
          showToast('모둠 정리를 저장했어요!');
        } else {
          setState('dirty');
          showToast('고친 내용이 있어요. 한 번 더 저장해 주세요');
        }
      } catch (err) {
        doneNotice();
        console.error(err);
        setState('dirty');
        showToast('저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요', 3000);
      }
    });

    // 페이지를 닫거나 새로고침할 때 저장 안 한 내용 경고
    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  } else {
    document.getElementById('summaryForm').addEventListener('submit', (e) => e.preventDefault());
  }

  /* ---------- 자동 새로고침 (DB.watchGroup) ---------- */
  DB.watchGroup(group, ({ summary, members }) => {
    // 내 선택이 풀렸으면(선생님 [선택 풀기]·모둠 초기화) 이야기 다시 고르기
    const me = members.find((m) => m.member === member);
    if (me?.claimedBy !== deviceId) {
      dirty = false;
      leaveReleased();
      return;
    }
    renderMembers(members);
    renderSummary(summary);
  });
});
