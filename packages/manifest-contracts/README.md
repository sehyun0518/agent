# manifest-contracts

Capability · Profile · Workflow 선언의 **스키마 단일 출처**. 실행 코드는 없다
(ADR-0001 D2 — 런타임화는 계약이 안정된 뒤 ADR-0002로 승격).

| 파일 | 대상 |
|---|---|
| `capability.schema.json` | `capabilities/<id>/capability.yaml` |
| `profile.schema.json` | `profiles/<id>/profile.yaml`, 소비 저장소의 `.agent-harness/profile.yaml` |
| `workflow.schema.json` | `workflows/<id>.yaml` |
| `vocabulary.json` | 코어 토큰 등록부 (`docs/vocabulary.md`의 기계 판독본) |
| `orchestrator.schema.json` | `packages/orchestrator/orchestrator.yaml` |

검증: `npm run validate`

## Capability manifest가 담는 것

제안서가 요구한 최소 정보에 대응한다.

| 요구 | 필드 |
|---|---|
| Capability ID와 버전 | `id` · `version` |
| 입력과 출력 | `requires` · `produces` |
| 선행 조건 | `requires` (증거로 충족 판정) |
| 실행 완료 조건 | `completion.requiresEvidence` · `completion.expectedStatus` |
| 필요 권한 | `permissions` (의미) + `entrypoints.agents[].tools` (구체) |
| 생성해야 하는 증거 | `evidence[]` |
| 진입점 | `entrypoints.agents` · `.skills` · `.tools` · `.hooks` |
| 실패 분류와 재시도 정책 | `failure` (고정 4분류) |

## 설계상 굳혀둔 것

스키마가 강제하므로 문서를 안 읽어도 깨진다.

- **`policy-denied`는 `halt`만 가능하다.** `"action": {"const": "halt"}`. 정책 거부를
  재시도로 우회할 수 없다.
- **완료는 증거로만 판정된다.** `completion`에 상태 플래그 필드가 없다.
- **`test-execution` 참조는 variant를 요구한다.** 워크플로가 unit·ui·integration·e2e를
  하나의 `test` 단계로 합치지 못한다.
- **자동 진행 단계는 전이 조건을 명시해야 한다.** `trigger: automatic`이고 선행이 있으면
  `expect`가 비어 있을 수 없다.
- **연쇄는 옵트인이다.** `chaining.autoInvoke`의 기본값이 `false`라서, Git 작업처럼
  연쇄하면 안 되는 Capability가 실수로 자동 호출되지 않는다.
- **공용 하네스에 명령 문자열이 없다.** variant는 `commandKey`만 갖고, 실제 명령은
  저장소 profile의 `commands`가 제공한다.

## 어휘 변경

`docs/vocabulary.md`와 `vocabulary.json`을 **항상 함께** 고친다. 검증기는 후자를 읽고,
사람은 전자를 읽는다. 둘이 갈라지면 오타가 통과한다.
