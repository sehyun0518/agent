# Specification 레이어

Specification 레이어는 완결된 요구사항을 하류 작업이 의존할 수 있는 고정 계약으로
변환합니다. 이 레이어는 순수 로직, UI, 통합 경계, 사용자 여정을 구현 전에 구분합니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 타입, props, API 스키마, 데이터 접근 인터페이스를 고정합니다.
- 이 레이어는 필요한 test-id 규약을 고정합니다.
- 이 레이어는 계층별 테스트 적용 여부와 책임 경계를 테스트 계획에 기록합니다.
- 이 레이어는 제품 코드, 스타일, 테스트 구현을 작성하지 않습니다.
- 이 레이어는 고정된 계약을 재고정 절차 없이 변경하지 않습니다.

## 흐름에서의 위치

```text
requirements.spec → Specification → contract + testids + test-plan → Test Design
```

Specification의 산출물은 이후 테스트와 구현이 공유하는 기준입니다. 계약이 바뀌면 하류
작업을 계속하지 않고 이 레이어로 돌아와 변경 차이를 기록하고 다시 고정합니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 입력 | `requirements.spec` | 완결된 요구사항 문서를 사용합니다. |
| 입력 신호 | `requirements.completed` | 요구사항 완결성 검사가 통과했음을 확인합니다. |
| 출력 | `specification.contract` | 타입과 인터페이스 계약을 생성합니다. |
| 출력 | `specification.testids` | UI 식별자 규약을 생성합니다. |
| 출력 | `specification.test-plan` | 계층별 책임과 테스트 적용 여부를 생성합니다. |
| 완료 신호 | `specification.completed` | 계약 고정이 완료됐음을 알립니다. |
| 증거 | `changed-files`, `contract-diff` | 계약 파일과 이전 고정본의 차이를 기록합니다. |
| 증거 | `documentation-impact` | 이 변경이 어떤 문서를 낡게 만드는지 판정합니다. |

## 실행 단위

이 레이어는 `spec` agent 하나를 사용합니다. agent는 저장소의 기존 타입과 경계를 읽고
고정 계약 파일을 작성합니다. 도메인별 API 설계 규칙은 활성 프로파일이 주입합니다.

## 완료와 실패

`changed-files`, `contract-diff: recorded`, `documentation-impact`가 모두 기록되어야
레이어를 완료합니다. `contract-freeze` hook은 계약 산출물이 파일로 존재하는지와 차이가
기록됐는지를 검사합니다.

문서 영향 판정을 이 레이어가 소유하는 이유는
[ADR-0005](../../docs/adr/0005-documentation-capability.md) 결정 1이 설명합니다. 실행
주체가 자기 일의 유무를 스스로 선언하면 그 판정을 검증할 근거가 사라집니다.

| 상황 | 처리 방식 |
|---|---|
| 요구사항 입력이 부족합니다. | Requirements 레이어로 돌아갑니다. |
| 고정 계약이 재고정 없이 바뀝니다. | 계약 위반으로 처리하고 Requirements에 판단을 요청합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 입력, 출력, 권한, 완료 조건을 정의합니다. |
| [agents/spec.md](agents/spec.md) | 계약과 테스트 계획 작성 절차를 정의합니다. |
| [hooks/contract-freeze.md](hooks/contract-freeze.md) | 계약 고정 검사를 정의합니다. |
| [tests/contract-freeze.cases.yaml](tests/contract-freeze.cases.yaml) | 계약 고정 검사 사례를 정의합니다. |
| [evals/contract-quality.eval.yaml](evals/contract-quality.eval.yaml) | 계약 품질 평가를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [Test Design 레이어](../test-design/README.md)는 테스트 계획을 소비하는 방법을 설명합니다.
- [통제 어휘](../../docs/vocabulary.md)는 계약과 테스트 계획 토큰을 정의합니다.
