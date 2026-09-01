# ADR-0038 — 계층은 전부 필수다. 해당 없음은 설계가 판정한다

- 상태: 채택
- 날짜: 2026-09-02
- 다루는 축: 워크플로 계약, 증거 어휘
- 관련: ADR-0004(계층별 red-green) · ADR-0005(문서 영향 판정) · ADR-0012(moot) · ADR-0013(수동 검증)

## 맥락 — 의도와 선언이 어긋났다

`ADR-0004`가 이렇게 적었다.

> unit은 동작 변경에서 필수다. **UI가 없는 작업은 test-plan의 구체적인 판정으로** UI
> 체인을 생략할 수 있다.

그리고 어휘가 `specification.test-plan`을 이렇게 정의한다.

> 책임 경계·순수 함수 입출력·UI·통합·사용자 여정과 **계층 적용 여부**

**판정 주체는 계약 고정 단계다.** 그런데 워크플로는 다르게 구현돼 있었다.

```yaml
- id: ui-design
  skippable:
    evidenceOnSkip: test.skip-justification
  expectAnyOf:
    - conditions: [{ evidence: changed-files, status: recorded, from: ui-scaffold }]
    - conditions: [{ evidence: test.skip-justification, status: recorded, from: ui-scaffold }]
```

**전이 조건 어디에도 `specification.test-plan`이 없다.** 실행자가 사유 한 줄을 남기면
계층이 통째로 건너뛰어진다.

```text
설계:  "이 작업은 UI가 있다"          ← test-plan에 적힘
실행:  ui-scaffold에서 사유 적고 통과
결과:  UI 계층이 통째로 빠졌는데 아무도 모른다
```

**설계의 판정과 실행의 생략이 서로를 안 본다.**

이름도 그 오해를 굳혔다. `skippable`은 "생략해도 되는 단계"로 읽히고
`skip-justification`은 "왜 생략했나"를 묻는다. **의도는 "왜 해당이 없나"였다** —
앞은 실행자의 선택이고 뒤는 작업의 사실이다.

## 결정 1 — `skippable`을 워크플로 step에서 없앤다

계층은 전부 필수다. **건너뛰는 것이 아니라 해당되지 않을 때 넘어간다.**

스키마에서 `step.skippable`을 제거한다. 세 워크플로의 서른한 곳이 사라진다.

## 결정 2 — `test.<layer>.applicability`를 계약 고정 단계가 낸다

```yaml
# capabilities/specification/capability.yaml
evidence:
  - kind: test.ui.applicability
    required: true
  - kind: test.integration.applicability
    required: true
  - kind: test.e2e.applicability
    required: true
```

상태는 `applicable` · `not-applicable`. 사유는 판정 자체에 담긴다.

**새 패턴이 아니다.** `documentation-impact`가 이미 같은 구조다.

> `documentation-impact`는 **계약 고정 단계가** 남긴다 — 문서화 레이어가 자기 일의
> 유무를 스스로 선언하면 그 판정을 검증할 근거가 사라지기 때문이다(ADR-0005 결정 1).

**테스트 계층에만 그 구조가 없었다.**

### `unit`은 판정 대상이 아니다

동작 변경이면 항상 해당된다(ADR-0004). 판정을 두면 **동작을 바꾸면서 단위 테스트가 해당
없다고 말할 수 있게 된다.**

## 결정 3 — 계층 단계는 그 판정을 전이 근거로 갖는다

```yaml
- id: ui-scaffold
  expectAnyOf:
    - conditions: [{ evidence: test.unit.result, status: passed, from: unit-green }]
    - conditions: [{ evidence: test.ui.applicability, status: not-applicable, from: specification }]
```

**검사 둘을 붙인다.**

| 검사 | 무엇 |
|---|---|
| 탈출구 | 계층 단계에 `test.<layer>.applicability = not-applicable` 대안이 없으면 실패 |
| 생산자 | 그 판정을 내는 단계가 흐름 안에 없으면 실패 |

없으면 **그 계층이 해당 없는 작업에서 흐름이 막힌다.** 전에는 `skippable`이 그 자리를
메웠는데, 이제 근거가 판정으로 바뀌었으므로 근거가 실제로 닿는지 봐야 한다.

`review`는 `from` 없이 참조한다. 앞선 실행의 판정을 받는 흐름이라 생산자가 안에 없는
것이 정의다(ADR-0014). `from`이 없으면 생산자 검사가 보지 않는다.

## 결정 4 — 세 개념을 가른다

정리하면서 드러났다. 비슷해 보이는 것이 셋인데 다르다.

| | 무엇 | 누가 정하나 |
|---|---|---|
| **해당 없음** | 이 변경에 그 계층이 없다 | **계약 고정 단계** |
| **수동** | 계층은 있는데 러너가 없다 | 저장소 프로파일 (ADR-0013) |
| **moot** | 돌렸는데 실패가 안 났다 | 실행 결과 (ADR-0012) |

전에는 첫째가 `skip-justification`이라 둘째·셋째와 섞여 읽혔다. 게이트 문서가
`moot`를 생략과 섞지 말라고 경고하고 있었던 것이 그 증거다.

## 결정 5 — 프로파일 삽입의 `skippable`은 남긴다

`insert.skippable`은 그대로 둔다(ADR-0017).

**`specification`은 `state-data`를 모른다.** 도메인 단계의 해당 여부를 판정할 코어 증거가
없고, 만들면 코어가 도메인 축을 알기 시작한다.

경계가 이렇게 된다 — **코어 계층은 계약 고정 단계가 판정하고, 도메인 삽입은 도메인이
정한다.**

## 버린 대안

**1. `skippable`을 두고 전이 조건만 판정으로 바꾼다.**
두 기전이 남는다. 실행자가 여전히 `skippable`로 넘어갈 수 있고, 무엇이 진짜 근거인지
읽는 사람이 모른다.

**2. `test-plan` 산출물 안에 적고 증거는 안 만든다.**
`test-plan`은 파일이고 전이 조건은 증거의 `kind`·`status`를 본다. 파일 내용은 대조가
안 된다 — 그래서 지금 아무도 안 읽고 있었다.

**3. `unit`에도 판정을 둔다.**
모양은 고르지만 동작을 바꾸면서 단위 테스트가 해당 없다고 말할 수 있게 된다.

**4. `documentation`의 `skippable`은 남긴다.**
`documentation-impact`가 이미 판정을 낸다. 둘을 같이 두면 판정이 있는데 우회로도 있는
상태가 된다.

### 승인 요구는 게이트로 옮긴다

`skippable.approvalRequired`가 함께 사라졌다. `ADR-0004`가 integration·e2e 생략에
승인을 요구했으므로 그 의도를 잃지 않게 `require-test-evidence` 게이트에 적는다.

**강제 수준은 그대로다.** `approvalRequired: true`도 검증기가 "어휘에 `approval-record`가
있는지"만 봤을 뿐 실제 승인을 강제하지 않았다. 적히는 자리만 옮겼다.

## 대가

**판정을 누가 검증하나.** `specification`이 "UI 없음"이라고 하면 그대로 간다. 그 판정이
맞는지는 `review`가 보지만 흐름 끝이다. **틀린 판정은 계층 넷을 통째로 건너뛰게 한다.**

전보다 나은 점은 **판정이 한 곳에 있고 증거로 남는다**는 것이다. 전에는 단계마다
흩어져 있었다.

**계층이 해당 없는데 `applicable`로 판정하면 막힌다.** 그 계층 테스트를 쓸 수 없는
작업에서 흐름이 서고, 되돌리려면 계약 고정 단계로 가야 한다. 그것이 의도다.

**승인이 여전히 강제되지 않는다.** 게이트에 적혔지만 그것을 보는 주체가 없다.
전에도 그랬으므로 나빠지지는 않았지만, 선언에서 산문으로 옮겨간 만큼 **덜 눈에 띈다.**

**C1이 다시 리셋된다.** `workflow.schema.json`에서 필수 아닌 속성을 제거했고 어휘에서
토큰 둘을 뺐다. 오늘 이미 여러 번 리셋됐다.

## 재검토 조건

- 판정이 틀려서 계층이 잘못 건너뛰어진 사례가 나오면. 판정을 누가 검증하는지 본다.
- 도메인 삽입에도 같은 구조가 필요해지면. 코어가 도메인 축을 알지 않고 그것을 할 수
  있는지 본다.
- `unit`이 해당 없는 작업이 실제로 나오면. `change` 흐름 자체가 맞는지부터 본다.
