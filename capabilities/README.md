# Capability 레이어 안내서

Capability는 하네스가 수행하는 하나의 작업 유형입니다. 이 저장소에서는 Capability와
레이어를 같은 의미로 사용합니다. 각 레이어는 자신의 계약, 역할 지침, 산출 검사를 하나의
디렉터리에서 관리합니다.

## 레이어 목록

| 레이어 | 역할 | 상세 문서 |
|---|---|---|
| `requirements` | 사용자 발화를 실행 가능한 요구사항으로 정리합니다. | [Requirements](requirements/README.md) |
| `specification` | 요구사항을 계약과 테스트 계획으로 고정합니다. | [Specification](specification/README.md) |
| `test-design` | 적용할 계층의 테스트를 작성합니다. | [Test Design](test-design/README.md) |
| `test-execution` | 테스트를 실행하고 결과 증거를 기록합니다. | [Test Execution](test-execution/README.md) |
| `implementation` | 확인된 red를 구현으로 green으로 만듭니다. | [Implementation](implementation/README.md) |
| `documentation` | 변경 때문에 낡은 문서를 갱신합니다. | [Documentation](documentation/README.md) |
| `review` | 계약과 증거를 바탕으로 최종 판정을 내립니다. | [Review](review/README.md) |
| `git-operations` | Git과 GitHub 작업을 수동으로 수행합니다. | [Git Operations](git-operations/README.md) |

## 디렉터리를 읽는 순서

레이어를 이해하거나 수정할 때는 다음 순서로 확인합니다.

1. `README.md`에서 레이어의 목적과 경계를 확인합니다.
2. `capability.yaml`에서 기계가 검사하는 계약을 확인합니다.
3. `agents/`에서 실행 역할의 상세 지침을 확인합니다.
4. `hooks/`, `tests/`, `evals/`에서 산출 검사와 평가 자료를 확인합니다.

README는 사람이 읽는 안내서입니다. README와 manifest의 값이 다르면
`capability.yaml`을 단일 출처로 사용합니다.

## 공통 실행 구조

모든 레이어는 같은 계약 구조를 사용합니다.

```text
requires
  → entrypoint 실행
  → evidence 기록
  → completion 판정
  → produces 전달
```

| 계약 항목 | 의미 |
|---|---|
| `requires` | 실행 전에 필요한 신호와 아티팩트를 선언합니다. |
| `entrypoints` | 실행할 agent, skill, hook을 선언합니다. |
| `permissions` | 파일 시스템, 네트워크, 파괴적 작업의 상한을 선언합니다. |
| `evidence` | 실행 결과를 판정할 근거를 선언합니다. |
| `completion` | 완료로 인정할 증거와 상태를 선언합니다. |
| `produces` | 다음 단계에 전달할 신호와 아티팩트를 선언합니다. |
| `failure` | 실패 종류별 재시도, 복귀, 중단 정책을 선언합니다. |
| `variants` | 같은 역할 안에서 분리해야 하는 실행 단위를 선언합니다. |

## 공통 책임 규칙

- 각 레이어는 자신의 산출물만 만듭니다.
- 각 레이어는 다른 레이어의 실행 순서를 직접 정의하지 않습니다.
- 각 레이어는 등록된 토큰으로만 입력과 출력을 전달합니다.
- 각 레이어는 자신의 산출 검사를 소유합니다.
- 워크플로는 레이어 사이의 이관 게이트를 소유합니다.
- 프로파일은 manifest가 허용한 도구, skill, hook, command만 주입합니다.
- 실행 역할은 자신의 권한 상한을 넘는 도구를 사용하지 않습니다.

## 새 레이어를 추가하는 방법

1. `capabilities/<id>/capability.yaml`에 계약을 작성합니다.
2. `capabilities/<id>/README.md`에 이 안내서와 같은 구조로 설명을 작성합니다.
3. `agents/`에 역할 지침을 작성하고 manifest에서 진입점을 연결합니다.
4. 필요한 토큰을 [통제 어휘](../docs/vocabulary.md)에 등록합니다.
5. 필요한 워크플로 단계와 이관 게이트를 `workflows/`에 추가합니다.
6. `npm run check`를 실행해 선언, 계약 테스트, 생성물 드리프트를 확인합니다.

중앙 registry는 만들지 않습니다. 검증기와 생성기는 `capabilities/*/capability.yaml`을
탐색해 레이어를 자동으로 발견합니다.

## 관련 문서

- [루트 안내서](../README.md)는 하네스의 전체 구조를 설명합니다.
- [작업 흐름 안내서](../docs/walkthrough.md)는 레이어가 연결되는 과정을 설명합니다.
- [운영 안내서](../docs/operations.md)는 게이트와 실패 복귀 규칙을 설명합니다.
- [통제 어휘](../docs/vocabulary.md)는 레이어 사이에 전달하는 토큰을 정의합니다.
- [ADR-0003](../docs/adr/0003-layer-harness-boundary.md)은 레이어와 하네스의 경계를 설명합니다.
