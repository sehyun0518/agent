# 이관 게이트 — 테스트 증거 요구

- 소유: **하네스**. 레이어가 아니다.
- 연결: 워크플로 step의 `gate: require-test-evidence`
- blocking: 예.
- 소비 증거: `test.unit.result` · `test.ui.result` · `test.integration.result` · `test.e2e.result` ·
  `test.integration.manual-result` · `test.e2e.manual-result` · `test.<layer>.applicability`

## 검사

| 층 | 통과 조건 |
|---|---|
| unit | `test.unit.result`가 존재한다. 생략 불가 |
| ui | `test.ui.result`가 있거나, 계약 고정 단계가 `test.ui.applicability`를 `not-applicable`로 판정함 |
| integration | `test.integration.result` 또는 `test.integration.manual-result`가 있거나, 계약 고정 단계가 `test.integration.applicability`를 `not-applicable`로 판정함 |
| e2e | `test.e2e.result` 또는 `test.e2e.manual-result`가 있거나, 계약 고정 단계가 `test.e2e.applicability`를 `not-applicable`로 판정함 |

증거가 없는데 **해당 없음 판정도 없으면** 차단한다. 판정은 계약 고정 단계가 내고 그
사유를 담는다 — 실행 계층이 자기 일의 유무를 스스로 선언하지 않는다 (ADR-0038).

`integration`·`e2e`의 `not-applicable`은 `approval-record: granted`와 함께 있어야 한다.
계층 넷 중 둘을 통째로 건너뛰는 판정이라 비용이 크다 (ADR-0004).

**이 요구는 규약이지 장치가 아니다.** 전에는 `skippable.approvalRequired`가 선언에
있었지만 그것도 어휘에 `approval-record`가 있는지만 봤을 뿐 실제 승인을 강제하지
않았다. 강제 수준은 그대로이고 적히는 자리만 옮겼다.

## `manual-result` — 러너 없이 검증한 경우 (integration·e2e만)

러너가 저장소 밖 환경(에뮬레이터·기기·실 서버)을 요구해 둘 수 없는 저장소가 있다. 그때
문서화된 절차로 검증한 결과를 `test.<layer>.manual-result`로 남긴다 (ADR-0013).

**생략이 아니다.** 검증은 했고 러너를 쓰지 않았을 뿐이다. 그래서 `approval-record`를
요구하지 않는다 — 승인은 "검증을 포기한다"에 붙는 것이지 "다른 방법으로 검증했다"에
붙는 것이 아니다.

**세 조건을 전부 만족해야 인정된다. 하나라도 빠지면 차단이다.**

1. **어느 문서를 따랐는지 지목한다.** 프로파일의 `testing.layers.<layer>.manual.procedure`가
   가리키는 흐름 문서 중 어느 것인지가 증거에 적혀 있어야 한다. 문서 없는 수동 확인은
   `manual-result`가 아니다.
2. **누가 언제 확인했는지 적는다.** "확인함"만으로는 재현도 감사도 불가능하다.
3. **절차가 재현 가능하다.** 다음 사람이 같은 문서로 같은 확인을 할 수 있어야 한다.
   "화면 보고 이상 없었음"은 절차가 아니다.

조건 1이 핵심이다. `manual-result`를 주장하려면 **무엇을 따랐는지 지목해야 한다.**
지목할 수 없으면 그것은 검증이 아니라 인상이고, 인상은 생략에 가깝다.

**프로파일이 그 계층을 `manual`로 선언하지 않았으면 `manual-result`는 무효다.** 러너가
있는데 수동으로 했다면 러너를 돌리지 않은 이유부터 물어야 한다. 검증기가 `manual`과
`commands.test.<layer>`가 함께 있는 것을 막는다.

**`unit`·`ui`에는 없다.** 두 계층은 같은 프로세스 안에서 도므로 "러너를 둘 수 없다"가
성립하지 않는다.

## 왜 판정 레이어가 직접 돌리지 않는가

전에는 판정 레이어가 전체 하네스를 돌려 판정했다. 그러면 두 가지가 어긋난다.

1. **읽기 전용 경계가 흐려진다.** 하네스를 돌리려면 실행 권한이 필요하고, 실행 권한이
   있으면 "잠깐 고쳐서 다시 돌려보는" 여지가 생긴다. 판정 레이어는 판정만 한다.
2. **증거가 중복 생산된다.** 같은 `test.unit.result`를 test-execution과 review가
   각각 만들면 어느 쪽이 기록의 근거인지 알 수 없다.

판정 레이어는 증거를 **소비**한다. 증거가 없으면 판정하지 않고 되돌린다.

## 차단 시

`precondition-unmet`으로 분류하고 되돌린다. 어디로 보낼지는 프로파일의 `routing`이 정한다.

생략 사유가 비어 있거나 "해당 없음" 수준이면 그것도 차단이다. 침묵 생략은 "전부 통과"로
읽히기 때문에, 사유를 남기게 하는 것이 이 훅의 핵심이다.
