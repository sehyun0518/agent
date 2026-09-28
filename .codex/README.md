# .codex — 생성된 미러

**이 디렉터리는 생성물이다. 직접 편집하지 않는다.** 진입점은 `.codex/AGENTS.md`.

- `agents/*.toml` — Codex가 실제로 불러오는 네이티브 서브 에이전트와 역할별 MCP 설정이다.
- `agents/*.md` — 역할 안내. 본문은 각 `source`가 가리키는 소스가 단일 출처다.
- `skills/` — `SKILL.md` 미러. 규칙 팩은 `rules/` 하위까지 그대로 옮긴다.
- `rules/permissions.rules` — 승인·금지 명령을 Codex 런타임에 투영한 생성 규칙이다.

- `config.toml` — MCP 서버 설정. 하네스 관리 블록만 생성하며 나머지 설정은 보존한다.

수정은 `capabilities/`·`profiles/`·`packages/orchestrator/`에서 하고
`npm run generate`를 돌린다. CI가 재생성 결과와 커밋 상태를 대조한다.
