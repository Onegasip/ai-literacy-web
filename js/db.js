/* =========================================================
 * db.js — 데이터 저장소 (Firebase Firestore 버전)
 *
 * ★ DB 관련 코드는 이 파일에만 둔다. 다른 js는 DB.함수() 만 쓴다.
 *   모든 함수는 async(Promise). 함수 이름·반환 형식은 localStorage 버전(db.local.js)과 같다.
 *
 * 불러오는 순서 (각 html):
 *   firebase-app-compat.js → firebase-firestore-compat.js → db.js → common.js → 페이지 js
 *
 * 데이터 구조 (Firestore)
 *   groups/{1~4}                 { strength, limit, updatedAt }  모둠 정리
 *   groups/{1~4}/members/{1~5}   { name, strength, limit, updatedAt, claimedBy, claimedAt }  개인 생각
 *                                 name = 학생 이름(성 빼고, 10자까지)
 *                                 claimedBy = 이 번호를 고른 기기 ID, claimedAt = 고른 시각
 *   judge/{사례id}                { firstO, firstX, finalO, finalX, updatedAt, rev }  O/X 인원
 *                                 rev = 바뀐 횟수(트랜잭션마다 +1) — 화면이 어느 값이 최신인지 고를 때 씀
 *   board/summary                { abilities: [항목], limits: [항목], conclusion, updatedAt, rev }  정리 판서
 *                                 항목 = { id, keyword(30자), desc(80자), groups: [1~4] }, 칸마다 10개까지
 *
 *   strength = 장점(능력), limit = 한계 (각 300자까지), updatedAt = 저장 시각(ms 숫자)
 *   보안 규칙: firestore.rules
 * ========================================================= */

const DB = (() => {
  const firebaseConfig = {
    apiKey: 'AIzaSyDUA8IBXn1Qd0sYn3Pzy3by7Dd368AsfEA',
    authDomain: 'ai-literacy-web.firebaseapp.com',
    projectId: 'ai-literacy-web',
    storageBucket: 'ai-literacy-web.firebasestorage.app',
    messagingSenderId: '719070337244',
    appId: '1:719070337244:web:9908434f8237c4fc14fc19',
  };

  if (typeof firebase === 'undefined') {
    throw new Error('[DB] Firebase SDK가 없어요. html에서 db.js보다 먼저 firebase-app-compat.js, firebase-firestore-compat.js를 불러오세요.');
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const fs = firebase.firestore();

  const GROUPS = 4;       // common.js GROUP_COUNT 와 같게
  const MEMBERS = 5;      // common.js MEMBER_COUNT 와 같게
  const MAX_TEXT = 300;   // firestore.rules 의 글자 수 제한과 같게
  const MAX_COUNT = 999;  // firestore.rules 의 인원 제한과 같게
  const MAX_NAME = 10;    // 이름 (common.js NAME_MAX, firestore.rules 와 같게)

  /* ---------- 경로 ---------- */
  const groupsCol = () => fs.collection('groups');
  const groupRef = (g) => groupsCol().doc(String(g));
  const membersCol = (g) => groupRef(g).collection('members');
  const memberRef = (g, m) => membersCol(g).doc(String(m));
  const judgeCol = () => fs.collection('judge');
  const judgeRef = (id) => judgeCol().doc(String(id));
  const boardRef = () => fs.collection('board').doc('summary');

  /* ---------- 도우미 ---------- */
  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
  const text = (v) => String(v ?? '').slice(0, MAX_TEXT);
  const toCount = (n) => Math.min(MAX_COUNT, Math.max(0, Math.floor(Number(n) || 0)));
  const docData = (snap) => (snap.exists ? snap.data() : null);
  const onError = (e) => console.error('[DB] 실시간 연결 오류', e);

  /* ---------- O/X 기록 계산 (db.local.js와 같은 규칙) ---------- */
  const JUDGE_KEYS = ['firstO', 'firstX', 'finalO', 'finalX'];
  const normJudge = (d) => ({
    firstO: toCount(d?.firstO), firstX: toCount(d?.firstX),
    finalO: toCount(d?.finalO), finalX: toCount(d?.finalX),
    updatedAt: Number(d?.updatedAt) || 0,
    rev: Math.max(0, Math.floor(Number(d?.rev) || 0)),
  });
  /** 한 칸을 step만큼 바꾼 새 기록, 바꿀 수 없으면 null */
  function applyJudgeStep(cur, key, step, maxTotal) {
    const stage = key.startsWith('first') ? 'first' : 'final';
    const value = cur[key] + step;
    if (value < 0) return null;
    if (step > 0 && cur[`${stage}O`] + cur[`${stage}X`] + step > maxTotal) return null;
    return { ...cur, [key]: value };
  }

  /** members 컬렉션 결과 → [{member:1, ...}, ... {member:4}] (없는 번호는 {member}만) */
  function toMemberList(querySnap) {
    const byId = {};
    querySnap.forEach((d) => { byId[d.id] = d.data(); });
    return range(MEMBERS).map((m) => ({ member: m, ...(byId[m] || {}) }));
  }

  /* merge: members 문서의 claimedBy/claimedAt 을 지우지 않도록 바뀐 칸만 합친다 */
  async function writeThought(ref, { strength, limit }) {
    const doc = { strength: text(strength), limit: text(limit), updatedAt: Date.now() };
    await ref.set(doc, { merge: true });
    return doc;
  }

  const hasContent = (d) => Boolean(d && (d.strength || d.limit));

  /* ---------- 개인 생각 ---------- */

  /** 학생 개인 생각 읽기 → {strength, limit, updatedAt} 또는 null */
  async function getMember(group, member) {
    return docData(await memberRef(group, member).get());
  }

  /** 학생 개인 생각 저장. deviceId = 이 기기 ID (getDeviceId())
   *  글과 함께 claimedBy:deviceId 를 보내서, 선택이 풀렸거나(교사 [선택 풀기]·모둠 초기화)
   *  다른 기기가 고른 번호면 보안 규칙이 거절한다 → err.code === 'released' 로 던짐.
   *  (인터넷이 끊겨 있으면 연결될 때까지 기다렸다가 저장되고, 그때 거절될 수도 있다) */
  async function saveMember(group, member, data, deviceId) {
    const doc = { strength: text(data.strength), limit: text(data.limit), updatedAt: Date.now() };
    try {
      await memberRef(group, member).set({ ...doc, claimedBy: deviceId }, { merge: true });
    } catch (err) {
      if (err && err.code === 'permission-denied') throw released();
      throw err;
    }
    return doc;
  }

  function released() {
    const e = new Error('이 번호(이야기)의 선택이 풀렸거나 다른 기기 것이에요');
    e.code = 'released';
    return e;
  }

  /** 모둠의 1~4번 개인 생각 → [{member, strength, limit, updatedAt} | {member} ...] */
  async function getGroupMembers(group) {
    return toMemberList(await membersCol(group).get());
  }

  /* ---------- 이야기(번호) 고르기 ---------- */

  /** 기기가 모둠의 번호를 고르고 이름을 적는다. 트랜잭션이라 두 기기가 동시에 눌러도 한 명만 성공.
   *  name = 다듬은 이름(common.js cleanName). 이미 내 번호면 이름만 바꾼다.
   *  → {ok:true}
   *  | {ok:false, reason:'taken'}             다른 기기가 이미 고름
   *  | {ok:false, reason:'locked', member:n}  이 기기가 n번에 이미 글을 써서 바꿀 수 없음
   *  이 기기가 고른 다른 번호에 글이 없으면 그 선택은 자동으로 풀린다. */
  async function claimMember(group, member, deviceId, name) {
    const cleanName = String(name ?? '').trim().slice(0, MAX_NAME);
    const refs = range(MEMBERS).map((m) => memberRef(group, m));
    return fs.runTransaction(async (tx) => {
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const docs = snaps.map(docData);
      const target = docs[member - 1];

      if (target?.claimedBy && target.claimedBy !== deviceId) return { ok: false, reason: 'taken' };

      const mine = range(MEMBERS).filter((m) => m !== member && docs[m - 1]?.claimedBy === deviceId);
      const locked = mine.find((m) => hasContent(docs[m - 1]));
      if (locked) return { ok: false, reason: 'locked', member: locked };

      mine.forEach((m) => tx.delete(refs[m - 1]));   // 글 없는 예전 선택은 풀기
      if (target?.claimedBy !== deviceId) {
        tx.set(refs[member - 1], { claimedBy: deviceId, claimedAt: Date.now(), name: cleanName }, { merge: true });
      } else if (target.name !== cleanName) {
        tx.set(refs[member - 1], { name: cleanName }, { merge: true });  // 이름만 고치기
      }
      return { ok: true };
    });
  }

  /** 선택 풀기 (교사): claimedBy/claimedAt 만 지우고 쓴 글·이름은 남긴다. 글이 없으면 문서를 지운다. */
  async function releaseMember(group, member) {
    const ref = memberRef(group, member);
    const d = docData(await ref.get());
    if (!d) return;
    if (hasContent(d)) {
      const del = firebase.firestore.FieldValue.delete();
      await ref.update({ claimedBy: del, claimedAt: del });
    } else {
      await ref.delete();
    }
  }

  /* ---------- 모둠 정리 ---------- */

  async function getGroupSummary(group) {
    return docData(await groupRef(group).get());
  }

  async function saveGroupSummary(group, data) {
    return writeThought(groupRef(group), data);
  }

  /** 1~6모둠 전체 → [{group, summary, members: [...]}, ...] */
  async function getAllGroups() {
    return Promise.all(range(GROUPS).map(async (g) => {
      const [summarySnap, membersSnap] = await Promise.all([groupRef(g).get(), membersCol(g).get()]);
      return { group: g, summary: docData(summarySnap), members: toMemberList(membersSnap) };
    }));
  }

  /* ---------- 초기화 ---------- */
  // Firestore는 상위 문서를 지워도 하위 컬렉션이 남으므로 members 문서를 직접 지운다.

  async function addGroupDeletes(batch, g) {
    batch.delete(groupRef(g));
    const snap = await membersCol(g).get();
    const ids = new Set(range(MEMBERS).map(String));
    snap.forEach((d) => ids.add(d.id));
    ids.forEach((id) => batch.delete(membersCol(g).doc(id)));
  }

  /** 한 모둠 초기화 (모둠 정리 + 1~4번 개인 생각 삭제) */
  async function resetGroup(group) {
    const batch = fs.batch();
    await addGroupDeletes(batch, group);
    await batch.commit();
  }

  /** 전체 초기화 (모든 모둠 + members + judge 기록 + 정리 판서 삭제) */
  async function resetAll() {
    const batch = fs.batch();
    for (const g of range(GROUPS)) await addGroupDeletes(batch, g);
    const judges = await judgeCol().get();
    judges.forEach((d) => batch.delete(d.ref));
    batch.delete(boardRef());
    await batch.commit();
  }

  /* ---------- AI 활용 판단 O/X 기록 ---------- */

  /** 사례 하나의 O/X 기록 → {firstO, firstX, finalO, finalX, updatedAt} 또는 null */
  async function getJudge(caseId) {
    return docData(await judgeRef(caseId).get());
  }

  /** O/X 한 칸만 step(+1/−1)만큼 바꾼다. 트랜잭션이라 여러 화면에서 동시에 눌러도 서로 덮어쓰지 않는다.
   *  DB 값 기준으로 0 미만, 단계(처음/최종) 합계 O+X > maxTotal 이 되는 변경은 하지 않는다.
   *  → 바뀐 뒤(또는 그대로인) 기록 {firstO, firstX, finalO, finalX, updatedAt, rev}
   *  인터넷이 끊겨 있으면 실패(throw)한다. */
  async function changeJudge(caseId, key, step, maxTotal) {
    if (!JUDGE_KEYS.includes(key)) throw new Error(`[DB] 알 수 없는 칸: ${key}`);
    const ref = judgeRef(caseId);
    return fs.runTransaction(async (tx) => {
      const cur = normJudge(docData(await tx.get(ref)));
      const next = applyJudgeStep(cur, key, step, maxTotal);
      if (!next) return cur; // 바꿀 수 없음(0 미만·인원 초과) → 그대로
      next.updatedAt = Date.now();
      next.rev = cur.rev + 1;
      tx.set(ref, next);
      return next;
    });
  }

  /** 사례 하나의 O/X 기록 실시간 지켜보기. callback(기록 | null)
   *  인터넷이 끊겨 아직 서버 값을 못 받았으면 부르지 않는다 (잘못된 0으로 보이지 않게) */
  function watchJudge(caseId, callback) {
    let last;
    const unsub = judgeRef(caseId).onSnapshot((s) => {
      if (s.metadata.fromCache && !s.exists) return;
      last = docData(s);
      callback(last);
    }, onError);
    const stop = () => unsub();
    stop.refresh = async () => { if (last !== undefined) callback(last); };
    return stop;
  }

  /** 모든 사례 기록 → { 사례id: {...}, ... } */
  async function getAllJudges() {
    const result = {};
    (await judgeCol().get()).forEach((d) => { result[d.id] = d.data(); });
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

  /** 정리 판서 읽기 → {abilities, limits, conclusion, updatedAt, rev} */
  async function getBoard() {
    return normBoard(docData(await boardRef().get()));
  }

  /** 정리 판서 바꾸기 (트랜잭션 — 두 화면에서 동시에 고쳐도 서로 덮어쓰지 않음). 인터넷이 끊기면 실패 */
  async function changeBoard(op) {
    const ref = boardRef();
    return fs.runTransaction(async (tx) => {
      const cur = normBoard(docData(await tx.get(ref)));
      const next = applyBoardOp(cur, op);
      if (!next) return cur;
      next.updatedAt = Date.now();
      next.rev = cur.rev + 1;
      tx.set(ref, next);
      return next;
    });
  }

  /** 정리 판서 실시간 지켜보기. callback(판서). 서버 값을 받기 전(끊김)에는 부르지 않는다 */
  function watchBoard(callback) {
    let last;
    const unsub = boardRef().onSnapshot((s) => {
      if (s.metadata.fromCache && !s.exists) return;
      last = normBoard(docData(s));
      callback(last);
    }, onError);
    const stop = () => unsub();
    stop.refresh = async () => { if (last !== undefined) callback(last); };
    return stop;
  }

  /* ---------- 실시간 지켜보기 (onSnapshot) ---------- */

  /* 같은 내용이면 callback을 다시 부르지 않는 도우미.
   * 반환: 지켜보기를 멈추는 함수 (.refresh()는 마지막 내용을 다시 보내 줌) */
  function makeWatcher(callback, unsubs, build) {
    let last = '';
    const emit = (force = false) => {
      const data = build();
      if (data === undefined) return; // 아직 첫 데이터가 다 안 옴
      const json = JSON.stringify(data);
      if (force || json !== last) {
        last = json;
        callback(data);
      }
    };
    const stop = () => unsubs.forEach((u) => u());
    stop.refresh = async () => emit(true);
    return { stop, emit };
  }

  /** 모둠 데이터(정리 + 1~4번) 실시간 지켜보기. callback({summary, members}) */
  function watchGroup(group, callback) {
    let summary;          // undefined = 아직 못 받음
    let members;
    const unsubs = [];
    const w = makeWatcher(callback, unsubs, () =>
      (summary === undefined || members === undefined) ? undefined : { summary, members });

    // 인터넷이 끊긴 채 처음 열면 캐시에 아무것도 없어 '빈 모둠'처럼 보일 수 있다
    // → 서버에서 받기 전의 빈 캐시 결과는 건너뛴다 (선택이 풀린 것으로 오해하지 않게)
    unsubs.push(groupRef(group).onSnapshot((s) => {
      if (s.metadata.fromCache && !s.exists && summary === undefined) return;
      summary = docData(s); w.emit();
    }, onError));
    unsubs.push(membersCol(group).onSnapshot((q) => {
      if (q.metadata.fromCache && q.empty && members === undefined) return;
      members = toMemberList(q); w.emit();
    }, onError));
    return w.stop;
  }

  /** 1~6모둠 전체 실시간 지켜보기 (교사 results용). callback(getAllGroups()와 같은 형식) */
  function watchAll(callback) {
    let summaries;               // { '1': {...}, ... }
    const members = {};          // { 1: [...], ... }
    const unsubs = [];
    const w = makeWatcher(callback, unsubs, () => {
      if (summaries === undefined || range(GROUPS).some((g) => !members[g])) return undefined;
      return range(GROUPS).map((g) => ({
        group: g,
        summary: summaries[g] || null,
        members: members[g],
      }));
    });

    unsubs.push(groupsCol().onSnapshot((q) => {
      summaries = {};
      q.forEach((d) => { summaries[d.id] = d.data(); });
      w.emit();
    }, onError));
    range(GROUPS).forEach((g) => {
      unsubs.push(membersCol(g).onSnapshot((q) => { members[g] = toMemberList(q); w.emit(); }, onError));
    });
    return w.stop;
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
