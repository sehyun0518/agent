# ADR-0006: cursor 미러를 생성 대상에서 뺀다

- 상태: accepted
- 날짜: 2026-08-21
- 부분 대체: ADR-0001 (플랫폼 미러 3종 → 2종)
- 관련 PR: #20

## 배경

ADR-0001은 소스에서 `.claude`·`.cursor`·`.codex` 세 미러를 생성하기로 했다. 그 뒤로
cursor 쪽 렌더러만 유지 비용이 계속 늘었다.

**산출물 구조가 비대칭이다.** claude와 codex는 역할 래퍼와 스킬 미러, 진입점 하나가
전부다. cursor는 여기에 `rules/00-pipeline.mdc`와 `rules/10-skills-index.mdc`가 더
붙는다. 앞의 것은 Capability·워크플로·프로파일을 요약해 다시 그리고, 뒤의 것은 스킬
목록을 다시 그린다.

**요약을 다시 그리는 것 자체가 드리프트의 원인이다.** claude는 본문을 그대로 복제하고
codex는 소스를 참조한다. 둘 다 해석이 들어가지 않는다. 반면 요약본은 소스의 구조를
읽어 별도 표현으로 옮기므로, 소스에 필드가 생기면 렌더러도 함께 고쳐야 한다. 안 고치면
조용히 틀린 문서가 남는다.

실제로 그런 일이 있었다. `renderCursorPipeline`이 `workflowExtensions`를 `flatMap`으로
평탄화하면서 각 삽입이 어느 워크플로 소속인지와 `anchorStep`을 버렸다.

```text
워크플로 확장: ... `state-data` → parallel-with `implementation` ·
                  `state-data` → parallel-with `implementation`
```

`state-data`가 한 파이프라인에 두 번 붙는 것으로 읽힌다. 실제로는 change와 bugfix에
하나씩이고 `anchorStep`도 `logic` / `logic-fix`로 다르다. 이 파일을 읽는 에이전트는
중복 호출로 오해할 근거를 갖는다. claude와 codex는 이 목록을 아예 그리지 않아 같은
문제가 없다.

**경계도 흐려져 있었다.** codex 렌더러가 쓰는 `sourcePathOf`와 `ownerLabel`이 Cursor
섹션 안에 정의돼 있었다. 섹션을 지우면 codex 생성이 깨지는 상태였다.

## 결정

cursor를 생성 대상에서 뺀다. 미러는 `.claude`와 `.codex` 둘만 유지한다.

- `.cursor/` 15개 파일 삭제
- `tooling/generators/platforms.json`의 `cursor` 항목 삭제
- `tooling/generators/generate.mjs`의 `renderCursorAgent`·`renderCursorPipeline`·
  `renderCursorSkillsIndex`·`renderCursorReadme`와 디스패치 분기 삭제
- `sourcePathOf`·`ownerLabel`은 공통 절로 옮겨 유지
- 문서와 CI의 `.cursor` 언급 제거

## 다시 추가한다면

`platforms.json`에 항목을 넣고 렌더러를 쓰면 된다. 구조는 그대로 남아 있다.

다만 **요약을 다시 그리는 산출물은 만들지 않는다.** 파이프라인이나 스킬 목록을 렌더러가
해석해 옮기는 순간 같은 문제가 반복된다. 역할 래퍼처럼 소스를 참조하거나 그대로 복제하는
형태만 만든다.

## 대가

cursor로 이 하네스를 쓰던 경로가 사라진다. 지금 이 저장소를 쓰는 사람이 없어 실제 손해는
없지만, 필요해지면 위 조건으로 다시 만들어야 한다.

## 결과

- 생성기에서 141줄이 빠졌다. 남은 렌더러는 소스를 참조하거나 복제하기만 한다.
- 소스에 필드가 늘어도 렌더러를 함께 고칠 일이 없다.
- 잘못된 요약을 읽고 오해할 여지가 사라졌다. 삽입 중복 여부는 이제 검증기가 판정한다
  (`findDuplicateInserts`).
- CI의 드리프트 검사 대상이 두 디렉터리로 줄었다.

## 현재 강제 범위

`npm run check`가 `.claude`와 `.codex`의 드리프트를 검사한다. `.cursor`는 검사 대상이
아니며, 누군가 수동으로 만들어도 검증기나 CI가 알려주지 않는다. 생성 대상이 아니기
때문이다.

ADR-0001의 "플랫폼 미러 3종" 서술은 이 ADR로 대체된다. 나머지 결정은 그대로 유효하다.
