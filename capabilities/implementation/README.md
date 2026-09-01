# Implementation 레이어

Implementation 레이어는 같은 계층에서 확인된 red를 최소 구현으로 green으로 만듭니다.
이 레이어는 테스트 계획과 고정 계약을 소비하며 인수 기준 테스트를 새로 작성하지 않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 한 번의 호출에서 하나의 구현 variant만 다룹니다.
- 이 레이어는 고정된 계약과 검증된 순수 함수를 재사용합니다.
- 이 레이어는 이미 작성된 현재 계층 테스트를 green으로 만듭니다.
- 이 레이어는 계약, 디자인 토큰, 데이터 접근 인터페이스를 다시 정의하지 않습니다.
- 이 레이어는 인수 기준을 검증하는 테스트를 새로 작성하지 않습니다.

## 흐름에서의 위치

```text
계층별 red-proof → Implementation#<variant> → changed-files → 계층별 green 실행
```

동작을 구현하는 variant는 같은 계층의 red 증거가 있어야 시작합니다. 두 스캐폴드만
예외이며, 각 계층의 테스트가 import 오류가 아닌 단언 실패를 만들 수 있도록 최소
껍데기만 작성합니다 — `logic-scaffold`는 unit, `ui-scaffold`는 UI 계층을 받칩니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 공통 입력 | `specification.contract` | 구현할 타입과 인터페이스 계약을 사용합니다. |
| 공통 입력 | `specification.test-plan` | 현재 variant의 책임과 범위를 사용합니다. |
| 공통 입력 신호 | `specification.completed` | 계약이 고정됐음을 확인합니다. |
| 계층 입력 | `test.<layer>.red-confirmed` | 같은 계층의 동작 구현을 시작할 근거로 사용합니다. |
| 출력 | `implementation.patch` | 구현 변경 diff를 생성합니다. |
| 출력 | `implementation.summary` | 구현 범위와 검증 결과를 요약합니다. |
| 완료 신호 | `implementation.completed` | 호출된 구현 작업이 끝났음을 알립니다. |
| 단계 신호 | `implementation.<phase>.completed` | 해당 구현 variant가 끝났음을 알립니다. |
| 증거 | `changed-files` | 구현에서 변경한 파일을 기록합니다. |

## 실행 단위

| Variant | 구현 범위 | 시작 조건 |
|---|---|---|
| `logic-scaffold` | 계약된 경로, export, 시그니처로 import만 가능하게 만듭니다. | 고정된 계약이 필요합니다. red는 필요하지 않습니다. |
| `logic` | DOM에 의존하지 않는 순수 함수를 구현합니다. | `test.unit.red-confirmed`가 필요합니다. |
| `ui-scaffold` | 계약된 경로, export, props와 최소 렌더를 구현합니다. | Unit 테스트 결과가 필요합니다. |
| `ui` | 실제 렌더링과 상호작용을 구현합니다. | `test.ui.red-confirmed`가 필요합니다. |
| `integration` | 모듈, 상태, 데이터 경계의 연결을 구현합니다. | `test.integration.red-confirmed`가 필요합니다. |
| `e2e` | 사용자 여정을 완성하는 마지막 연결을 구현합니다. | `test.e2e.red-confirmed`가 필요합니다. |

`logic-scaffold`에는 반환값 계산을 넣지 않습니다. 계약된 시그니처로 호출만 되면 됩니다 —
단언은 실패해야 하고, 그 실패가 red의 재료입니다.

`ui-scaffold`에는 수용 기준 동작, 상태 계산, 네트워크 연결, 완성 스타일을 넣지 않습니다.
실제 UI 구현은 검증된 순수 함수를 소비하고 네트워크 로직을 컴포넌트 안에 다시 만들지
않습니다.

## 완료와 실패

선택한 variant의 `changed-files`가 기록되어야 레이어를 완료합니다. 구현자는 기존 테스트를
직접 실행해 자가 교정할 수 있지만, 그 실행 결과는 워크플로의 판정 증거가 아닙니다.
판정 증거는 Test Execution 레이어가 기록합니다.

| 상황 | 처리 방식 |
|---|---|
| 같은 계층의 red 증거가 없습니다. | Test Execution 레이어로 돌아갑니다. |
| 고정 계약과 구현이 충돌합니다. | Specification에 판단을 요청합니다. |
| 일시적인 구현 오류가 발생합니다. | 최대 두 번 재시도합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 공통 입력과 구현 variant 계약을 정의합니다. |
| [agents/implementation.md](agents/implementation.md) | 구현 절차와 variant별 경계를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Test Execution 레이어](../test-execution/README.md)는 red와 green 증거 생성을 설명합니다.
- [Review 레이어](../review/README.md)는 구현 결과의 최종 판정을 설명합니다.
- [ADR-0004](../../docs/adr/0004-layered-red-green.md)는 계층별 구현 순서를 설명합니다.
