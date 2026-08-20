# Requirements 레이어

Requirements 레이어는 사용자 발화를 실행 가능한 요구사항 문서로 정리합니다. 이 레이어는
사용자가 제공한 정보만 사용하며 저장소, 파일, 외부 자료를 조사하지 않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 요구사항 스키마의 필수 슬롯을 사용자와 함께 채웁니다.
- 이 레이어는 수용 기준을 관찰 가능한 문장으로 정리합니다.
- 이 레이어는 확인되지 않은 추론을 요구사항으로 확정하지 않습니다.
- 이 레이어는 구현 방법이나 저장소 구조를 조사하지 않습니다.

## 흐름에서의 위치

```text
사용자 발화 → Requirements → requirements.spec → Specification
```

Requirements는 표준 변경과 버그 수정 흐름의 시작점입니다. 이미 완결된 요구사항 문서가
있다면 논의 범위를 줄일 수 있지만, 완결성 검사는 그대로 통과해야 합니다.

## 입력과 출력

| 구분 | 이름 | 설명 |
|---|---|---|
| 입력 | 사용자 발화 | 사용자가 직접 제공한 목표, 범위, 제약, 수용 기준을 사용합니다. |
| 출력 | `requirements.spec` | 요구사항 스키마를 만족하는 문서를 생성합니다. |
| 완료 신호 | `requirements.completed` | 완결성 검사를 통과했음을 알립니다. |
| 증거 | `completeness-check` | 필수 슬롯과 수용 기준의 완결 여부를 기록합니다. |

## 실행 단위

이 레이어는 `discussion` agent 하나를 사용합니다. agent에는 파일과 네트워크 도구를
제공하지 않습니다. `contracts/requirements-spec` skill이 요구사항 형식과 완결성 기준을
제공합니다.

## 완료와 실패

`completeness-check: passed`가 기록되어야 레이어를 완료합니다. 완결성 hook은 필수 슬롯
6개, 수용 기준 2개 이상, 미확인 추론 0개를 검사합니다.

| 상황 | 처리 방식 |
|---|---|
| 필수 정보가 부족합니다. | 사용자 논의로 돌아가 누락된 슬롯을 채웁니다. |
| 요구사항 계약을 위반합니다. | 오케스트레이터에 판단을 요청합니다. |
| 정책이 실행을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | 입력, 출력, 권한, 완료 조건을 정의합니다. |
| [agents/discussion.md](agents/discussion.md) | 요구사항 논의 절차를 정의합니다. |
| [hooks/completeness-gate.md](hooks/completeness-gate.md) | 완결성 검사를 정의합니다. |
| [tests/completeness-gate.cases.yaml](tests/completeness-gate.cases.yaml) | 완결성 검사 사례를 정의합니다. |
| [evals/slot-extraction.eval.yaml](evals/slot-extraction.eval.yaml) | 슬롯 추출 평가를 정의합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [작업 흐름 안내서](../../docs/walkthrough.md)는 다음 단계로 전달되는 예시를 설명합니다.
- [Requirements Specification skill](../../packages/boundary-contracts/requirements-spec/SKILL.md)은 요구사항 스키마를 정의합니다.
