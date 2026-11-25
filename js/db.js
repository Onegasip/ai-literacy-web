/* =========================================================
 * db.js — 데이터 저장소 (지금은 localStorage 임시 버전)
 *
 * ★ Firebase(Firestore)로 바꿀 때는 이 파일만 고치면 된다.
 *   모든 함수는 async(Promise)라서 호출하는 쪽 코드는 그대로 둔다.
 *
 * 데이터 구조 (Firestore 경로와 같음)
 *   groups/{1~6}                 { strength, limit, updatedAt }  모둠 정리
 *   groups/{1~6}/members/{1~4}   { strength, limit, updatedAt }  개인 생각
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

  /** 전체 초기화 (이 앱의 "ailit:" 키만 삭제) */
  async function resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
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
  };
})();
