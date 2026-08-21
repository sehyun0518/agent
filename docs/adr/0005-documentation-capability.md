# ADR-0005: 문서화를 독립 Capability로 분리한다

- 상태: accepted
- 날짜: 2026-08-21
- 관련 이슈: #10

## 배경

하네스에는 요구사항·계약·테스트 설계·테스트 실행·구현·리뷰·Git 작업을 담당하는
Capability가 있지만 문서를 소유하는 Capability가 없다. 그 결과 README, 운영 가이드,
소비자 프로필, ADR, 레이어 안내서 갱신이 구현자나 리뷰어의 임시 책임으로 남는다.

더 근본적인 문제는 표현력이다. "이번 변경에 고칠 문서가 있는가"를 판정하거나 "문서를
고쳤다"를 다음 단계에 전달할 토큰이 통제 어휘에 없어서, 문서 변경의 선행 조건·완료 증거·
생략 규칙을 워크플로가 표현할 수 없다.

ADR-0004가 테스트 계층마다 red-green을 닫도록 만든 것과 같은 문제다. 규칙이 문서에만
있으면 지켜지지 않아도 아무 일이 일어나지 않는다.

## 결정

문서화를 8번째 Capability로 분리하고, 문서 영향 판정을 계약 고정 단계가 소유하게 한다.

```text
specification (문서 영향 판정)
→ … 계층별 red-green …
→ documentation
→ review (테스트 증거 + 문서 증거를 함께 판정)
```

### 1. 문서 영향은 Specification이 고정한다

계약 고정 단계가 `documentation-impact` 증거를 `required` 또는 `not-applicable`로 남긴다.
Documentation이 스스로 판정하지 않는다.

문서화 레이어가 자기 일의 유무를 스스로 선언하면 "고칠 문서가 없다"는 판정을 검증할 근거가
사라진다. 침묵 생략 금지는 판정 주체와 실행 주체가 다를 때만 성립한다.

선례가 이미 있다. `specification.test-plan`이 계층별 `not-applicable`을 고정하고
`workflows/gates/require-test-evidence.md`가 "생략 기록은 test-plan의 판정과 연결되어야
한다"로 대조한다. 문서도 같은 구조를 쓴다.

### 2. 단일 variant로 시작한다

문서 유형별 분할(architecture·consumer·operations)은 하지 않는다.

`test-design`·`implementation`처럼 variant로 나누는 선례가 있지만, 3종으로 나누면
change·bugfix에 step이 3개씩 늘고 각각 생략 처리가 필요하다. variant 추가는 하위호환이고
제거는 아니므로 작은 쪽에서 시작한다.

### 3. 모든 계층 green 이후, review 직전에 실행한다

문서는 통합 결과를 기술하므로 계층 green이 모두 끝난 뒤가 맞다.

```yaml
- id: documentation
  dependsOn: [unit-green, ui-green, integration-green, e2e-green]

- id: review
  dependsOn: [documentation]
```

### 4. review 전용 흐름에서는 문서 최신성을 검사하지 않는다

`workflows/review.yaml`은 진입점이 `test-execution`이고 계약 고정 단계가 없다. 문서 영향을
판정할 주체가 흐름 안에 존재하지 않으므로 결정 1의 구조를 적용할 수 없다.

프로파일이 design 삽입에 대해 이미 같은 판단을 기록해 두었다 — "review 전용 흐름에는 계약
고정 단계가 없으므로 이 삽입은 건너뛰어진다."

### 5. 생략은 사유 필수, 승인 불필요

`approvalRequired: false`로 ui 계층과 같은 등급이다. integration·e2e 급 승인을 요구하면
문서 영향이 없는 소규모 변경마다 승인이 걸린다.

생략하려면 `documentation.skip-justification`을 구체적 사유와 함께 남겨야 한다. 사유가
"해당 없음" 수준이면 차단이다.

### 6. `gate`를 배열로 확장한다

워크플로 step은 게이트를 하나만 가질 수 있고, review step에는 이미
`require-test-evidence`가 붙어 있다. 문서 게이트를 붙일 자리가 없다.

스키마를 `string | string[]`으로 넓혀 게이트마다 책임 하나를 유지한다.

```yaml
- id: review
  gate: [require-test-evidence, require-documentation-evidence]
```

기존 게이트에 문서 검사를 끼워 넣는 대안은 이름과 실제 책임이 어긋나고, 앞으로 게이트를
더할 때마다 같은 문제가 반복된다.

이 변경의 영향 범위는 두 곳이다. `step.gate`를 참조하는 코드는
`tooling/validators/validate.mjs:402~403`뿐이고, 생성기는 `gate`를 읽지 않는다. `step`의
`allOf` 제약은 `trigger`·`dependsOn`·`expect`에만 걸려 있어 충돌하지 않는다. 기존 워크플로
3개의 문자열 표기는 그대로 유효하다.

### 7. accessibility의 앵커를 documentation으로 옮긴다

`profiles/frontend/profile.yaml`의 accessibility는 `mode: before` /
`anchorCapability: review`로 삽입된다. documentation step을 review의 선행으로 넣으면
accessibility가 documentation 앞인지 뒤인지 정의되지 않는다.

`checkWorkflowExtensions`는 앵커 Capability의 존재와 중복만 검사하고 **같은 앵커에 삽입이
둘 이상일 때의 상대 순서를 정하지 않는다.**

accessibility는 접근성 범위 코드를 직접 고치므로 documentation 뒤에 놓이면 문서를 쓴 다음
코드가 바뀐다. 앵커를 옮겨 순서를 확정한다.

```yaml
- id: accessibility
  mode: before
  anchorCapability: documentation   # 기존: review
```

결과 순서: `접근성 마감 → 문서 갱신 → 판정`

### 8. 통제 어휘 4종

| 종류 | 토큰 | 담는 것 | 허용 status | 생산자 |
|---|---|---|---|---|
| 신호 | `documentation.completed` | 문서 갱신이 끝남 | — | `documentation` |
| 아티팩트 | `documentation.changeset` | 갱신한 문서 목록과 근거 | — | `documentation` |
| 증거 | `documentation-impact` | 문서 영향 판정 | `required` · `not-applicable` | `specification` |
| 증거 | `documentation.skip-justification` | 왜 고치지 않았는지 | `recorded` | 생략된 step |

완료 판정 증거는 새로 만들지 않고 기존 `changed-files`를 재사용한다
(`artifactRequired: true`). `git-operations`의 각 variant가 같은 방식을 쓴다.
`docs/vocabulary.md` §6 1항 "코어 토큰이 정말 필요한지 본다"에 따른 선택이다.

## 강제 수단

`requires` 선언은 문서 단계 우회를 막지 못한다. `validate.mjs`의 선행 토큰 검사가
아래 조건에서만 동작하기 때문이다.

```js
const candidates = graph.producerIds(token)
if (candidates.length > 0 && !graph.hasAncestorProducer(step.id, token)) { ... }
```

`candidates.length > 0` — 그 워크플로 안에 생산 단계가 **이미 존재할 때만** 조상 여부를
본다. documentation step이 아예 없는 워크플로는 조용히 통과한다.

따라서 `review`의 `requires`에 `documentation.completed`를 넣지 않는다. integration·e2e가
생략 가능하다는 이유로 하드 선행조건에서 빠져 있는 것과 같은 이유다. 강제는 두 곳이 나눠
맡는다.

| 대상 | 수단 |
|---|---|
| 워크플로 정의에서 문서 단계를 뺀 경우 | 검증기 규칙 (`documentation-gate.mjs`) |
| 실행 시점에 문서 증거가 없는 경우 | 게이트 (`require-documentation-evidence.md`) |

## 검증기 확장의 전제

`tooling/validators/contracts.test.mjs`는 순수 헬퍼 모듈
(`workflow-graph.mjs`·`profile-testing.mjs`)만 테스트한다. 계약 테스트를 쓰려면 검증
로직을 헬퍼로 먼저 분리해야 한다.

또한 검증기가 실행자 존재를 검사하는 곳은 `workflowExtensions[].runner` 한 곳뿐이다
(`validate.mjs:550`). `roster[].runner`와 `routing[].owner`는 스키마에서 제약 없는
`string`이며 검사되지 않는다.

그런데 `checkWorkflowExtensions`가 함수 안에서 만드는 실행자 해석 집합은
`profile.schema.json`이 `roster[].runner`에 적어 둔 설명("capability id,
`<capability>#<variant>`, 또는 프로파일 agent id")과 정확히 같다. 새 규칙을 만드는 것이
아니라 **이미 있는 해석 규칙을 헬퍼로 꺼내 roster·routing에도 적용**하면 된다.

## 결과

- 문서 갱신이 누구의 일인지, 언제 하는지, 무엇을 남겨야 끝난 것인지가 계약에 있다.
- 문서를 고치지 않은 변경은 사유를 증거로 남긴다. 침묵 생략이 "전부 통과"로 읽히지 않는다.
- 판정 레이어는 문서를 직접 쓰지 않고 증거를 소비한다. 테스트 증거를 다루는 방식과 같다.
- 게이트를 여러 개 붙일 수 있게 되어, 앞으로 판정 축이 늘어도 기존 게이트의 책임을
  넓히지 않아도 된다.
- 프로파일의 도메인 단계와 core 단계가 같은 앵커를 두고 경쟁하지 않는다.

## 현재 강제 범위

검증기는 워크플로 DAG, 문서 단계의 선행 관계, 통제 어휘 등록, 프로파일 roster·routing의
실행자 해석을 정적으로 강제한다.

다만 이 저장소에는 아직 워크플로 실행 엔진이나 증거 저장소가 없다. `documentation-impact`
판정과 `documentation.changeset` 기록은 사람 또는 메인 에이전트가 수행하며, 런타임 승격
조건은 ADR-0002를 따른다.

경로 단위 쓰기 금지는 강제하지 않는다. `policies/permissions/filesystem-boundary.yaml`은
Capability 단위 read/write 상한만 표현하므로, documentation이 `.claude`·`.cursor`·`.codex`
미러를 고치지 않는다는 것은 현재 역할 문서의 규칙이다. 기계 강제가 필요해지면 별도 훅으로
올린다.
