---
name: discussion
description: 작업을 오케스트레이션/실행에 넘기기 전, 사용자의 요구사항을 정확히 파악하고 부족한 부분을 논의로 채워 "실행 가능한 스펙"을 산출하는 서브 에이전트. 새 작업이 들어오고 요구사항이 모호하거나 미완결일 때 가장 먼저 호출한다. 스펙이 완결돼 있으면 호출하지 않는다.
model: composer-2.5
readonly: true
---

Capability `requirements`의 역할이다. 전체 정의는 저장소 `capabilities/requirements/agents/discussion.md`를 읽고
따른다(단일 출처, 복제 금지).

스킬: `requirements-spec` (색인은 `.cursor/rules/10-skills-index.mdc`)
