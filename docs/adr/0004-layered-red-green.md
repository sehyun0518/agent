# ADR-0004: 테스트 계층마다 Red-Green을 닫는다

- 상태: accepted
- 날짜: 2026-08-20
- 관련 이슈: #7

## 결정

작업 단위의 테스트와 구현을 다음 순서로 직렬화한다.

```text
specification/test-plan
→ unit design → red → logic → green
→ ui scaffold → ui design → red → ui → green
→ integration design → red → integration → green
→ e2e design → red → e2e → green
```

`test-design`, `test-execution`, `implementation`은 계층/구현 단계별 variant를 갖는다.
신호·아티팩트·red 증거도 계층 이름을 포함하며, 워크플로 검증기는 필요한 토큰의
생산 단계가 소비 단계의 의존 그래프 조상인지 검사한다.

새 UI의 import 오류를 red로 인정하지 않는다. unit green 뒤에 계약된 export와 props만
가진 무동작 `ui-scaffold`를 만든 다음, UI 테스트가 정상 수집되고 단언으로 실패하게 한다.

## 테스트 스택

frontend domain 기본값은 unit=Vitest, ui=Vitest+React Testing Library+user-event,
integration=Vitest+React Testing Library+MSW, e2e=Playwright다. repository profile이
계층을 선언하면 해당 계층 객체 전체를 대체하며 domain 설정과 merge하지 않는다.

## 생략

unit은 동작 변경에서 필수다. UI가 없는 작업은 test-plan의 구체적인 판정으로 UI 체인을
생략할 수 있다. integration과 e2e는 구체적인 사유와 승인 기록이 모두 필요하다.
워크플로의 `expectAnyOf`는 실행 결과와 승인된 생략 중 하나를 다음 단계의 전이 근거로
표현한다.

## 결과

- 구현자는 현재 계층의 테스트를 새로 쓰지 않고 red를 green으로 만든다.
- 파일의 라이브러리와 명령 키만 보고 unit·UI·integration·E2E를 구분할 수 있다.
- review 전용 흐름은 이미 만들어진 변경을 판정하므로 red를 재현하지 않고 계층별 green
  결과 또는 승인된 생략 증거를 소비한다.

## 현재 강제 범위

검증기는 워크플로 DAG, variant 바인딩, 계층별 red 생산자의 선행 관계, 프로파일의
라이브러리·명령 대응을 정적으로 강제한다. 다만 이 저장소에는 아직 워크플로 실행 엔진이나
증거 저장소가 없다. 실제 단계 호출과 증거 기록은 사람 또는 메인 에이전트가 수행하며,
런타임 승격 조건은 ADR-0002를 따른다.
