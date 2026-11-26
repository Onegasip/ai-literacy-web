# AI 리터러시 수업 웹앱 — 프로젝트 규칙

초등 6학년 AI 리터러시 수업 "과제의 특성에 따라 AI 활용 여부 판단하기"에서 쓰는 웹앱.
학생 20명 = 4모둠 × 5명. 모둠마다 이야기 하나를 맡아(1모둠→이야기1 …) 모둠원 5명이 같은 이야기를 읽고 각자 AI의 **장점(능력)** 과 **한계**를 찾아 쓴 뒤 모둠으로 정리하고, 교사는 TV에 결과를 띄우고 정리 판서 화면에 직접 타자로 정리한다.

## 수업 구조 설정 (한 곳에서 바꾸기)
- `js/common.js`: `GROUP_COUNT`(4), `MEMBER_COUNT`(5), `GROUP_STORY`(모둠 → 이야기 번호), `CLASS_SIZE`(20), `NAME_MAX`(10)
- 바꾸면 `js/db.js`·`js/db.local.js`의 `GROUPS`/`MEMBERS`, `firestore.rules`의 `isGroup`/`isMember`도 같이 고친다.

## 기술 규칙
- 빌드 도구·프레임워크 없이 **순수 HTML + CSS + JS**. GitHub Pages로 배포한다.
- 페이지마다 html / css / js 파일을 **따로 분리**한다. (예: `student/story.html` + `css/story.css` + `js/story.js`)
- 공통 스타일은 `css/common.css`, 공통 기능은 `js/common.js`.
- 스크립트는 ES 모듈이 아닌 일반 `<script>`로 불러온다. 순서: `js/db.js` → `js/common.js` → 페이지 js.
- 모든 경로는 **상대 경로**로 쓴다. (GitHub Pages 하위 경로 `/<저장소이름>/`에서도 동작해야 함)
- JSON을 `fetch`로 읽으므로 로컬 확인은 VS Code Live Server 또는 `python -m http.server`로 한다. (`file://`로 열면 JSON을 못 읽음)

## DB 규칙
- DB 관련 코드는 **`js/db.js` 한 파일에만** 둔다. 현재 **Firebase Firestore** 버전(프로젝트 `ai-literacy-web`).
- Firebase는 CDN **compat** SDK(`firebase-app-compat`, `firebase-firestore-compat`, 10.12.2)를 쓴다. 모든 html에서 SDK 두 줄 → `db.js` → `common.js` → 페이지 js 순서로 불러온다.
- `js/db.local.js`는 예전 localStorage 버전 백업. Firebase 없이 시험할 때 SDK 두 줄과 db.js 대신 불러오면 된다.
- DB 데이터는 `DB.함수()`로만 다루고 Firestore를 직접 쓰지 않는다. db 함수는 모두 `async`.
- localStorage는 **기기 설정만** `js/common.js`에서 쓴다: 학생 모둠·번호(`setStudent`/`getStudent`), 기기 ID(`getDeviceId`). 다른 파일에서 직접 쓰지 않는다.
- 실시간 화면은 `DB.watchGroup` / `DB.watchAll` / `DB.watchJudge`(onSnapshot)로 받는다. 반환값은 멈추는 함수, `.refresh()`로 다시 받기.
- 번호 고르기는 `DB.claimMember(g, m, deviceId, name)` (트랜잭션, 이름도 함께 저장. 이미 내 번호면 이름만 고침).
- 학생 글 저장은 `DB.saveMember(g, m, data, deviceId)` — claimedBy를 함께 보내고, 선택이 풀렸거나 남의 번호면 규칙이 거절 → `err.code === 'released'` → `leaveReleased()`. my-thought는 저장 직전 `checkClaim`도 확인하고, `watchGroup`으로 풀림을 바로 알아챈다.
- 판단 O/X는 `DB.changeJudge(caseId, key, ±1, CLASS_SIZE)`(트랜잭션, 한 칸씩)로만 바꾼다. judge.js는 누름을 줄(queue)에 넣고 하나씩 보내며, 저장 중에 온 실시간 값은 `rev`가 큰 것만 쓴다.
- 정리 판서는 `DB.changeBoard(op)`(트랜잭션, op = add/update/remove/move/conclusion)로만 바꾸고 `DB.watchBoard`로 받는다. 계산 규칙(`applyBoardOp`)은 db.js와 db.local.js가 같다.
- 저장이 3.5초 넘게 안 끝나면 `slowSaveNotice()`(common.js)가 "인터넷이 끊겼어요…" 안내를 띄운다.
- 보안 규칙은 `firestore.rules`. 고치면 Firebase 콘솔 → Firestore → 규칙에 붙여넣고 [게시]. 글자 수 제한(300자)·인원 제한(0~999)은 db.js 상수와 맞춘다.
- members 규칙: 글(strength/limit/updatedAt)을 쓰거나 바꾸는 쓰기는 기존·새 문서의 claimedBy가 둘 다 있고 같을 때만 허용. 새 문서는 번호 고르기(name/claimedBy/claimedAt)로만 만든다. 이름(name, 1~10자)은 고른 기기만 바꾸거나 빈 번호를 새로 고를 때 쓴다. 선택 풀기(claimedBy/claimedAt만 지우기)는 허용.
- board 규칙: 칸마다 항목 10개, 키워드 30자, 설명 80자, 핵심 문장 150자, 모둠 태그 1~4.
- 회차(세션) 기능은 없다. 데이터 구조:

```
groups/{1~4}                  { strength, limit, updatedAt }   ← 모둠이 정리한 장점/한계
groups/{1~4}/members/{1~5}    { name, strength, limit, updatedAt, claimedBy, claimedAt }   ← 학생 이름·개인 생각 + 고른 기기
judge/{사례id}                 { firstO, firstX, finalO, finalX, updatedAt, rev }  ← AI 활용 판단 O/X 인원(처음/최종), rev = 바뀐 횟수
board/summary                 { abilities:[항목], limits:[항목], conclusion, updatedAt, rev }  ← 교사 정리 판서
                              항목 = { id, keyword, desc, groups:[1~4] }
```
- 전체 초기화(`DB.resetAll`)와 CSV 내보내기는 모둠 결과(이름 포함) + judge 기록 + 정리 판서를 모두 포함한다.
- 필드: `strength` = 장점(능력, 300자까지), `limit` = 한계(300자까지), `updatedAt` = 저장 시각(ms 숫자). 입력칸 `maxlength`도 300.
- `name` = 학생 이름(성 빼고, 1~10자, 앞뒤 공백 제거). `claimedBy` = 번호를 고른 기기 ID, `claimedAt` = 고른 시각. 교사 results 크게 보기의 [선택 풀기]는 이 두 필드만 지우고 글은 남긴다. 모둠 초기화는 선택도 함께 지운다.
- 판단 O/X는 처음·최종 각각 O+X ≤ `CLASS_SIZE`(common.js, 기본 20).
- (db.local.js에서는 localStorage 키 = 위 경로 앞에 `ailit:`)

## 콘텐츠 규칙
- 스토리·정리·판단 사례 같은 내용은 `data/` 폴더의 JSON으로 분리한다. **코드에 하드코딩하지 않는다.**
- 이야기 JSON의 `"mode"`: `"scenes"`면 클릭할 때마다 장면(이미지, 화자, 대사)이 넘어가고, `"video"`면 영상 재생.
- 이야기 JSON 형식 (`data/stories/storyN.json`, 이미지 경로는 사이트 루트 기준):

```json
{
  "id": 1,
  "title": "카드 제목",
  "intro": "카드에 보이는 한 줄 소개",
  "mode": "scenes",
  "scenes": [
    { "image": "assets/img/story1-1.png", "role": "student", "speaker": "화자", "text": "대사" }
  ]
}
```
- `role`: 이름표 색 — `"narrator"`(해설) / `"student"`(학생) / `"ai"`(AI). 없으면 화자 이름으로 추측.
- `image`가 없거나 못 읽으면 "그림 준비 중" 회색 박스로 대신 보인다.
- 정리 JSON 형식 (`data/summary.json`): `title`, `abilities`(능력)·`limits`(한계) 배열의 각 항목 `{ "keyword": "키워드", "desc": "한 줄 설명", "stories": [2] }`, `conclusion`(맨 아래 핵심 문장). 항목 개수는 자유.
- 판단 사례 JSON 형식 (`data/judge-cases.json`): `title`, `cases` 배열의 각 항목 `{ "id": "case1", "title": "...", "situation": "과제 설명", "image": "assets/img/judge1.png", "questions": ["질문1", "질문2", "질문3"] }`. 정답은 넣지 않는다. `id`는 O/X 기록 저장 키라서 수업 중에는 바꾸지 않는다.
- 영상 모드: `"mode": "video"`, `"video": "assets/video/story1.mp4"`, (선택) `"poster": "assets/img/story1-poster.png"`. 영상이 끝나면(또는 영상이 없으면) [적으러 가기] 버튼이 나온다.

## 사용자·디자인 규칙
- 사용자는 초등 6학년: **한국어 UI, 큰 글씨, 큰 버튼**, 태블릿 기준 반응형.
- 디자인 콘셉트 "AI 탐구 노트": 학생 화면은 모눈 노트 바탕 + 흰 종이 카드, 장식은 **관찰 도장**(이중 테두리·살짝 기울기) 하나만. 교사 화면은 모눈·기울기 없이 대비 강하게.
- 색·글꼴은 `css/common.css`의 토큰만 쓴다 (페이지 css에 새 색 하드코딩 금지). 의미 색 고정: 능력 `--strength`(초록) / 한계 `--limit`(주황) / AI `--ai`(보라). 주 버튼은 남색 `--primary`.
- 6모둠은 색 + 모양 + 번호: `[data-g]`가 `--gc`(채우기), `--gc-text`(흰 바탕 글자), `--shape`(clip-path: ● ▲ ■ ◆ ★ ⬢)를 정해 준다.
- 웹폰트는 Pretendard 1종(jsdelivr dynamic subset). 글자 대비 WCAG AA(4.5:1) 이상, 버튼 터치 영역 48px 이상, `prefers-reduced-motion` 지원.
- 교사 페이지는 TV에 띄울 발표용 → `<html class="teacher">` + `<body class="teacher">` (html에도 있어야 rem 기준이 커짐). 글씨는 화면 높이에 맞춰 20~30px(1920×1080 ≈ 30px, 1366×768 ≈ 20px).
- 화면 맞춤 목표: 1024×768, 1366×768, 1920×1080에서 스크롤 없이 핵심 버튼·O/X·6모둠이 보이게. 교사 결과·판단은 `.fit-screen`(100dvh) + `.fit-fill`, 학생 이야기·내 생각은 가로 화면에서 버튼 줄을 아래에 고정.
- 그리드 칸은 `minmax(0, 1fr)`, 본문은 `overflow-wrap: anywhere` — 띄어쓰기 없는 긴 글로 가로 넘침 방지.
- **개인정보 최소화**: 학생 이름은 **성 빼고 이름만** 저장한다 (로그인이 없어 주소를 아는 사람은 읽을 수 있음). 수업이 끝나면 CSV로 내보낸 뒤 [전체 초기화]로 지운다. 그 밖의 개인정보는 저장하지 않는다.
- 학생의 모둠·번호는 localStorage에 저장하고(탭을 닫아도 유지), `js/common.js`의 `setStudent()` / `getStudent()`로만 다룬다.
- 교사 비밀번호는 `js/common.js`의 `TEACHER_PASSWORD` 상수. 수업용 간단 잠금일 뿐 보안 기능이 아니다.

## 폴더 구조
```
index.html
student/  stories.html, story.html, my-thought.html, group.html
teacher/  results.html, summary.html, judge.html
css/      common.css + 페이지별 css
js/       db.js, common.js + 페이지별 js
data/     stories/story1.json ~ story4.json, summary.json, judge-cases.json
assets/img/
```

## 페이지 흐름
1. `index.html`: 웹 제목 + 1~6모둠 선택 버튼. 오른쪽 아래 [결과 모아보기] 버튼(교사용, 비밀번호 입력 후 진입)
2. `student/stories.html`: 이야기 1~4 선택. **고른 이야기 번호 = 학생 번호**. 같은 모둠에서 한 이야기는 한 기기만 고른다(`DB.claimMember`, 트랜잭션). 다른 기기가 고른 카드는 "○번 친구가 골랐어요" + 비활성화. 아직 글을 안 썼으면 다른 이야기로 바꿀 수 있고, 썼으면 교사 [선택 풀기]가 필요
3. `student/story.html?id=N`: 이야기 보기 (scenes / video)
4. `student/my-thought.html`: 내가 찾은 AI의 장점(능력)과 한계 작성 후 저장
5. `student/group.html`: 이야기 1~4별 칸(자기 번호 칸만 작성, 다른 칸은 보기만) + "우리 모둠이 정리한 장점/한계" 공동 칸
6. `teacher/results.html`: 1~6모둠 카드(모둠 정리 내용), 카드 클릭 시 1~4번 개인 생각 표시
   - 모둠별 [초기화], [전체 초기화] — 둘 다 확인창을 띄운다
   - [결과 내보내기(CSV)] — UTF-8 BOM을 붙여 엑셀에서 한글이 안 깨지게. 열: 모둠, 구분(모둠정리/1~4번), 장점, 한계, 수정시각
   - 초기화 버튼 근처에 "초기화 전에 내보내기를 먼저 하세요" 안내
7. `teacher/summary.html`: `data/summary.json`의 예시 정답을 보여주는 정리 페이지
8. `teacher/judge.html`: `data/judge-cases.json`의 AI 활용 여부 판단 사례 제시

## 저장·복사
- 작업 폴더: `c:\Users\y0402\Desktop\com`
- 완성본 복사 위치: `G:\내 드라이브\AI 작업 허브\03_바이브코딩\20261125_AI활용판단웹앱`
- 복사는 **단계가 끝났을 때 또는 사용자가 요청할 때만** 한다. `.git` 폴더는 제외한다.
