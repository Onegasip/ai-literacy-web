/* story.js — 이야기 보기. story.html?id=N → data/stories/storyN.json
 *  mode "scenes": 화면을 누르거나 [다음]/[이전]으로 장면 이동
 *  mode "video" : 영상 재생, 끝나면 [적으러 가기] 버튼
 */

const $ = (id) => document.getElementById(id);

/* 화자 종류 → 이름표 색. JSON에 role이 없으면 이름으로 추측 */
function getRole(scene) {
  if (['narrator', 'student', 'ai'].includes(scene.role)) return scene.role;
  const name = String(scene.speaker || '').trim();
  if (name === '' || name === '해설') return 'narrator';
  if (/^ai$/i.test(name) || name.includes('AI')) return 'ai';
  return 'student';
}

/* 그림/영상 자리에 "준비 중" 박스 넣기 */
function showPlaceholder(box, text) {
  box.innerHTML = `<div class="media-placeholder">${escapeHtml(text)}</div>`;
}

function goWrite() {
  goTo('student/my-thought.html');
}

document.addEventListener('DOMContentLoaded', async () => {
  const student = requireStudent();
  if (!student) return;

  // id는 숫자만, 1~MEMBER_COUNT (1abc 같은 주소는 막기)
  const raw = getParam('id') || '';
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(id >= 1 && id <= MEMBER_COUNT)) {
    goTo('student/stories.html');
    return;
  }
  // 이야기 번호 = 학생 번호. 이야기 선택 화면에서 고른(claim) 이야기만 볼 수 있다
  if (student.member !== id) {
    setFlash('이야기 선택 화면에서 이야기를 골라 주세요');
    goTo('student/stories.html');
    return;
  }
  if ((await checkClaim(student)) === false) {
    leaveReleased();
    return;
  }

  let story;
  try {
    story = await loadJSON(`data/stories/story${id}.json`);
  } catch (e) {
    console.warn(e);
    $('errorBox').hidden = false;
    return;
  }

  $('storyTitle').textContent = story.title || `이야기 ${id}`;
  document.title = `${story.title || '이야기 ' + id} — 이야기 보기`;
  $('finishBtn').addEventListener('click', goWrite);

  if (story.mode === 'video') {
    startVideo(story);
  } else {
    startScenes(story);
  }
});

/* ---------- 장면 모드 ---------- */
function startScenes(story) {
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (scenes.length === 0) {
    $('errorBox').hidden = false;
    return;
  }

  const stage = $('sceneStage');
  const media = $('sceneMedia');
  const talk = stage.querySelector('.scene-talk');
  let index = 0;

  stage.hidden = false;
  $('storyNav').hidden = false;
  $('progressBar').hidden = false;

  function render() {
    const scene = scenes[index];
    const isLast = index === scenes.length - 1;

    // 그림 — 없거나 못 읽으면 회색 박스
    if (scene.image) {
      const img = new Image();
      img.alt = scene.alt || '';
      img.onerror = () => showPlaceholder(media, '그림 준비 중');
      img.src = ROOT + scene.image;
      media.replaceChildren(img);
    } else {
      showPlaceholder(media, '그림 준비 중');
    }

    talk.dataset.role = getRole(scene);
    $('speakerTag').textContent = scene.speaker || '';
    $('sceneText').textContent = scene.text || '';

    $('progress').textContent = `${index + 1} / ${scenes.length}`;
    $('progressFill').style.width = `${((index + 1) / scenes.length) * 100}%`;

    $('prevBtn').disabled = index === 0;
    $('nextBtn').hidden = isLast;
    $('finishBtn').hidden = !isLast;
    $('tapHint').hidden = isLast;
    stage.classList.toggle('is-last', isLast);
  }

  const next = () => { if (index < scenes.length - 1) { index++; render(); } };
  const prev = () => { if (index > 0) { index--; render(); } };

  // 화면 아무 곳이나 누르면 다음 (아래 버튼 영역은 따로 처리)
  stage.addEventListener('click', next);
  $('nextBtn').addEventListener('click', next);
  $('prevBtn').addEventListener('click', prev);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('button, a')) return; // 버튼에 포커스가 있으면 버튼이 처리
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') prev();
  });

  render();
}

/* ---------- 영상 모드 ---------- */
function startVideo(story) {
  const box = $('videoMedia');
  const nav = $('storyNav');
  $('videoStage').hidden = false;

  // 영상 모드에서는 [이전]/[다음] 없이, 끝나면 [적으러 가기]만
  nav.classList.add('video-only');
  $('prevBtn').hidden = true;
  $('nextBtn').hidden = true;

  const showFinish = () => {
    nav.hidden = false;
    $('finishBtn').hidden = false;
  };

  if (!story.video) {
    showPlaceholder(box, '영상 준비 중');
    showFinish(); // 영상이 없으면 수업이 막히지 않게 바로 버튼 표시
    return;
  }

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  if (story.poster) video.poster = ROOT + story.poster;
  video.src = ROOT + story.video;
  video.addEventListener('ended', showFinish);
  video.addEventListener('error', () => {
    showPlaceholder(box, '영상 준비 중');
    showFinish();
  });
  box.replaceChildren(video);
}
