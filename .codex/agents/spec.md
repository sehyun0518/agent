---
name: spec
source: ../../agents/spec.md
skills:
  - architecture-avoid-boolean-props
  - architecture-compound-components
  - patterns-children-render-props
  - patterns-explicit-variants
codex_role: contract-author
---

# Spec Role for Codex

원본 역할 정의는 `agents/spec.md`다.

## 사용

1. `agents/spec.md`를 읽고 따른다.
2. 컴포넌트 API·계약 설계 시 frontmatter의 스킬을 `.codex/skills/*/SKILL.md`에서
   필요한 만큼 읽는다.
3. 구현·스타일링·데이터 레이어는 만들지 않는다.
4. 병렬 실행자가 기다리지 않도록 타입, props, API 스키마, 훅 시그니처, test-id를
   고정 가능한 파일로 산출한다.
