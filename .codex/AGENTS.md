# Codex Agent Harness

**이 파일은 생성물이다. 직접 편집하지 않는다.** 소스를 고치고 `npm run generate`를 돌린다.

## 단일 출처

| 영역 | 위치 |
|---|---|
| 작업 계약 | `capabilities/<id>/capability.yaml` |
| 역할 본문 | `capabilities/<id>/agents/` · `profiles/<id>/agents/` |
| 도메인 바인딩 | `profiles/<id>/profile.yaml` |
| 조정자 | `packages/orchestrator/` |
| 워크플로 | `workflows/` |
| 정책 | `policies/` |
| 어휘 | `docs/vocabulary.md` |

`.codex/`는 Codex 운용을 위한 얇은 래퍼와 `SKILL.md` 미러만 둔다.

## Capability

- `implementation` — 실제 구현
- `requirements` — 요구사항 논의
- `review` — 통합 검토
- `specification` — 계약 고정

## 워크플로



## 프로파일

- `frontend` — 프론트엔드 도메인 프로파일

## 운용 원칙

1. 요구사항이 모호하면 `requirements`부터 시작해 스펙을 완결한다.
2. 스펙이 충분하면 `packages/orchestrator/orchestrator.md`를 기준으로 분해한다.
3. 역할 실행은 `.codex/agents/<id>.md`를 열고 그 `source` 원본을 함께 따른다.
4. **증거 없이 다음 단계로 가지 않는다.** 상태 플래그가 아니라 증거가 전이 근거다.
5. 구현은 `test.red-confirmed` 없이 시작하지 않는다.
6. Git 작업은 서로 연쇄하지 않는다. 커밋·푸시·PR을 각각 명시적으로 호출한다.
7. 커밋·PR에 자동화 도구 출처 문구를 자동으로 넣지 않는다.

## 드리프트 방지

`.codex/agents/*`는 원본을 복제하지 않는다. 역할을 바꾸려면 소스를 고치고 재생성한다.
CI가 재생성 결과와 커밋 상태를 대조한다.
