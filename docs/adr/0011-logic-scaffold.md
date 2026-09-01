# ADR-0011 — unit 계층 계약 스캐폴드

- 상태: 채택
- 날짜: 2026-08-31
- 다루는 축: 계층별 red-green 순서
- 관련: ADR-0004(계층별 red-green), `workflows/gates/require-red-evidence.md`

## 맥락

FE 저장소에 `change` 워크플로를 실제로 태우다 교착이 드러났다.

계약이 신규 모듈 두 개(`bottom-nav-items.ts`·`screen-labels.ts`)를 도입했다.
`tester`가 그 모듈을 import하는 unit 테스트를 썼고, `test-runner`가 실행했다.

```text
Failed to resolve import "./bottom-nav-items.js"
```

`test-runner` 지침 2절 3번은 "import·모듈 해석 실패"를 red에서 명시적으로 배제한다.
그래서 red-proof는 `rejected`가 됐다. **판정 자체는 옳다** — 모듈이 없어서 나는 실패는
"구현이 없어서 단언이 깨진 것"이 아니라 "테스트가 아직 돌지도 않은 것"이고, 이 상태에서
구현을 시작하면 나중에 초록이 됐을 때 무엇을 보장하는지 알 수 없다.

문제는 그 다음이다.

| 하려는 것 | 막는 것 |
|---|---|
| red를 인정받는다 | 모듈이 해석돼야 한다 → 파일이 있어야 한다 |
| 파일을 만든다 | `implementation#logic`이 한다 |
| `implementation#logic`을 시작한다 | `require-red-evidence`가 막는다 |
| 게이트를 통과한다 | red가 필요하다 ↺ |

`rejected`의 되돌릴 곳은 게이트 문서상 "같은 계층의 test-design"인데, `tester`는 제품
코드를 만들 수 없다. **목적지가 문제를 풀 권한을 갖고 있지 않다.**

같은 실행에서 `navigation.unit.test.ts`는 `confirmed`가 나왔다. `navigation.ts`가 이미
존재했기 때문이다. 즉 이 교착은 **기존 파일을 고치는 작업에서는 드러나지 않고 신규 모듈을
도입하는 작업에서만** 드러난다. 그래서 지금까지 걸리지 않았다.

## 결정

**`implementation`에 `logic-scaffold` 변형을 두고, `change` 워크플로에서 `unit-design`
앞에 놓는다.**

```text
specification → logic-scaffold → unit-design → unit-red → logic → unit-green
                                (기존)
unit-green    → ui-scaffold    → ui-design   → ui-red   → ui    → ui-green
```

두 줄이 같은 모양인 것이 핵심이다. **하네스는 이 문제를 UI 계층에서 이미 풀어놨다.**
`ui-scaffold`가 존재하는 이유가 정확히 같다 — 컴포넌트 파일이 없으면 ui 테스트가 렌더할
대상이 없다. unit 계층에만 그 조각이 빠져 있었다.

- `requires`: `specification.contract` · `specification.test-plan`. **red를 요구하지 않는다.**
- `produces`: `implementation.logic-scaffold.completed`
- 담는 것: 계약된 경로·export·시그니처. import가 해석되고 호출이 가능한 데까지.
- 담지 않는 것: 반환값 계산. 단언은 실패해야 하고, 그 실패가 red의 재료다.

### 생략할 수 없다

신규 모듈이 없는 작업이 더 흔하다. 그래도 단계를 건너뛰게 하지 않고 `changed-files`를
**빈 목록으로 기록**하게 한다. "만들 것이 없었다"와 "확인하지 않았다"는 다른 사건이고,
침묵 생략은 뒤엣것을 앞엣것처럼 보이게 한다. 같은 이유로 이 하네스는 테스트 계층 생략에도
사유를 요구한다.

### `bugfix`에는 넣지 않는다

버그를 재현하려면 버그가 있는 코드가 이미 있어야 한다. 존재하지 않는 모듈의 버그를
재현하는 일은 정의상 없다. 필요해지면 그때 되돌려 정한다.

## 버린 대안

**1. red 판정을 완화해 모듈 해석 실패도 red로 인정한다.**
`require-red-evidence`가 존재하는 이유를 지운다. 컴파일 에러로 빨간 것을 착수 근거로
삼지 않겠다는 것이 그 게이트의 전부다. 교착을 푸는 대신 게이트를 무의미하게 만든다.

**2. `tester`에게 제품 코드 생성 권한을 준다.**
테스트를 쓴 쪽이 대상 모듈도 만들면 "테스트가 계약을 검증한다"와 "테스트가 자기가 만든
것을 검증한다"의 구분이 사라진다. `test-design`과 `implementation`을 나눈 이유를 지운다.

**3. 신규 모듈을 만들지 않도록 계약을 제한한다.**
계약이 테스트 실행 사정에 맞춰 파일 구조를 정하게 된다. 계약 고정이 하류 사정에 끌려가면
계약이 계약이 아니게 된다.

## 대가

단계가 27개에서 28개로 늘었다. 대부분의 작업에서 이 단계는 "만들 것 없음"으로 끝나므로
비용은 호출 한 번이다. 신규 모듈이 있는 작업에서만 실제 산출이 생긴다.

`logic-scaffold`가 시그니처를 만들면서 계약을 잘못 읽으면, 그 오해가 unit 테스트 작성보다
**앞에** 놓인다. `ui-scaffold`가 이미 같은 위험을 지고 있고, 완화 수단도 같다 —
스캐폴드는 계약 문서만 보고 만들며 추측한 것이 있으면 계약 고정 단계로 되돌린다.

## 재검토 조건

- `bugfix`에서 신규 모듈이 필요한 사례가 실제로 나오면.
- 실행 시점 게이트를 집행하는 주체가 생기면 — 지금은 게이트가 산문이고 자기신고로
  통과한다. 집행이 생기면 이 순환은 프롬프트가 아니라 코드로 막히므로, 스캐폴드 단계의
  선행조건도 그때 다시 본다.
