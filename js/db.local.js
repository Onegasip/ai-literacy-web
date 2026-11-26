/* =========================================================
 * db.local.js — localStorage 버전 백업 (Firebase 없이 한 기기에서 시험할 때)
 * 쓰는 법: html의 Firebase SDK 두 줄과 db.js 대신 이 파일을 불러온다
 *
 * (아래 설명은 원래 db.js 시절 그대로)
 *   모든 함수는 async(Promise)라서 호출하는 쪽 코드는 그대로 둔다.
 *
 * 데이터 구조 (Firestore 경로와 같음)
 *   groups/{1~4}                 { strength, limit, updatedAt }  모둠 정리
 *   groups/{1~4}/members/{1~5}   { name, strength, limit, updatedAt, claimedBy, claimedAt }  개인 생각
 *   judge/{사례id}                { firstO, firstX, finalO, finalX, updatedAt, rev }  O/X 인원
 *   board/summary                { abilities, limits, conclusion, updatedAt, rev }  정리 판서
 *
 *   db.js와 같은 함수·같은 결과. 보안 규칙이 하는 검사(선택이 풀린 번호에 저장 거절)도 흉내 낸다.
 *
 *   strength = 장점(능력), limit = 한계, updatedAt = 저장 시각(ms)
 *   localStorage 키 = "ailit:" + 경로
 * ========================================================= */

const DB = (() => {
  const PREFIX = 'ailit:';
  const GROUPS = 4;       // common.js GROUP_COUNT 와 같게
  const MEMBERS = 5;      // common.js MEMBER_COUNT 와 같게
  const MAX_NAME = 10;

  const groupPath = (g) => `groups/${g}`;
  const memberPath = (g, m) => `groups/${g}/members/${m}`;

  function readDoc(path) {
    try {
      const raw = localStorage.getItem(PREFIX + path);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[DB] 읽기 실패', path, e);
      return null;
    }
  }

  /* claimedBy/claimedAt 은 남기고 합친다 (db.js의 merge 저장과 같게) */
  function writeDoc(path, data) {
    const doc = {
      strength: String(data.strength || '').slice(0, 300),
      limit: String(data.limit || '').slice(0, 300),
      updatedAt: Date.now(),
    };
    localStorage.setItem(PREFIX + path, JSON.stringify({ ...(readDoc(path) || {}), ...doc }));
    return doc;
  }

  const hasContent = (d) => Boolean(d && (d.strength || d.limit));

  /** 번호 고르기 + 이름 — db.js claimMember와 같은 결과 형식 */
  async function claimMember(group, member, deviceId, name) {
    const cleanName = String(name ?? '').trim().slice(0, MAX_NAME);
    const docs = {};
    for (let m = 1; m <= MEMBERS; m++) docs[m] = readDoc(memberPath(group, m));
    const target = docs[member];
    if (target?.claimedBy && target.claimedBy !== deviceId) return { ok: false, reason: 'taken' };
    const mine = Object.keys(docs).map(Number).filter((m) => m !== member && docs[m]?.claimedBy === deviceId);
    const locked = mine.find((m) => hasContent(docs[m]));
    if (locked) return { ok: false, reason: 'locked', member: locked };
    mine.forEach((m) => deleteDoc(memberPath(group, m)));
    if (target?.claimedBy !== deviceId) {
      localStorage.setItem(PREFIX + memberPath(group, member),
        JSON.stringify({ ...(target || {}), claimedBy: deviceId, claimedAt: Date.now(), name: cleanName }));
    } else if (target.name !== cleanName) {
      localStorage.setItem(PREFIX + memberPath(group, member), JSON.stringify({ ...target, name: cleanName }));
    }
    return { ok: true };
  }

  /** 선택 풀기 — 쓴 글은 남기고 claimedBy/claimedAt 만 지움 */
  async function releaseMember(group, member) {
    const path = memberPath(group, member);
    const d = readDoc(path);
    if (!d) return;
    if (!hasContent(d)) { deleteDoc(path); return; }
    const { claimedBy, claimedAt, ...rest } = d;
    localStorage.setItem(PREFIX + path, JSON.stringify(rest));
  }

  function deleteDoc(path) {
    localStorage.removeItem(PREFIX + path);
  }

  /** 학생 개인 생각 읽기 → {strength, limit, updatedAt} 또는 null */
  async function getMember(group, member) {
    return readDoc(memberPath(group, member));
  }

  /** 학생 개인 생각 저장 — db.js와 같게, 이 기기가 고른 번호가 아니면 err.code 'released' */
  async function saveMember(group, member, { strength, limit }, deviceId) {
    const cur = readDoc(memberPath(group, member));
    if (!cur?.claimedBy || cur.claimedBy !== deviceId) {
      const e = new Error('이 번호(이야기)의 선택이 풀렸거나 다른 기기 것이에요');
      e.code = 'released';
      throw e;
    }
    return writeDoc(memberPath(group, member), { strength, limit });
  }

  /** 모둠의 1~4번 개인 생각 → [{member, strength, limit, updatedAt} | {member} ...] */
  async function getGroupMembers(group) {
    const list = [];
    for (let m = 1; m <= MEMBERS; m++) {
      list.push({ member: m, ...(readDoc(memberPath(group, m)) || {}) });
    }
    return list;
  }

  /** 모둠 정리 읽기 */
  async function getGroupSummary(group) {
    return readDoc(groupPath(group));
  }

  /** 모둠 정리 저장 */
  async function saveGroupSummary(group, { strength, limit }) {
    return writeDoc(groupPath(group), { strength, limit });
  }

  /** 1~6모둠 전체 → [{group, summary, members: [...]}, ...] */
  async function getAllGroups() {
    const result = [];
    for (let g = 1; g <= GROUPS; g++) {
      result.push({
        group: g,
        summary: readDoc(groupPath(g)),
        members: await getGroupMembers(g),
      });
    }
    return result;
  }

  /** 한 모둠 초기화 (모둠 정리 + 1~4번 개인 생각 삭제) */
  async function resetGroup(group) {
    deleteDoc(groupPath(group));
    for (let m = 1; m <= MEMBERS; m++) deleteDoc(memberPath(group, m));
  }

  /** 전체 초기화 (이 앱의 "ailit:" 키만 삭제 — 모둠 결과 + judge 기록 모두) */
  async function resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  }

  /* ---------- AI 활용 판단 O/X 기록 (judge/{사례id}) ---------- */
  const judgePath = (caseId) => `judge/${caseId}`;
  const toCount = (n) => Math.max(0, Math.floor(Number(n) || 0));
  const JUDGE_KEYS = ['firstO', 'firstX', 'finalO', 'finalX'];
  const normJudge = (d) => ({
    firstO: toCount(d?.firstO), firstX: toCount(d?.firstX),
    finalO: toCount(d?.finalO), finalX: toCount(d?.finalX),
    updatedAt: Number(d?.updatedAt) || 0,
    rev: toCount(d?.rev),
  });

  /** 사례 하나의 O/X 기록 → {firstO, firstX, finalO, finalX, updatedAt} 또는 null */
  async function getJudge(caseId) {
    return readDoc(judgePath(caseId));
  }

  /** O/X 한 칸만 step만큼 바꾸기 — db.js changeJudge와 같은 규칙 (0 이상, 단계 합계 ≤ maxTotal) */
  async function changeJudge(caseId, key, step, maxTotal) {
    if (!JUDGE_KEYS.includes(key)) throw new Error(`[DB] 알 수 없는 칸: ${key}`);
    const cur = normJudge(readDoc(judgePath(caseId)));
    const stage = key.startsWith('first') ? 'first' : 'final';
    const value = cur[key] + step;
    if (value < 0) return cur;
    if (step > 0 && cur[`${stage}O`] + cur[`${stage}X`] + step > maxTotal) return cur;
    const next = { ...cur, [key]: value, updatedAt: Date.now(), rev: cur.rev + 1 };
    localStorage.setItem(PREFIX + judgePath(caseId), JSON.stringify(next));
    return next;
  }

  /** 사례 하나의 O/X 기록 지켜보기. callback(기록 | null) — 1초마다 + 다른 탭 변경 */
  function watchJudge(caseId, callback, intervalMs = 1000) {
    return poll(async () => readDoc(judgePath(caseId)), callback, intervalMs);
  }

  /** 모든 사례 기록 → { 사례id: {...}, ... } (CSV 내보내기용) */
  async function getAllJudges() {
    const result = {};
    const head = PREFIX + 'judge/';
    Object.keys(localStorage)
      .filter((k) => k.startsWith(head))
      .forEach((k) => { result[k.slice(head.length)] = readDoc(k.slice(PREFIX.length)); });
    return result;
  }

  /* ---------- 정리 판서 (board/summary) ---------- */
  // 판서 계산 규칙은 db.local.js 와 같다. 칸·글자 수 제한은 firestore.rules 와 같게.
  const BOARD_COLS = ['abilities', 'limits'];
  const BOARD_MAX_ITEMS = 10;
  const BOARD_KEYWORD = 30;
  const BOARD_DESC = 80;
  const BOARD_CONCLUSION = 150;

  const normBoard = (d) => ({
    abilities: Array.isArray(d?.abilities) ? d.abilities : [],
    limits: Array.isArray(d?.limits) ? d.limits : [],
    conclusion: typeof d?.conclusion === 'string' ? d.conclusion : '',
    updatedAt: Number(d?.updatedAt) || 0,
    rev: Math.max(0, Math.floor(Number(d?.rev) || 0)),
  });
  const boardError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
  function cleanItem(item, id) {
    const keyword = String(item?.keyword ?? '').trim().slice(0, BOARD_KEYWORD);
    if (!keyword) throw boardError('empty', '키워드를 적어 주세요');
    const groups = [...new Set((item?.groups || []).map(Number))]
      .filter((g) => Number.isInteger(g) && g >= 1 && g <= GROUPS).sort((a, b) => a - b);
    return { id, keyword, desc: String(item?.desc ?? '').trim().slice(0, BOARD_DESC), groups };
  }
  const newItemId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function findItem(b, id) {
    for (const col of BOARD_COLS) {
      const i = b[col].findIndex((x) => x.id === id);
      if (i >= 0) return { col, i };
    }
    return null;
  }
  /** 판서 한 번 바꾸기. op:
   *   {type:'add', col, item}            col = 'abilities' | 'limits', item = {keyword, desc, groups}
   *   {type:'update', id, col, item}     내용 고치기 (col이 다르면 다른 칸으로 옮김)
   *   {type:'remove', id}
   *   {type:'move', id, dir}             dir = -1(위로) | 1(아래로)
   *   {type:'conclusion', text}          오늘의 핵심 문장
   *  → 바뀐 판서 (바꿀 게 없으면 null). 칸이 꽉 차면 err.code 'full', 키워드가 없으면 'empty' */
  function applyBoardOp(cur, op) {
    const b = { ...cur, abilities: cur.abilities.slice(), limits: cur.limits.slice() };
    if (op.type === 'conclusion') {
      const text = String(op.text ?? '').trim().slice(0, BOARD_CONCLUSION);
      if (text === b.conclusion) return null;
      b.conclusion = text;
      return b;
    }
    if (op.type === 'add') {
      if (!BOARD_COLS.includes(op.col)) throw boardError('bad', '알 수 없는 칸');
      if (b[op.col].length >= BOARD_MAX_ITEMS) throw boardError('full', `한 칸에 ${BOARD_MAX_ITEMS}개까지 적을 수 있어요`);
      b[op.col].push(cleanItem(op.item, newItemId()));
      return b;
    }
    const at = findItem(b, op.id);
    if (!at) return null; // 다른 화면에서 이미 지움
    if (op.type === 'remove') {
      b[at.col].splice(at.i, 1);
      return b;
    }
    if (op.type === 'move') {
      const j = at.i + (op.dir < 0 ? -1 : 1);
      if (j < 0 || j >= b[at.col].length) return null;
      [b[at.col][at.i], b[at.col][j]] = [b[at.col][j], b[at.col][at.i]];
      return b;
    }
    if (op.type === 'update') {
      const item = cleanItem(op.item, op.id);
      const col = BOARD_COLS.includes(op.col) ? op.col : at.col;
      if (col === at.col) {
        b[col][at.i] = item;
      } else {
        if (b[col].length >= BOARD_MAX_ITEMS) throw boardError('full', `한 칸에 ${BOARD_MAX_ITEMS}개까지 적을 수 있어요`);
        b[at.col].splice(at.i, 1);
        b[col].push(item);
      }
      return b;
    }
    throw boardError('bad', '알 수 없는 바꾸기');
  }

  const boardPath = 'board/summary';

  /** 정리 판서 읽기 → {abilities, limits, conclusion, updatedAt, rev} */
  async function getBoard() {
    return normBoard(readDoc(boardPath));
  }

  /** 정리 판서 바꾸기 — db.js changeBoard 와 같은 규칙 */
  async function changeBoard(op) {
    const cur = normBoard(readDoc(boardPath));
    const next = applyBoardOp(cur, op);
    if (!next) return cur;
    next.updatedAt = Date.now();
    next.rev = cur.rev + 1;
    localStorage.setItem(PREFIX + boardPath, JSON.stringify(next));
    return next;
  }

  /** 정리 판서 지켜보기 — 1초마다 + 다른 탭 변경 */
  function watchBoard(callback, intervalMs = 1000) {
    return poll(async () => normBoard(readDoc(boardPath)), callback, intervalMs);
  }

  /** 모둠 데이터(정리 + 1~번호) 지켜보기. 바뀔 때마다 callback({summary, members}) 호출.
   *  지금: 5초마다 다시 읽기 + 같은 기기 다른 탭 변경(storage 이벤트)
   *  Firebase: onSnapshot 실시간 구독으로 바꾸면 된다.
   *  반환값: 지켜보기를 멈추는 함수 */
  function watchGroup(group, callback, intervalMs = 5000) {
    return poll(async () => ({
      summary: readDoc(groupPath(group)),
      members: await getGroupMembers(group),
    }), callback, intervalMs);
  }

  /** 1~6모둠 전체 지켜보기 (교사 results용). callback(getAllGroups() 결과)
   *  Firebase: groups 컬렉션 + members 하위 컬렉션 onSnapshot 으로 교체 */
  function watchAll(callback, intervalMs = 5000) {
    return poll(getAllGroups, callback, intervalMs);
  }

  /* localStorage용 지켜보기: 주기적으로 read()해서 바뀌었을 때만 callback.
   * 반환된 객체의 함수를 부르면 멈추고, .refresh()로 즉시 다시 읽는다. */
  function poll(read, callback, intervalMs) {
    let last = '';
    const tick = async () => {
      const data = await read();
      const json = JSON.stringify(data);
      if (json !== last) {
        last = json;
        callback(data);
      }
    };
    const onStorage = (e) => { if (!e.key || e.key.startsWith(PREFIX)) tick(); };
    tick();
    const timer = setInterval(tick, intervalMs);
    window.addEventListener('storage', onStorage);
    const stop = () => {
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
    stop.refresh = tick;
    return stop;
  }

  return {
    watchGroup,
    watchAll,
    getMember,
    saveMember,
    claimMember,
    releaseMember,
    getGroupMembers,
    getGroupSummary,
    saveGroupSummary,
    getAllGroups,
    resetGroup,
    resetAll,
    getJudge,
    changeJudge,
    watchJudge,
    getAllJudges,
    getBoard,
    changeBoard,
    watchBoard,
  };
})();
