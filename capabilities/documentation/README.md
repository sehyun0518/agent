# Documentation 레이어

Documentation 레이어는 병합된 변경 때문에 낡은 문서를 갱신하고 그 결과를 증거로
남깁니다. 이 레이어는 제품 코드와 테스트를 수정하거나 문서 영향 범위를 스스로 판정하지
않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 계약 고정 단계가 남긴 문서 영향 판정을 범위로 사용합니다.
- 이 레이어는 구현 diff를 읽고 영향을 받은 문서를 갱신합니다.
- 이 레이어는 갱신한 문서마다 왜 고쳤는지를 기록합니다.
- 이 레이어는 판정 범위를 벗어나 고친 문서를 별도로 표시합니다.
- 이 레이어는 제품 코드, 테스트, manifest, 생성물 미러를 수정하지 않습니다.

## 흐름에서의 위치

```text
documentation-impact + contract + implementation patch → Documentation → changeset
```

`change`와 `bugfix` 워크플로에서는 적용 계층의 green이 모두 끝난 뒤 판정 직전에
실행합니다. `review` 전용 워크플로에는 계약 고정 단계가 없어 문서 영향을 판정할 주체가
없으므로 이 레이어를 실행하지 않습니다.

문서 영향 판정을 이 레이어가 소유하지 않는 이유는
[ADR-0005](../../docs/adr/0005-documentation-capability.md) 결정 1이 설명합니다. 실행
주체가 자기 일의 유무를 스스로 선언하면 그 판정을 검증할 근거가 사라집니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 입력 | `specification.contract` | 문서가 설명해야 하는 고정 계약을 사용합니다. |
| 입력 | `implementation.patch` | 실제 변경 diff에서 영향 범위를 확인합니다. |
| 입력 신호 | `specification.completed` | 계약이 고정됐음을 확인합니다. |
| 입력 신호 | `implementation.completed` | 구현이 완료됐음을 확인합니다. |
| 입력 증거 | `documentation-impact` | 갱신 범위를 정합니다. 워크플로의 전이 조건이 대조합니다. |
| 출력 | `documentation.changeset` | 갱신한 문서 목록과 각 문서를 고친 이유를 생성합니다. |
| 완료 신호 | `documentation.completed` | 문서 갱신이 끝났음을 알립니다. |
| 증거 | `changed-files` | 실제로 바뀐 파일을 원본 경로와 함께 기록합니다. |

`documentation-impact`는 증거이므로 `requires`에 넣지 않습니다. 신호는 완료 여부만
나타내지만 이 판정은 `required`인지 `not-applicable`인지가 중요하고, status 대조는
워크플로의 전이 조건이 담당합니다.

## 실행 단위

이 레이어는 `documentation` agent 하나를 사용합니다. 변형을 두지 않습니다 — 문서 유형별
분할은 워크플로 단계를 유형 수만큼 늘리고 각각 생략 처리를 요구하므로, 필요해질 때
추가합니다([ADR-0005](../../docs/adr/0005-documentation-capability.md) 결정 2).

agent는 쓰기 권한을 갖지만 대상은 문서로 한정합니다. `.claude`, `.cursor`, `.codex`는
생성물이므로 소스를 고치고 `npm run generate`로 다시 만듭니다.

## 완료와 실패

`changed-files`가 원본 경로와 함께 기록되어야 레이어를 완료합니다. 고친 문서가 없으면
완료가 아니라 생략이며, 생략에는 `documentation.skip-justification` 증거가 필요합니다.

| 상황 | 처리 방식 |
|---|---|
| 문서 영향 판정이 없습니다. | 계약 고정 단계로 돌아갑니다. |
| 판정이 `not-applicable`인데 호출됐습니다. | 문서를 만들지 않고 되돌립니다. |
| 문서와 manifest의 내용이 충돌합니다. | manifest를 단일 출처로 삼아 문서를 고칩니다. |
| 문서가 코드와 다른데 코드가 틀린 것으로 보입니다. | 고치지 않고 지적으로 남깁니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 입력, 출력, 쓰기 권한, 완료 조건을 정의합니다. |
| [agents/documentation.md](agents/documentation.md) | 갱신 절차와 수정하지 않는 대상을 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Specification 레이어](../specification/README.md)는 문서 영향을 판정하는 과정을 설명합니다.
- [Review 레이어](../review/README.md)는 문서 증거를 소비하는 판정 단계를 설명합니다.
- [문서 증거 게이트](../../workflows/gates/require-documentation-evidence.md)는 판정 전 이관 조건을 설명합니다.
- [ADR-0005](../../docs/adr/0005-documentation-capability.md)는 이 레이어를 분리한 이유를 설명합니다.
