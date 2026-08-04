# 이관 게이트 — 테스트 증거 요구

- 소유: **하네스**. 레이어가 아니다.
- 연결: 워크플로 step의 `gate: require-test-evidence`
- blocking: 예.
- 소비 증거: `test.unit.result` · `test.integration.result` · `test.e2e.result` ·
  `test.skip-justification`

## 검사

| 층 | 통과 조건 |
|---|---|
| unit | `test.unit.result`가 존재한다. 생략 불가 |
| integration | `test.integration.result`가 있거나, `test.skip-justification`이 사유와 함께 기록됨 |
| e2e | `test.e2e.result`가 있거나, `test.skip-justification`이 사유와 함께 기록됨 |

증거가 없는데 생략 기록도 없으면 차단한다.

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
