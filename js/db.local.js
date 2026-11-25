/* =========================================================
 * db.local.js — localStorage 버전 백업 (Firebase 없이 한 기기에서 시험할 때)
 * 쓰는 법: html의 Firebase SDK 두 줄과 db.js 대신 이 파일을 불러온다
 *
 * (아래 설명은 원래 db.js 시절 그대로)
 *   모든 함수는 async(Promise)라서 호출하는 쪽 코드는 그대로 둔다.
 *
 * 데이터 구조 (Firestore 경로와 같음)
 *   groups/{1~6}                 { strength, limit, updatedAt }  모둠 정리
 *   groups/{1~6}/members/{1~4}   { strength, limit, updatedAt }  개인 생각
 *   judge/{사례id}                { firstO, firstX, finalO, finalX, updatedAt }  O/X 인원
 *
 *   strength = 장점(능력), limit = 한계, updatedAt = 저장 시각(ms)
 *   localStorage 키 = "ailit:" + 경로
 * ========================================================= */

const DB = (() => {
  const PREFIX = 'ailit:';
  const GROUPS = 6;
  const MEMBERS = 4;

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

  function writeDoc(path, data) {
    const doc = {
      strength: data.strength || '',
      limit: data.limit || '',
      updatedAt: Date.now(),
    };
    localStorage.setItem(PREFIX + path, JSON.stringify(doc));
    return doc;
  }

  function deleteDoc(path) {
    localStorage.removeItem(PREFIX + path);
  }

  /** 학생 개인 생각 읽기 → {strength, limit, updatedAt} 또는 null */
  async function getMember(group, member) {
    return readDoc(memberPath(group, member));
  }

  /** 학생 개인 생각 저장 */
  async function saveMember(group, member, { strength, limit }) {
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

  /** 사례 하나의 O/X 기록 → {firstO, firstX, finalO, finalX, updatedAt} 또는 null */
  async function getJudge(caseId) {
    return readDoc(judgePath(caseId));
  }

  /** 사례 O/X 기록 저장 (0 이상의 정수로 정리) */
  async function saveJudge(caseId, { firstO, firstX, finalO, finalX }) {
    const doc = {
      firstO: toCount(firstO),
      firstX: toCount(firstX),
      finalO: toCount(finalO),
      finalX: toCount(finalX),
      updatedAt: Date.now(),
    };
    localStorage.setItem(PREFIX + judgePath(caseId), JSON.stringify(doc));
    return doc;
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

  /** 모둠 데이터(정리 + 1~4번) 지켜보기. 바뀔 때마다 callback({summary, members}) 호출.
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
    getGroupMembers,
    getGroupSummary,
    saveGroupSummary,
    getAllGroups,
    resetGroup,
    resetAll,
    getJudge,
    saveJudge,
    getAllJudges,
  };
})();
