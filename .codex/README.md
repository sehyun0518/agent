# .codex — Codex 이식

기존 하네스(`agents/`, `skills/`)를 Codex에서 쓰기 위한 전용 미러다. 원본
내용은 루트의 `agents/`와 `skills/`가 단일 출처이며, 여기서는 Codex가 읽기 쉬운
진입점과 `SKILL.md` 포맷만 제공한다.

전체 레이어 설계, 서브에이전트 플로우, 실패 라우팅, 유지보수 절차는 루트
`README.md`를 먼저 본다. 이 문서는 Codex 미러에 한정된 사용법만 다룬다.

## 구조

```text
.codex/
  README.md
  AGENTS.md              # Codex 운용 규칙
  agents/                # 역할별 얇은 래퍼
    discussion.md
    orchestration.md
    spec.md
    design.md
    state-data.md
    implementation.md
    tester.md
    accessibility.md
    review.md
  skills/                # Codex SKILL.md 미러
    requirements-spec/SKILL.md
    react-best-practice/SKILL.md
    react-native-skills/SKILL.md
    ...
```

루트 `AGENTS.md`는 Codex 표준 진입점으로 `.codex/AGENTS.md`를 가리킨다.

## Claude/Cursor와의 차이

- Claude 미러는 `.claude/agents`와 `.claude/skills`를 네이티브 형식으로 둔다.
- Cursor 미러는 `.cursor/agents`와 `.cursor/rules`를 네이티브 형식으로 둔다.
- Codex 미러는 `AGENTS.md`를 진입점으로 삼고, 역할 문서는 필요 시 읽는 래퍼로 둔다.
  로컬 Codex가 프로젝트 `.codex/skills`를 자동 발견하지 않는 환경이면
  `.codex/AGENTS.md`의 지시에 따라 필요한 `SKILL.md`를 직접 읽는다.

## 유지보수

역할 본문을 바꿀 때는 먼저 루트 `agents/*.md`를 수정한다. 스킬 본문을 바꿀 때는
루트 `skills/`와 `.claude/skills/`의 기존 흐름을 맞춘 뒤, `.codex/skills/`를 다시
동기화한다. `.codex/agents/*`에는 Codex 운용상 필요한 차이만 적는다.
