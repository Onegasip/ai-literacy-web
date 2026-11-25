/* =========================================================
 * common.js — 모든 페이지 공통 기능
 * 불러오는 순서: db.js → common.js → 페이지 js
 * ========================================================= */

const GROUP_COUNT = 6;
const MEMBER_COUNT = 4;

/* 교사 페이지 진입 비밀번호 (수업용 간단 잠금, 보안 기능 아님) */
const TEACHER_PASSWORD = '1234';

/* 현재 페이지가 하위 폴더(student/, teacher/)에 있으면 '../', 아니면 '' */
const ROOT = /\/(student|teacher)\/[^/]*$/.test(location.pathname) ? '../' : '';

/* ---------- 학생 정보 (sessionStorage, 개인정보 없음) ---------- */
const STUDENT_KEY = 'ailit-student';

/** 모둠·번호 저장. 일부만 넘기면 기존 값과 합친다. 예) setStudent({group: 3}) */
function setStudent(info) {
  const next = { ...getStudent(), ...info };
  sessionStorage.setItem(STUDENT_KEY, JSON.stringify(next));
  return next;
}

/** → {group, member} (없으면 빈 객체) */
function getStudent() {
  try {
    return JSON.parse(sessionStorage.getItem(STUDENT_KEY)) || {};
  } catch (e) {
    return {};
  }
}

/** 필요한 정보가 없으면 첫 화면으로 보낸다. needMember=true면 번호까지 확인 */
function requireStudent(needMember = false) {
  const s = getStudent();
  if (!s.group || (needMember && !s.member)) {
    location.href = ROOT + 'index.html';
    return null;
  }
  return s;
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
    const s = String(v ?? '');
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

document.addEventListener('DOMContentLoaded', renderStudentBadge);
