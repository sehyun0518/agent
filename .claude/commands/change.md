---
description: 설계가 순수 함수와 UI 책임을 먼저 고정하고, unit → ui → integration → e2e 각 계층에서 red 확인 뒤 구현하고 green을 확인한다. Git 작업은 자동으로 붙지 않는다.
---

`workflows/change.yaml`를 읽고 그 순서대로 진행한다. 단계 28개다.

각 step의 `expect`·`expectAnyOf`가 전이 조건이고, `gate`가 가리키는
`workflows/gates/*.md`가 무엇을 봐야 하는지 정한다. `skippable`이 있는 단계만
생략할 수 있고, 생략하면 사유를 증거로 남긴다.

순서를 여기 옮겨 적지 않는다. 워크플로 파일이 단일 출처다.

**워크플로 파일에 없는 단계가 3개 더 있다.**

- `profiles/frontend/profile.yaml`의 `workflowExtensions` — `design` · `accessibility` · `state-data`

삽입 지점은 프로파일이 소유하므로 그 파일에서 읽는다. 워크플로 파일만 따르면
도메인 단계가 통째로 빠지고, 아무것도 그것을 지적하지 않는다.

**자동이 아닌 것.** 이 저장소에는 워크플로 실행 엔진도 증거 저장소도 없다
(ADR-0002). 단계 호출과 증거 기록은 사람 또는 메인 에이전트가 한다. 게이트가
증거를 본다고 돼 있으면 그 증거를 실제로 남겼는지 직접 확인해야 한다.

Git 작업은 이 흐름에 자동으로 붙지 않는다. `/git-commit`처럼 따로 부른다.
