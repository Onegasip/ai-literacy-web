# AI 리터러시 수업 웹앱 — 프로젝트 규칙

초등 6학년 AI 리터러시 수업 "과제의 특성에 따라 AI 활용 여부 판단하기"에서 쓰는 웹앱.
학생은 모둠별로 이야기를 읽고 AI의 **장점(능력)** 과 **한계**를 찾아 정리하고, 교사는 TV에 결과를 띄워 함께 정리한다.

## 기술 규칙
- 빌드 도구·프레임워크 없이 **순수 HTML + CSS + JS**. GitHub Pages로 배포한다.
- 페이지마다 html / css / js 파일을 **따로 분리**한다. (예: `student/story.html` + `css/story.css` + `js/story.js`)
- 공통 스타일은 `css/common.css`, 공통 기능은 `js/common.js`.
- 스크립트는 ES 모듈이 아닌 일반 `<script>`로 불러온다. 순서: `js/db.js` → `js/common.js` → 페이지 js.
- 모든 경로는 **상대 경로**로 쓴다. (GitHub Pages 하위 경로 `/<저장소이름>/`에서도 동작해야 함)
- JSON을 `fetch`로 읽으므로 로컬 확인은 VS Code Live Server 또는 `python -m http.server`로 한다. (`file://`로 열면 JSON을 못 읽음)

## DB 규칙
- DB 관련 코드는 **`js/db.js` 한 파일에만** 둔다. 지금은 localStorage 임시 버전, 나중에 Firebase(Firestore)로 교체한다.
- db.js 밖에서 localStorage를 직접 쓰지 않는다.
- db 함수는 모두 `async`(Promise 반환)로 만든다 → Firebase로 바꿔도 호출하는 쪽 코드는 그대로.
- 회차(세션) 기능은 없다. 데이터 구조:

```
groups/{1~6}                  { strength, limit, updatedAt }   ← 모둠이 정리한 장점/한계
groups/{1~6}/members/{1~4}    { strength, limit, updatedAt }   ← 학생 개인 생각
```
- 필드: `strength` = 장점(능력), `limit` = 한계, `updatedAt` = 저장 시각(ms)
- localStorage 키는 위 경로 앞에 `ailit:`를 붙인다. (예: `ailit:groups/3/members/2`)

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
- 영상 모드: `"mode": "video"`, `"video": "assets/video/story1.mp4"`, (선택) `"poster": "assets/img/story1-poster.png"`. 영상이 끝나면(또는 영상이 없으면) [적으러 가기] 버튼이 나온다.

## 사용자·디자인 규칙
- 사용자는 초등 6학년: **한국어 UI, 큰 글씨, 큰 버튼**, 태블릿 기준 반응형.
- 교사 페이지는 TV에 띄울 발표용 → `<body class="teacher">`로 글씨를 더 크게.
- **개인정보(이름 등)는 저장하지 않는다.** 모둠 번호 + 학생 번호만 쓴다.
- 학생의 모둠·번호는 sessionStorage에 저장하고, `js/common.js`의 `setStudent()` / `getStudent()`로만 다룬다.
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
2. `student/stories.html`: 이야기 1~4 선택. **고른 이야기 번호 = 학생 번호**. 모둠/번호는 sessionStorage에 저장
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
