# Test Execution 레이어

Test Execution 레이어는 작성된 테스트를 실행하고 결과를 증거로 기록합니다. 이 레이어는
테스트와 제품 코드를 수정하지 않으며, 저장소 프로파일이 제공한 명령만 실행합니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 한 번의 호출에서 하나의 테스트 계층만 실행합니다.
- 이 레이어는 테스트 결과를 passed, failed, errored로 구분합니다.
- 이 레이어는 실패가 예상한 단언 때문인지 판정하고 red 증거를 기록합니다.
- 이 레이어는 실행 명령을 추측하거나 의존성을 자동으로 설치하지 않습니다.
- 이 레이어는 테스트나 제품 코드를 수정하지 않습니다.

## 흐름에서의 위치

```text
test suite → Test Execution#<layer> → red-proof 또는 green result → Implementation 또는 다음 계층
```

같은 variant를 red 확인과 green 확인에 모두 사용합니다. 워크플로가 호출 시점과 기대하는
증거를 구분합니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 공통 입력 | `specification.test-plan` | 실행할 계층과 기대 동작을 확인합니다. |
| 계층 입력 | `test-design.<layer>.suite` | 실행할 테스트 파일 집합을 사용합니다. |
| 계층 입력 신호 | `test-design.<layer>.completed` | 테스트 작성이 끝났음을 확인합니다. |
| 완료 신호 | `test.<layer>.completed` | 해당 계층의 테스트가 실행됐음을 알립니다. |
| red 신호 | `test.<layer>.red-confirmed` | 예상한 단언 실패가 확인됐음을 알립니다. |
| 결과 증거 | `test.<layer>.result` | 실행 결과와 원본 로그 위치를 기록합니다. |
| red 증거 | `test.<layer>.red-proof` | 실패 테스트명과 실패 메시지를 기록합니다. |
| 생략 증거 | `test.skip-justification` | 허용된 계층 생략 사유를 기록합니다. |

## 실행 단위

| Variant | 명령 키 | 판정 대상 |
|---|---|---|
| `unit` | `test.unit` | 순수 함수의 입출력을 판정합니다. |
| `ui` | `test.ui` | 실제 컴포넌트의 렌더링과 상호작용을 판정합니다. |
| `integration` | `test.integration` | 여러 모듈과 데이터 경계의 연결을 판정합니다. |
| `e2e` | `test.e2e` | 브라우저 사용자 여정을 판정합니다. |

명령 문자열과 작업 디렉터리는 소비 저장소의 `.agent-harness/profile.yaml`이 제공합니다.
명령 키가 없으면 실행을 추측하지 않고 `precondition-unmet`으로 처리합니다.

## 완료와 실패

선택한 계층의 `test.<layer>.result`가 기록되어야 레이어를 완료합니다. 테스트 단언 실패는
`failed`로 기록합니다. 컴파일, import, fixture, 러너 설정 오류는 `errored`로 기록하며
올바른 red로 인정하지 않습니다.

| 상황 | 처리 방식 |
|---|---|
| 테스트 파일이나 명령이 없습니다. | Test Design 또는 프로파일 소유자에게 돌아갑니다. |
| 실패가 계약과 충돌합니다. | Test Design에 판단을 요청합니다. |
| 일시적인 실행 오류가 발생합니다. | 최대 두 번 재시도합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 계층별 명령 키, 증거, 완료 조건을 정의합니다. |
| [agents/test-runner.md](agents/test-runner.md) | 실행과 결과 판정 절차를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Implementation 레이어](../implementation/README.md)는 red 증거를 소비하는 방법을 설명합니다.
- [소비 저장소 프로파일 안내서](../../docs/consumer-profile.md)는 테스트 명령 설정을 설명합니다.
- [ADR-0004](../../docs/adr/0004-layered-red-green.md)는 계층별 red-green 순서를 설명합니다.
