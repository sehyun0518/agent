# Codex Agent Wrappers

이 디렉터리의 파일은 Codex 전용 역할 래퍼다. 실제 역할 본문은 루트
`agents/*.md`가 단일 출처다.

사용 순서:

1. 필요한 역할 래퍼를 연다.
2. 래퍼의 `source`가 가리키는 루트 `agents/<role>.md`를 읽는다.
3. 필요한 스킬은 `.codex/skills/<skill>/SKILL.md`에서 읽는다.
4. Codex 하위 에이전트 도구가 있으면 래퍼와 원본 역할을 프롬프트로 넘기고,
   없으면 메인 Codex 세션에서 같은 역할을 수행한다.

역할 본문을 수정해야 하면 이 디렉터리보다 루트 `agents/`를 먼저 수정한다.
