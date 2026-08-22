---
description: 읽기 전용으로 현재 상태를 확인한다. 파일 수정·staging·commit·push·PR 생성을 하지 않는다. 다른 변형을 부르기 전에 무엇을 대상으로 하는지 먼저 보게 하는 것이 목적이다.
---

Capability `git-operations`의 `inspect` 변형을 실행한다.

계약과 절차는 `capabilities/git-operations/capability.yaml`가 소유한다. 이 파일은 진입점일 뿐이라 내용을 복제하지 않는다.

이 커맨드는 다른 커맨드를 이어서 부르지 않는다. 다음 단계가 필요하면 사람이 다시 부른다.
