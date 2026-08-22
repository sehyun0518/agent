# 이관 게이트 — 문서 증거 요구

- 소유: **하네스**. 레이어가 아니다.
- 연결: 워크플로 step의 `gate: [..., require-documentation-evidence]`
- blocking: 예.
- 소비 증거: `documentation-impact` · `documentation.changeset` ·
  `documentation.skip-justification`

## 검사

판정이 먼저다. `documentation-impact`가 없으면 나머지를 보지 않고 차단한다 — 무엇을
기대해야 하는지 모르는 상태이기 때문이다.

| `documentation-impact` | 통과 조건 |
|---|---|
| 없음 | 차단. 계약 고정 단계로 되돌린다 |
| `required` | `documentation.changeset`이 있고, 판정이 지목한 문서가 실제로 그 안에 있다 |
| `not-applicable` | `documentation.skip-justification`이 구체적 사유와 함께 기록됨 |

`required` 판정이 문서 A·B를 지목했는데 changeset에 A만 있으면 차단이다. 부분 갱신을
완료로 읽으면 나머지 문서가 조용히 낡는다. B를 이번에 고치지 않기로 했다면 그것도
사유가 필요하다.

생략 사유가 비어 있거나 "해당 없음" 수준이면 차단이다. 침묵 생략은 "전부 최신"으로
읽히기 때문에, 사유를 남기게 하는 것이 이 게이트의 핵심이다.

## 왜 판정 주체와 실행 주체를 나누는가

문서화 레이어가 "고칠 문서가 없다"를 스스로 선언하면 그 판정을 검증할 근거가 없다.
자기 일의 유무를 자기가 정하는 구조에서는 생략이 항상 정당해 보인다.

그래서 판정은 계약 고정 단계가 하고(`documentation-impact`), 실행은 문서화 레이어가
하고, 대조는 이 게이트가 한다. 세 주체가 다르기 때문에 생략이 검증 가능해진다.

같은 구조를 테스트 계층이 이미 쓴다 — `specification.test-plan`이 계층별
`not-applicable`을 고정하고 `require-test-evidence`가 그것과 생략 기록을 대조한다.

## 왜 `review.requires`로 하지 않는가

`documentation.completed`를 판정 레이어의 하드 선행조건에 넣으면 문서 생략이 불가능해진다.
integration·e2e가 같은 이유로 `requires`에서 빠져 있다.

또한 선행조건 선언만으로는 우회를 막지 못한다. 검증기의 선행 토큰 검사는 그 워크플로 안에
생산 단계가 이미 존재할 때만 조상 여부를 보므로, 문서 단계가 아예 없는 워크플로는 조용히
통과한다. 워크플로 정의에서 단계를 뺀 경우는 검증기 규칙이 막고, 실행 시점에 증거가 없는
경우는 이 게이트가 막는다.

## 적용 범위

`change`와 `bugfix`에 적용한다. `review` 전용 흐름에는 적용하지 않는다 — 계약 고정
단계가 없어 `documentation-impact`를 만들 주체가 흐름 안에 존재하지 않는다
(ADR-0005 결정 4).

## 차단 시

`precondition-unmet`으로 분류하고 되돌린다. 어디로 보낼지는 프로파일의 `routing`이 정한다.

| 차단 사유 | 되돌릴 곳 |
|---|---|
| `documentation-impact`가 없다 | 계약 고정 단계 |
| `required`인데 changeset이 없거나 부분적이다 | 문서화 단계 |
| `not-applicable`인데 사유가 없거나 부실하다 | 문서화 단계 |
