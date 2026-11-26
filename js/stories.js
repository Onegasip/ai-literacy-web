/* stories.js — 번호·이름 고르기
 *  위: 우리 모둠이 맡은 이야기 (common.js GROUP_STORY)
 *  1~MEMBER_COUNT번 중 하나를 고르고 이름(성 빼고)을 적는다 → DB.claimMember (트랜잭션)
 *  같은 모둠에서 한 번호는 한 기기만: 다른 기기가 고른 번호는 "○○ 골랐어요" + 비활성화
 *  이미 고른 번호가 있으면 미리 골라 두고, [내 생각 쓰러 가기]도 보여 준다
 */

document.addEventListener('DOMContentLoaded', () => {
  const student = requireStudent();
  if (!student) return;
  const { group } = student;
  const deviceId = getDeviceId();
  const storyNo = storyOf(group);

  const $ = (id) => document.getElementById(id);
  const grid = $('numberGrid');
  const nameInput = $('nameInput');
  const goBtn = $('goBtn');
  const thoughtBtn = $('thoughtBtn');

  let members = null;   // DB에서 받은 1~5번 상태 (null = 아직 못 받음)
  let selected = null;  // 고른 번호
  let nameTouched = false;
  let busy = false;

  /* ---------- 우리 모둠이 맡은 이야기 ---------- */
  $('ourStoryLabel').textContent = `${group}모둠이 맡은 이야기 · 이야기 ${storyNo}`;
  loadJSON(`data/stories/story${storyNo}.json`).then((story) => {
    $('ourStoryTitle').textContent = story.title || `이야기 ${storyNo}`;
    $('ourStoryIntro').textContent = story.intro || '';
    const first = (story.scenes || []).find((sc) => sc.image)?.image || story.poster;
    if (first) {
      const img = new Image();
      img.alt = '';
      img.onerror = () => img.remove();
      img.src = ROOT + first;
      $('ourStoryThumb').replaceChildren(img);
    }
  }).catch(() => {
    $('ourStoryTitle').textContent = `이야기 ${storyNo}`;
    $('ourStoryIntro').textContent = '이야기 정보를 불러오지 못했어요.';
  });

  /* ---------- 이름 ---------- */
  if (student.name) nameInput.value = student.name;
  nameInput.addEventListener('input', () => {
    nameTouched = true;
    if (cleanName(nameInput.value)) { $('nameError').hidden = true; nameInput.classList.remove('is-invalid'); }
  });

  /* ---------- 번호 버튼 ---------- */
  const mine = () => members?.find((m) => m.claimedBy === deviceId) || null;

  function stateOf(n) {
    if (!members) return 'loading';
    const m = members.find((x) => x.member === n);
    if (!m?.claimedBy) return 'free';
    return m.claimedBy === deviceId ? 'mine' : 'taken';
  }

  function render() {
    const my = mine();
    if (my && selected === null) selected = my.member;
    if (my && !nameTouched && my.name) nameInput.value = my.name;
    if (selected !== null && stateOf(selected) === 'taken') selected = null; // 고르려던 번호를 친구가 먼저 고름

    grid.innerHTML = '';
    for (let n = 1; n <= MEMBER_COUNT; n++) {
      const st = stateOf(n);
      const m = members?.find((x) => x.member === n);
      const label = {
        loading: '확인 중…',
        free: n === 1 ? '기록 담당' : '비어 있어요',
        mine: '✔ 내 번호',
        taken: `🔒 ${m?.name || '친구'}`,
      }[st];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `num-btn is-${st}` + (selected === n ? ' is-selected' : '');
      btn.dataset.m = n;
      btn.setAttribute('aria-pressed', String(selected === n));
      btn.setAttribute('aria-label', `${n}번 — ${st === 'taken' ? (m?.name || '친구') + '이(가) 골랐어요' : label}`);
      btn.disabled = st === 'taken' || st === 'loading' || busy;
      btn.innerHTML = `<span class="num">${n}</span><span class="num-state">${escapeHtml(label)}</span>`;
      grid.appendChild(btn);
    }
    thoughtBtn.hidden = !my;
    goBtn.textContent = my && selected === my.member ? '📖 이야기 다시 보기' : '📖 이야기 읽으러 가기';
    goBtn.disabled = busy;
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.num-btn');
    if (!btn || btn.disabled) return;
    selected = Number(btn.dataset.m);
    $('numberError').hidden = true;
    render();
    if (!cleanName(nameInput.value)) nameInput.focus();
  });

  /* 모둠 선택 상태 실시간 */
  DB.watchGroup(group, (data) => {
    members = data.members;
    render();
  });
  render();

  /* ---------- 고르기 → 이야기 / 내 생각 ---------- */
  async function claimThen(next) {
    if (busy) return;
    const name = cleanName(nameInput.value);
    let bad = false;
    if (selected === null) { $('numberError').hidden = false; bad = true; }
    if (!name) {
      $('nameError').hidden = false;
      nameInput.classList.add('is-invalid');
      if (selected !== null) nameInput.focus();
      bad = true;
    }
    if (bad) { showToast(selected === null ? '번호를 골라 주세요' : '이름을 적어 주세요'); return; }

    busy = true;
    render();
    try {
      const res = await DB.claimMember(group, selected, deviceId, name);
      if (res.ok) {
        setStudent({ member: selected, name });
        goTo(next);
        return;
      }
      if (res.reason === 'taken') {
        showToast(`${selected}번은 다른 친구가 먼저 골랐어요`, 3000);
        selected = null;
      } else if (res.reason === 'locked') {
        selected = res.member;
        setStudent({ member: res.member });
        await confirmDialog(
          `이미 ${res.member}번으로 글을 썼어요.\n번호를 바꾸려면 선생님께 [선택 풀기]를 부탁하세요.`,
          { okText: '알겠어요', cancelText: '닫기' }
        );
      }
    } catch (err) {
      console.error(err);
      showToast('연결이 안 돼요. 잠시 뒤 다시 눌러 주세요', 3000);
    }
    busy = false;
    render();
  }

  $('pickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    claimThen('student/story.html');
  });
  thoughtBtn.addEventListener('click', () => {
    const my = mine();
    if (my) selected = my.member;
    claimThen('student/my-thought.html');
  });
});
