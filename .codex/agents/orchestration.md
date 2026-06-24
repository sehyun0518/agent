---
name: orchestration
source: ../../agents/orchestration.md
skills:
  - requirements-spec
codex_role: planner
---

# Orchestration Role for Codex

원본 역할 정의는 `agents/orchestration.md`다. Codex에서는 이 역할을 메인 드라이버로
운용한다.

## 사용

1. `agents/orchestration.md`를 읽고 §4 루프와 §9 프론트엔드 인스턴스화를 따른다.
2. 완결성 게이트에는 `.codex/skills/requirements-spec/SKILL.md`를 사용한다.
3. Codex 하위 에이전트 도구가 있으면 `.codex/agents/<role>.md`를 각 역할
   프롬프트로 넘긴다. 없으면 동일한 DAG를 메인 세션에서 순차/병렬 가능한 단위로
   직접 수행한다.
4. 오케스트레이션 역할은 코드 수정을 직접 하지 않는다. 브리프 생성, 위임, 통합,
   실패 라우팅만 담당한다.
