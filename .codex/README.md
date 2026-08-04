# .codex — 생성된 미러

**이 디렉터리는 생성물이다. 직접 편집하지 않는다.** 진입점은 `.codex/AGENTS.md`.

- `agents/` — 역할 래퍼. 본문은 각 `source`가 가리키는 소스가 단일 출처다.
- `skills/` — `SKILL.md` 미러. 규칙 팩은 `rules/` 하위까지 그대로 옮긴다.

수정은 `capabilities/`·`profiles/`·`packages/orchestrator/`에서 하고
`npm run generate`를 돌린다. CI가 재생성 결과와 커밋 상태를 대조한다.
