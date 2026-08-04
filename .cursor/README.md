# .cursor — 생성된 미러

**이 디렉터리는 생성물이다. 직접 편집하지 않는다.** 소스는 `capabilities/`·`profiles/`·
`packages/orchestrator/`이고, `npm run generate`가 여기를 만든다. CI가 재생성 결과와
커밋 상태를 대조하므로 손으로 고친 내용은 되돌아간다.

## 구성

```text
.cursor/
  README.md
  agents/     역할 래퍼 (본문은 소스를 참조)
  rules/
    00-pipeline.mdc      항상 로드 — Capability 흐름과 전이 규칙
    10-skills-index.mdc  스킬 색인
```

## 로스터

| 에이전트 | 소유 | 모델 | 권한 |
|---|---|---|---|
| `implementation` | Capability implementation | composer-2.5 | 쓰기 |
| `discussion` | Capability requirements | composer-2.5 | 읽기 전용 |
| `review` | Capability review | gpt-5.5 | 읽기 전용 |
| `spec` | Capability specification | gpt-5.5 | 쓰기 |
| `orchestration` | 조정자 (Capability 아님) | gpt-5.5 | 읽기 전용 |
| `design` | 프로파일 frontend | gpt-5.5 | 쓰기 |
| `accessibility` | 프로파일 frontend | gpt-5.5 | 쓰기 |
| `state-data` | 프로파일 frontend | composer-2.5 | 쓰기 |

## 매핑 메모

- Cursor는 frontmatter `tools`를 쓰지 않는다. 권한 경계는 소스의 `permissions`가 선언하고
  검증기가 검사한다.
- `background: true` → `is_background: true`.
- 모델 이름은 티어(`cheap`/`strong`)를 이 플랫폼 값으로 옮긴 것이다. 바꾸려면
  `tooling/generators/platforms.json`을 고친다.

Capability 4종의 계약은 각 `capabilities/<id>/capability.yaml`이 단일 출처다.
