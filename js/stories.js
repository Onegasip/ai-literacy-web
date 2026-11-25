/* stories.js — 이야기 1~4 선택. 고른 이야기 번호 = 학생 번호
 *  같은 모둠에서 한 이야기는 한 기기만 고를 수 있다 (DB.claimMember)
 *  다른 기기가 고른 카드: "○번 친구가 골랐어요" + 비활성화 / 내 기기가 고른 카드: 다시 들어가기
 */

document.addEventListener('DOMContentLoaded', async () => {
  const student = requireStudent();
  if (!student) return;
  const { group } = student;
  const deviceId = getDeviceId();

  const grid = document.getElementById('storyGrid');
  grid.innerHTML = '<p class="muted center">이야기를 불러오는 중…</p>';

  const ids = Array.from({ length: MEMBER_COUNT }, (_, i) => i + 1);
  const stories = {};   // id → story JSON (실패하면 없음)
  let members = null;   // DB에서 받은 1~4번 상태 (null = 아직 못 받음)
  let busy = false;     // 고르는 중에는 다른 카드 막기

  /* 이야기 JSON — 하나가 실패해도 나머지는 보여준다 */
  const results = await Promise.allSettled(ids.map((id) => loadJSON(`data/stories/story${id}.json`)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') stories[ids[i]] = r.value;
    else console.warn(`story${ids[i]}.json 읽기 실패`, r.reason);
  });

  /* 모둠 선택 상태 실시간 */
  DB.watchGroup(group, (data) => {
    members = data.members;
    render();
  });
  render();

  function stateOf(id) {
    if (!members) return 'loading';
    const m = members.find((x) => x.member === id);
    if (!m?.claimedBy) return 'free';
    return m.claimedBy === deviceId ? 'mine' : 'taken';
  }

  function render() {
    grid.innerHTML = '';
    ids.forEach((id) => grid.appendChild(makeCard(id)));
  }

  function makeCard(id) {
    const story = stories[id];
    const state = stateOf(id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `story-card is-${state}` + (story ? '' : ' is-error');

    const title = story ? story.title : `이야기 ${id}`;
    const intro = story ? story.intro : '이야기를 불러오지 못했어요.';
    const tag = {
      mine: '<span class="story-tag tag-mine">✔ 내가 고른 이야기 — 다시 들어가기</span>',
      taken: `<span class="story-tag tag-taken">🔒 ${id}번 친구가 골랐어요</span>`,
      loading: '<span class="story-tag tag-loading">확인 중…</span>',
      free: '',
    }[state];

    card.innerHTML = `
      <span class="story-num">${id}</span>
      <span class="story-body">
        <span class="story-name">${escapeHtml(title)}</span>
        <span class="story-intro">${escapeHtml(intro)}</span>
        ${tag}
      </span>`;

    card.disabled = !story || state === 'taken' || state === 'loading' || busy;
    card.addEventListener('click', () => pick(id));
    return card;
  }

  async function pick(id) {
    if (busy) return;
    busy = true;
    render();
    try {
      const res = await DB.claimMember(group, id, deviceId);
      if (res.ok) {
        setStudent({ member: id });
        goTo(`student/story.html?id=${id}`);
        return;
      }
      if (res.reason === 'taken') {
        showToast(`${id}번 이야기는 다른 친구가 먼저 골랐어요`, 3000);
      } else if (res.reason === 'locked') {
        setStudent({ member: res.member });
        await confirmDialog(
          `이미 이야기 ${res.member}을(를) 골라서 글을 썼어요.\n다른 이야기로 바꾸려면 선생님께 [선택 풀기]를 부탁하세요.`,
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
});
