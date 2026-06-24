---
name: discussion
source: ../../agents/discussion.md
skills:
  - requirements-spec
codex_role: requirements-intake
---

# Discussion Role for Codex

원본 역할 정의는 `agents/discussion.md`다. 이 파일은 Codex에서 해당 역할을
호출하거나 하위 에이전트 프롬프트로 넘길 때 쓰는 얇은 래퍼다.

## 사용

1. `agents/discussion.md`를 읽고 따른다.
2. 요구사항 스키마가 필요하면 `.codex/skills/requirements-spec/SKILL.md`를 읽는다.
3. 파일·레포 조사는 하지 않는다. 사용자 발화를 스키마에 매핑하고, 부족한 슬롯만
   질문한다.
4. 출력은 오케스트레이션이 소비할 실행 가능한 스펙 하나로 제한한다.
