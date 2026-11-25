/* =========================================================
 * common.js — 모든 페이지 공통 기능
 * 불러오는 순서: db.js → common.js → 페이지 js
 * ========================================================= */

const GROUP_COUNT = 6;
const MEMBER_COUNT = 4;

/* 우리 반 인원 — 판단 O/X 입력에서 처음/최종 각각 O+X가 이 수를 넘지 않게 */
const CLASS_SIZE = 20;

/* 교사 페이지 진입 비밀번호 (수업용 간단 잠금, 보안 기능 아님) */
const TEACHER_PASSWORD = '1234';

/* 현재 페이지가 하위 폴더(student/, teacher/)에 있으면 '../', 아니면 '' */
const ROOT = /\/(student|teacher)\/[^/]*$/.test(location.pathname) ? '../' : '';

/* ---------- 기기 설정 (localStorage) ----------
 * DB 데이터는 db.js에만. 여기서는 이 기기의 설정(학생 정보, 기기 ID)만 localStorage에 둔다.
 * 개인정보 없음: 모둠 번호 + 학생 번호 + 무작위 기기 ID */
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

/** 모둠·번호 저장. 일부만 넘기면 기존 값과 합친다. 예) setStudent({group: 3}) */
function setStudent(info) {
  const next = { ...getStudent(), ...info };
  writeLocal(STUDENT_KEY, next);
  return next;
}

/** → {group, member} (없으면 빈 객체) */
function getStudent() {
  return readLocal(STUDENT_KEY) || {};
}

/** 필요한 정보가 없으면 안내와 함께 돌려보낸다.
 *  모둠이 없으면 첫 화면, needMember=true인데 번호가 없으면 이야기 선택 화면 */
function requireStudent(needMember = false) {
  const s = getStudent();
  if (!s.group) {
    setFlash('모둠을 먼저 골라 주세요');
    location.href = ROOT + 'index.html';
    return null;
  }
  if (needMember && !s.member) {
    setFlash('이야기를 먼저 골라 주세요');
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
function leaveReleased() {
  setStudent({ member: null });
  setFlash('이야기 선택이 풀렸어요. 이야기를 다시 골라 주세요.');
  location.href = ROOT + 'student/stories.html';
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

/** 화면 아래 잠깐 뜨는 알림 */
function showToast(msg, ms = 2000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
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
    // =, +, -, @ 로 시작하면 엑셀이 수식으로 읽을 수 있으므로 앞에 ' 를 붙인다
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
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
