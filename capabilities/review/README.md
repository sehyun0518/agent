# Review 레이어

Review 레이어는 통합된 변경을 고정 계약과 테스트 증거에 대조해 최종 판정을 내립니다.
이 레이어는 테스트를 다시 실행하거나 제품 코드를 수정하지 않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 구현 diff가 고정 계약과 일치하는지 확인합니다.
- 이 레이어는 계층별 테스트 결과와 승인된 생략 기록을 확인합니다.
- 이 레이어는 지적마다 우선순위, 파일 위치, 위반 규칙, 수정 소유자를 기록합니다.
- 이 레이어는 최종 PASS 또는 FAIL 판정을 기록합니다.
- 이 레이어는 테스트를 실행하거나 코드를 직접 수정하지 않습니다.

## 흐름에서의 위치

```text
contract + test-plan + implementation patch + test evidence → Review → verdict
```

`change`와 `bugfix` 워크플로에서는 모든 적용 계층의 green 또는 승인된 생략 증거가 모인
후 Review를 실행합니다. `review` 전용 워크플로는 기존 변경을 판정하므로 red를 재현하지
않습니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 입력 | `specification.contract` | 구현이 따라야 하는 고정 계약을 사용합니다. |
| 입력 | `specification.test-plan` | 적용 계층과 수용 기준 매핑을 사용합니다. |
| 입력 | `implementation.patch` | 실제 변경 diff를 검토합니다. |
| 입력 신호 | `specification.completed` | 계약이 고정됐음을 확인합니다. |
| 입력 신호 | `implementation.completed` | 구현이 완료됐음을 확인합니다. |
| 입력 신호 | `test.unit.completed` | 필수 Unit 테스트가 실행됐음을 확인합니다. |
| 출력 | `review.verdict` | PASS 또는 FAIL과 근거를 생성합니다. |
| 완료 신호 | `review.completed` | 최종 판정이 끝났음을 알립니다. |
| 증거 | `review-findings` | 검토 결과와 수정 소유자를 기록합니다. |

Integration과 E2E는 명시적으로 생략할 수 있으므로 root `requires`에 고정하지 않습니다.
워크플로의 `require-test-evidence` 게이트가 UI, Integration, E2E 결과 또는 승인된 생략
증거를 확인합니다.

## 실행 단위

이 레이어는 `review` agent 하나를 사용합니다. agent는 읽기 전용 권한으로 계약, diff,
테스트 증거를 확인합니다. 활성 프로파일의 `routing`이 지적을 전달할 소유자를 정합니다.

## 완료와 실패

`review-findings`가 아티팩트로 기록되어야 레이어를 완료합니다. 테스트 증거가 부족하면
판정을 추측하지 않고 해당 증거 생산 단계로 돌아갑니다.

| 상황 | 처리 방식 |
|---|---|
| 필수 테스트 증거가 없습니다. | 해당 Test Execution 단계로 돌아갑니다. |
| 계약과 구현의 기준이 충돌합니다. | 오케스트레이터에 판단을 요청합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 입력, 출력, 읽기 권한, 완료 조건을 정의합니다. |
| [agents/review.md](agents/review.md) | 최종 검토와 지적 라우팅 절차를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Implementation 레이어](../implementation/README.md)는 검토할 변경의 생성 과정을 설명합니다.
- [테스트 증거 게이트](../../workflows/gates/require-test-evidence.md)는 리뷰 전 이관 조건을 설명합니다.
- [운영 안내서](../../docs/operations.md)는 실패 시 되돌릴 위치를 설명합니다.
