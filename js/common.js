/* =========================================================
 * common.js — 모든 페이지 공통 기능
 * 불러오는 순서: db.js → common.js → 페이지 js
 * ========================================================= */

/* ---------- 수업 구조 설정 (여기 한 곳만 바꾸면 된다) ----------
 * 모둠 수, 모둠당 인원(번호 1~MEMBER_COUNT), 모둠이 맡은 이야기 번호(data/stories/storyN.json)
 * ※ js/db.js · js/db.local.js 의 GROUPS / MEMBERS 와 firestore.rules 의 isGroup / isMember 도 같게 맞춘다 */
const GROUP_COUNT = 4;
const MEMBER_COUNT = 5;
const GROUP_STORY = { 1: 1, 2: 2, 3: 3, 4: 4 };

/** 모둠이 맡은 이야기 번호 */
function storyOf(group) {
  return GROUP_STORY[group] || 1;
}

/* 학생 이름: 성 빼고 이름만, 앞뒤 공백 제거, 1~NAME_MAX자 (firestore.rules 와 같게) */
const NAME_MAX = 10;
/** 이름 다듬기 → 올바르면 다듬은 이름, 아니면 '' */
function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= NAME_MAX ? name : '';
}

/* 우리 반 인원 — 판단 O/X 입력에서 처음/최종 각각 O+X가 이 수를 넘지 않게 */
const CLASS_SIZE = 20;

/* 교사 페이지 진입 비밀번호 (수업용 간단 잠금, 보안 기능 아님) */
const TEACHER_PASSWORD = '1234';

/* 현재 페이지가 하위 폴더(student/, teacher/)에 있으면 '../', 아니면 '' */
const ROOT = /\/(student|teacher)\/[^/]*$/.test(location.pathname) ? '../' : '';

/* ---------- 기기 설정 (localStorage) ----------
 * DB 데이터는 db.js에만. 여기서는 이 기기의 설정(학생 정보, 기기 ID)만 localStorage에 둔다.
 * 모둠 번호 + 학생 번호 + 이름(성 빼고, 화면 표시용 복사본) + 무작위 기기 ID */
const STUDENT_KEY = 'ailit-student';
const DEVICE_KEY = 'ailit-device';

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 기기 */ }
}

/** 이 기기의 고유 ID (처음 한 번 만들어 계속 사용) */
function getDeviceId() {
  let id = readLocal(DEVICE_KEY);
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = (crypto.randomUUID ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
    writeLocal(DEVICE_KEY, id);
  }
  return id;
}

/** 모둠·번호·이름 저장. 일부만 넘기면 기존 값과 합친다. 예) setStudent({group: 3}) */
function setStudent(info) {
  const next = { ...getStudent(), ...info };
  writeLocal(STUDENT_KEY, next);
  return next;
}

/** → {group, member, name} (없으면 빈 객체) */
function getStudent() {
  return readLocal(STUDENT_KEY) || {};
}

/** 필요한 정보가 없으면 안내와 함께 돌려보낸다.
 *  모둠이 없으면 첫 화면, needMember=true인데 번호가 없으면 이야기 선택 화면 */
function requireStudent(needMember = false) {
  const s = getStudent();
  if (!(s.group >= 1 && s.group <= GROUP_COUNT)) {   // 모둠 수가 바뀌어 없는 모둠이면 다시 고르기
    setFlash('모둠을 먼저 골라 주세요');
    location.href = ROOT + 'index.html';
    return null;
  }
  if (needMember && !(s.member >= 1 && s.member <= MEMBER_COUNT)) {
    setFlash('번호를 먼저 골라 주세요');
    location.href = ROOT + 'student/stories.html';
    return null;
  }
  return s;
}

/** 이 기기가 지금 고른 번호를 아직 가지고 있는지 DB에서 확인.
 *  → true(내 선택 맞음) / false(풀렸거나 다른 기기 것) / null(연결 실패 — 막지 않음) */
async function checkClaim(student) {
  try {
    const doc = await DB.getMember(student.group, student.member);
    return doc?.claimedBy === getDeviceId();
  } catch (e) {
    console.warn('[선택 확인 실패]', e);
    return null;
  }
}

/** 선택이 풀렸을 때: 번호 지우고 이야기 선택 화면으로 */
let leaving = false;
function leaveReleased() {
  if (leaving) return;
  leaving = true;
  setStudent({ member: null });
  setFlash('번호 선택이 풀렸어요. 번호를 다시 골라 주세요.');
  location.href = ROOT + 'student/stories.html';
}

/* ---------- 저장이 오래 걸릴 때 (인터넷 끊김) 안내 ----------
 * 저장을 시작할 때 부르고, 저장이 끝나면(성공·실패 모두) 반환된 함수를 부른다.
 * ms 안에 안 끝나면 화면 위에 큰 안내를 띄운다. Firebase는 연결되면 자동으로 저장한다. */
const SLOW_SAVE_MSG = '📶 인터넷이 끊겼어요. 연결되면 자동으로 저장돼요.\n화면을 끄거나 새로고침하지 마세요.';
function slowSaveNotice(ms = 3500) {
  const timer = setTimeout(() => showNetBanner(SLOW_SAVE_MSG), ms);
  return () => { clearTimeout(timer); hideNetBanner(); };
}
function showNetBanner(msg) {
  let el = document.querySelector('.net-banner');
  if (!el) {
    el = document.createElement('div');
    el.className = 'net-banner';
    el.setAttribute('role', 'alert');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
}
function hideNetBanner() {
  const el = document.querySelector('.net-banner');
  if (el) el.hidden = true;
}

/** 약속(Promise)이 ms 안에 안 끝나면 fallback 값으로 끝낸다 */
function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/* ---------- 다음 페이지에 보여줄 안내 (페이지를 옮겨도 남게) ---------- */
const FLASH_KEY = 'ailit-flash';
function setFlash(msg) {
  try { sessionStorage.setItem(FLASH_KEY, msg); } catch (e) { /* 무시 */ }
}
function showFlash() {
  try {
    const msg = sessionStorage.getItem(FLASH_KEY);
    if (msg) {
      sessionStorage.removeItem(FLASH_KEY);
      showToast(msg, 3000);
    }
  } catch (e) { /* 무시 */ }
}

/* ---------- 교사 ---------- */
const TEACHER_KEY = 'ailit-teacher';

function teacherLogin(pw) {
  if (String(pw).trim() === TEACHER_PASSWORD) {
    sessionStorage.setItem(TEACHER_KEY, 'ok');
    return true;
  }
  return false;
}

function requireTeacher() {
  if (sessionStorage.getItem(TEACHER_KEY) !== 'ok') {
    setFlash('선생님 비밀번호를 입력해 주세요');
    location.href = ROOT + 'index.html';
    return false;
  }
  return true;
}

/* ---------- 유틸 ---------- */

/** data/ 폴더 JSON 읽기. 예) loadJSON('data/summary.json') — ROOT 기준 경로 */
async function loadJSON(path) {
  const res = await fetch(ROOT + path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`JSON을 불러오지 못했어요: ${path}`);
  return res.json();
}

/** 주소의 ?이름=값 읽기 */
function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

/** 사용자 입력을 화면에 넣을 때 사용 */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** ROOT 기준 페이지 이동. 예) goTo('student/stories.html') */
function goTo(path) {
  location.href = ROOT + path;
}

/** 잠깐 뜨는 알림. 버튼·입력칸을 가리지 않는 자리에 띄운다 (placeToast) */
function showToast(msg, ms = 2000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  placeToast(el);
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
}

/* 알림 자리 고르기: 화면 위쪽부터 아래로 내려가며 버튼·링크·입력칸(+끊김 안내)과
 * 겹치지 않는 첫 자리. 빈자리가 없으면 가장 적게 겹치는 자리(같으면 위쪽). */
function placeToast(el) {
  el.style.top = '0px';
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = (vw - w) / 2;
  const right = left + w;
  const pad = 6; // 버튼과 띄울 거리
  const boxes = [...document.querySelectorAll(
    'button, a[href], textarea, input, select, [role="button"], .net-banner'
  )]
    .filter((e) => !el.contains(e) && !e.closest('[hidden]'))
    .map((e) => {
      const r = e.getBoundingClientRect();
      // 모둠 카드처럼 큰 누름 영역은 본문을 잠깐 가려도 되므로 가볍게 센다 (그 안의 작은 버튼은 그대로 피함)
      r.weight = r.height > h * 2.5 ? 0.05 : 1;
      return r;
    })
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > left && r.left < right);

  const margin = 12;
  let best = margin;
  let bestArea = Infinity;
  for (let y = margin; y <= Math.max(margin, vh - h - margin); y += 6) {
    let area = 0;
    for (const r of boxes) {
      const ox = Math.min(right, r.right + pad) - Math.max(left, r.left - pad);
      const oy = Math.min(y + h, r.bottom + pad) - Math.max(y, r.top - pad);
      if (ox > 0 && oy > 0) area += ox * oy * r.weight;
    }
    if (area < bestArea) { bestArea = area; best = y; }
    if (area === 0) break;
  }
  el.style.top = `${best}px`;
}

/** 큰 버튼 확인창 → Promise<boolean> */
function confirmDialog(message, { okText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-message">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(okText)}</button>
        </div>
      </div>`;
    const close = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
      const act = e.target.dataset.act;
      if (act) close(act === 'ok');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="cancel"]').focus();
  });
}

/** CSV 파일 내려받기. rows = [[열1, 열2, ...], ...] (첫 줄은 제목 행)
 *  UTF-8 BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다. */
function downloadCSV(filename, rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    // 엑셀이 수식으로 읽을 수 있는 글 앞에만 ' 를 붙인다
    //  - =, @, 탭, 줄바꿈으로 시작
    //  - + 나 - 뒤에 숫자·수식 기호가 오는 경우 (예: "-3+5", "+=A1")
    //  "-틀릴 수 있어요"처럼 - 뒤에 글자가 오면 그대로 둔다
    if (/^[=@\t\r\n]/.test(s) || /^[+\-]\s*[\d.=+\-@(]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 입력칸 아래 "120 / 300" 글자 수 표시. maxlength와 같은 방식으로 센다(이모지는 2자).
 *  글을 코드로 넣은 뒤에는 반환된 함수를 불러 다시 센다. */
function attachCharCounter(textarea) {
  const counter = document.createElement('span');
  counter.className = 'char-count';
  counter.setAttribute('aria-live', 'polite');
  textarea.insertAdjacentElement('afterend', counter);
  const max = textarea.maxLength > 0 ? textarea.maxLength : null;
  const update = () => {
    const n = textarea.value.length;
    counter.textContent = max ? `${n} / ${max}` : `${n}자`;
    counter.classList.toggle('is-near', Boolean(max) && n >= max * 0.9);
  };
  textarea.addEventListener('input', update);
  update();
  return update;
}

/** 오늘 날짜 YYYYMMDD (파일 이름용) */
function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 시각(ms) → "11/25 14:05" */
function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** class="student-badge" 요소에 "○모둠 ○번" 표시 */
function renderStudentBadge() {
  const s = getStudent();
  document.querySelectorAll('.student-badge').forEach((el) => {
    if (!s.group) { el.hidden = true; return; }
    el.textContent = s.member ? `${s.group}모둠 ${s.member}번` : `${s.group}모둠`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderStudentBadge();
  showFlash();
});
