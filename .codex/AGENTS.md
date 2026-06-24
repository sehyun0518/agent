# Codex Agent Harness

이 문서는 Codex 전용 진입점이다. 기존 하네스의 단일 출처는 그대로 유지한다:

- 프로젝트 상수: `AGENT.md`
- 디자인 시스템: `DESIGN.md`
- 역할 원본: `agents/*.md`
- 스킬 원본: `skills/`

`.codex/`는 Codex가 읽기 쉬운 운용 문서와 `SKILL.md` 포맷 미러만 둔다.
원본과 내용이 충돌하면 루트 원본을 우선한다.

## 운용 원칙

1. 새 작업이 모호하면 `.codex/agents/discussion.md`를 사용해 요구사항 스펙을
   먼저 완결한다.
2. 스펙이 충분하면 `.codex/agents/orchestration.md`를 기준으로 작업을 분해한다.
3. 역할별 실행이 필요하면 해당 `.codex/agents/<role>.md`를 읽고, 그 파일이
   가리키는 `agents/<role>.md` 원본을 함께 따른다.
4. 역할이 스킬을 요구하면 `.codex/skills/<skill>/SKILL.md`를 읽는다. 대형 스킬은
   필요한 rule 파일만 추가로 연다.
5. Codex 하위 에이전트 도구가 사용 가능하면 역할 문서를 하위 에이전트 프롬프트로
   넘긴다. 하위 에이전트가 없으면 같은 역할 순서를 메인 Codex 세션에서 수행한다.
6. 검증은 역할 원본의 하네스 기준을 따른다. green 전 종료 금지 원칙은 유지한다.

## 디렉터리

```text
.codex/
  AGENTS.md
  README.md
  agents/      # Codex 역할 래퍼
  skills/      # Codex SKILL.md 미러
```

## 역할 순서

1. `discussion`: 사용자 요구사항을 스펙으로 정리
2. `orchestration`: 스펙을 작업 그래프와 브리프로 분해
3. `spec` + `design`: 계약과 디자인 토큰을 병렬 산출 후 고정
4. `state-data` + `implementation` + `tester`: 고정 계약 기반 병렬 실행
5. `accessibility`: 통합 빌드 접근성 개선
6. `review`: 최종 게이트 판정과 소유자 라우팅

## 드리프트 방지

`.codex/agents/*`는 원본을 복제하지 않는다. 역할을 바꾸려면 먼저 `agents/*.md`를
수정하고, Codex 운용상 추가 설명이 필요할 때만 `.codex/agents/*`를 갱신한다.
