# Codex Harness Entry

Codex 전용 진입점은 `.codex/AGENTS.md`다. 그 문서는 **생성물**이므로 직접 편집하지 않는다.

## 단일 출처

| 영역 | 위치 |
|---|---|
| 작업 계약 | `capabilities/<id>/capability.yaml` |
| 역할 본문 | `capabilities/<id>/agents/` · `profiles/<id>/agents/` |
| 도메인 바인딩 | `profiles/<id>/profile.yaml` |
| 조정자 | `packages/orchestrator/` |
| 워크플로 | `workflows/` |
| 정책 | `policies/` |
| 통제 어휘 | `docs/vocabulary.md` |
| 프로젝트 상수 | `AGENT.md` · `DESIGN.md` |

`.claude/` · `.cursor/` · `.codex/`는 전부 생성 산출물이다. 소스를 고치고
`npm run generate`를 돌린다. CI가 재생성 결과와 커밋 상태를 대조한다.

전체 구조와 유지보수 절차는 `README.md`에 있다.
