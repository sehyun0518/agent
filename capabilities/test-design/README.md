# Test Design 레이어

Test Design 레이어는 고정된 테스트 계획에 따라 한 계층의 테스트를 작성합니다. 이 레이어는
테스트를 실행하지 않으며 제품 코드를 수정하지 않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 한 번의 호출에서 하나의 테스트 계층만 다룹니다.
- 이 레이어는 활성 프로파일이 지정한 라이브러리와 파일 패턴을 따릅니다.
- 이 레이어는 수용 기준을 관찰 가능한 단언으로 변환합니다.
- 이 레이어는 테스트를 실행하거나 실패 원인을 판정하지 않습니다.
- 이 레이어는 제품 코드와 다른 계층의 테스트를 수정하지 않습니다.

## 흐름에서의 위치

```text
contract + testids + test-plan → Test Design#<layer> → test suite → Test Execution#<layer>
```

워크플로는 Unit, UI, Integration, E2E 순서로 이 레이어를 호출합니다. 각 호출은 독립된
테스트 파일 집합과 완료 신호를 생성합니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 입력 | `specification.contract` | 테스트가 검증할 타입과 동작 계약을 사용합니다. |
| 입력 | `specification.testids` | UI 테스트가 사용할 식별자 규약을 사용합니다. |
| 입력 | `specification.test-plan` | 계층별 책임과 적용 여부를 사용합니다. |
| 입력 신호 | `specification.completed` | 계약이 고정됐음을 확인합니다. |
| 출력 | `test-design.<layer>.suite` | 해당 계층의 테스트 파일 집합을 생성합니다. |
| 완료 신호 | `test-design.<layer>.completed` | 해당 계층의 테스트 작성이 끝났음을 알립니다. |
| 증거 | `changed-files` | 작성하거나 수정한 테스트 파일을 기록합니다. |

## 실행 단위

| Variant | 작성하는 테스트 | 경계 |
|---|---|---|
| `unit` | 순수 함수의 입출력 테스트를 작성합니다. | DOM과 컴포넌트를 포함하지 않습니다. |
| `ui` | 실제 컴포넌트의 렌더링과 상호작용 테스트를 작성합니다. | 네트워크와 여러 모듈의 실제 연결을 포함하지 않습니다. |
| `integration` | 여러 모듈과 데이터 경계의 연결 테스트를 작성합니다. | 전체 브라우저 사용자 여정을 포함하지 않습니다. |
| `e2e` | 브라우저 사용자 여정 테스트를 작성합니다. | 세부 구현 구조를 단언하지 않습니다. |

모든 variant는 같은 `tester` agent를 사용합니다. 실행 시점에 선택된 variant가 작업 범위를
제한합니다.

## 완료와 실패

선택한 계층의 `changed-files`가 기록되어야 레이어를 완료합니다.

| 상황 | 처리 방식 |
|---|---|
| 계약이나 테스트 계획이 부족합니다. | Specification 레이어로 돌아갑니다. |
| 테스트가 계약과 충돌합니다. | Specification에 판단을 요청합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 공통 입력과 계층별 variant 계약을 정의합니다. |
| [agents/tester.md](agents/tester.md) | 테스트 작성 절차와 계층 경계를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Test Execution 레이어](../test-execution/README.md)는 작성된 테스트의 실행 방법을 설명합니다.
- [ADR-0004](../../docs/adr/0004-layered-red-green.md)는 계층별 red-green 순서를 설명합니다.
