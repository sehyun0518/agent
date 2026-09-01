# 통제 어휘 (Controlled Vocabulary)

Capability manifest의 `requires`·`produces`·`evidence[].kind`에 쓰이는 토큰의 단일
출처다. 검증기는 **접두사 없는 토큰이 이 문서의 코어 표에 등록돼 있지 않으면 거부**한다.
오타(`specification.complete` vs `completed`)가 런타임까지 흘러가지 않게 하려는 것이다.

## 토큰 문법

토큰 종류에 따라 문법이 둘로 갈린다.

| 종류 | 문법 | 정규식 |
|---|---|---|
| 신호 · 아티팩트 | `<domain>.<noun>[.<noun>]` — **도메인 한정 필수** | `^([a-z][a-z0-9-]*:)?[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$` |
| 증거 | 단일 세그먼트도 허용 | `^([a-z][a-z0-9-]*:)?[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$` |

신호와 아티팩트는 `requires`/`produces`로 Capability 사이를 건너다니므로 어느 도메인의
것인지가 토큰 자체에 있어야 한다. 증거는 레코드의 `producedBy`가 출처를 이미 담고 있어
`changed-files`·`review-findings` 같은 단일 세그먼트 이름을 허용한다.

프로파일 확장은 두 종류 모두 `<namespace>:` 접두사를 붙인다.

- **코어 토큰**은 접두사가 없고 이 문서에 등록돼야 한다. 추가하려면 이 파일을 고친다.
- **프로파일 확장 토큰**은 `<namespace>:`를 붙인다. 네임스페이스는 프로파일이
  `profile.yaml`의 `namespace`로 선언하며, 그 프로파일은 자기 네임스페이스 아래 토큰을
  중앙 등록 없이 자유롭게 만들 수 있다. 소비 저장소도 같은 방식으로 확장한다.

이 이중 구조가 ADR-0001의 "중앙 registry 비대화" 문제를 막는다. 코어는 작게 유지되고,
도메인별 증거는 각자의 네임스페이스에서 늘어난다.

## 1. 신호 (signal) — 선행조건으로 쓰이는 완료 표식

`requires`에 놓여 "이 단계가 끝났음"을 나타낸다. 아티팩트가 아니라 상태 전이 자격이다.

| 토큰 | 의미 | 생산자 |
|---|---|---|
| `requirements.completed` | 요구사항 스펙이 완결성 게이트를 통과함 | `requirements` |
| `specification.completed` | 기술 계약이 고정됨 (변경하려면 되돌려 재고정) | `specification` |
| `test-design.<layer>.completed` | 해당 계층 테스트가 작성됨 (`unit`·`ui`·`integration`·`e2e`) | `test-design#<layer>` |
| `test.<layer>.red-confirmed` | 해당 계층 테스트가 **예상한 이유로** 실패함이 확인됨 | `test-execution#<layer>` |
| `test.unit.completed` | 단위 테스트가 실행됨 (통과 여부가 아니라 실행 사실) | `test-execution#unit` |
| `test.ui.completed` | UI 테스트가 실행됨 | `test-execution#ui` |
| `test.integration.completed` | 통합 테스트가 실행됨 | `test-execution#integration` |
| `test.e2e.completed` | E2E가 실행됨 | `test-execution#e2e` |
| `implementation.completed` | 구현이 끝나고 변경 파일이 확정됨 | `implementation` |
| `implementation.<phase>.completed` | 계층 구현 단계가 완료됨 (`logic-scaffold`·`logic`·`ui-scaffold`·`ui`·`integration`·`e2e`) | `implementation#<phase>` |
| `documentation.completed` | 문서 갱신이 끝나고 변경 파일이 확정됨 | `documentation` |
| `review.completed` | 최종 판정이 내려짐 (통과 여부는 verdict가 담음) | `review` |

`test.*.completed`는 "실행됐다"만 뜻한다. 통과/실패는 증거의 `status`가 담고, 그 판정은
워크플로의 전이 조건이 본다. 실행 사실과 판정 결과를 한 토큰에 섞으면 "돌렸는데 실패"와
"아예 안 돌림"을 구분할 수 없게 된다.

`test.<layer>.red-confirmed`는 같은 계층 동작 구현의 관문이다. "테스트를 썼다"와
"테스트가 올바른 이유로 실패한다"를 분리한 이유는, 컴파일 에러나
import 실패로 빨간 것을 구현 착수 근거로 삼지 않기 위해서다.

unit과 UI는 각각 import 가능한 무동작 스캐폴드 뒤에, integration과
E2E는 선행 계층 green 뒤에 red를 확인한다. 스캐폴드가 앞에 오는 이유는 모듈 해석
실패가 red가 아니기 때문이다 — 신규 모듈은 파일이 존재해야 비로소 단언에 도달한다
(ADR-0011). 모든 계층에서 러너 수집·컴파일 오류는
`rejected`이며 단언 실패만 `confirmed`다.

## 2. 아티팩트 (artifact) — 다음 단계가 소비하는 산출물

| 토큰 | 내용 | 생산자 |
|---|---|---|
| `requirements.spec` | `requirements-spec` 포맷의 요구사항 스펙 문서 | `requirements` |
| `specification.contract` | 타입·props·API 스키마·훅 시그니처 | `specification` |
| `specification.testids` | 컴포넌트가 붙일 test-id 규약 | `specification` |
| `specification.test-plan` | 책임 경계·순수 함수 입출력·UI·통합·사용자 여정과 계층 적용 여부 | `specification` |
| `test-design.<layer>.suite` | 해당 계층에 작성된 테스트 파일 집합 | `test-design#<layer>` |
| `implementation.patch` | 변경 diff | `implementation` |
| `implementation.summary` | 변경 요약 (오케스트레이터가 받는 것) | `implementation` |
| `documentation.changeset` | 갱신한 문서 목록과 각 문서를 왜 고쳤는지 | `documentation` |
| `review.verdict` | PASS/FAIL + 지적 + 소유자 라우팅 | `review` |
| `git.inspection` | 현재 저장소·브랜치·변경·원격·PR·참조 이슈·컨벤션 상태 | `git-operations#inspect` |
| `git.commit-ref` | 생성된 커밋 SHA | `git-operations#commit` |
| `git.push-ref` | 푸시된 원격 ref | `git-operations#push` |
| `git.pr-preview` | 게시 전 PR 본문 미리보기 | `git-operations#pr-preview` |
| `git.pr-ref` | 생성/갱신된 PR 번호 | `git-operations#pr-create`·`#pr-update` |

## 3. 증거 (evidence) — 전이 판정과 감사 기록

증거는 §5 레코드 형식을 따른다. `status`가 기계 판정에 쓰이고, `artifact`가 원본을 가리킨다.

| 토큰 | 담는 것 | 허용 status |
|---|---|---|
| `completeness-check` | 완결성 게이트 판정 (어느 슬롯이 왜 미달인지 포함) | `passed` · `failed` |
| `changed-files` | 이 단계가 만든/고친 파일 목록 | `recorded` |
| `contract-diff` | 계약이 이전 고정본에서 어떻게 달라졌는지 | `recorded` · `violated` |
| `contract-deviation` | 하류가 계약의 모호·모순을 만나 내린 잠정 선택과 그 근거 | `recorded` |
| `test.unit.result` | 단위 테스트 실행 결과 | `passed` · `failed` · `errored` |
| `test.ui.result` | UI 렌더링·상호작용 테스트 결과 | `passed` · `failed` · `errored` |
| `test.integration.result` | 통합 테스트 실행 결과 | `passed` · `failed` · `errored` |
| `test.e2e.result` | E2E 실행 결과 | `passed` · `failed` · `errored` |
| `test.<layer>.red-proof` | 해당 계층 실패가 예상한 단언 때문임을 보이는 근거 | `confirmed` · `rejected` · `moot`(integration·e2e만) |
| `test.integration.manual-result` | 러너 대신 문서화된 수동 절차로 검증한 결과 | `passed` · `failed` |
| `test.e2e.manual-result` | 러너 대신 문서화된 수동 절차로 검증한 결과 | `passed` · `failed` |
| `test.skip-justification` | 어떤 테스트 층을 왜 생략했는지 | `recorded` |
| `documentation-impact` | 이 변경이 어떤 문서에 영향을 주는지, 없다면 왜 없는지 | `required` · `not-applicable` |
| `documentation.skip-justification` | 문서를 왜 고치지 않았는지 | `recorded` |
| `review-findings` | 지적 목록 + 우선순위 + 소유자 | `recorded` |
| `policy-decision` | 정책 판정 기록 (허용/거부 + 근거 정책 id) | `allowed` · `denied` |
| `approval-record` | 파괴적 작업에 대한 사람의 승인 기록 | `granted` · `refused` |

`moot`는 **red가 애초에 존재하지 않았던** 경우다 — 그 계층이 검증하려는 것을 선행 계층이
이미 만들어놔서 첫 실행부터 전부 통과한다. 실패가 0건이므로 `confirmed`도 `rejected`도
사실과 어긋난다. 생략과도 다르다 — 테스트는 작성됐고 실행됐고 통과했다.

**`unit`·`ui`에는 `moot`가 없다.** 두 계층에는 앞에 스캐폴드 단계가 있고, 스캐폴드가 동작을
의도적으로 비우므로 red가 반드시 관찰된다. `integration`·`e2e`는 비울 스캐폴드가 없고 선행
계층이 만든 협력을 관찰할 뿐이라 red가 사라질 수 있다. 이 비대칭이 ADR-0012의 근거다.

`moot`는 우회 통로가 아니다. 성립 조건은 `workflows/gates/require-red-evidence.md`가 정한다.

`test.skip-justification`이 있어야 integration·e2e를 생략할 수 있다. 침묵 생략은
"전부 통과"처럼 읽히므로 워크플로가 생략 사유를 증거로 남기도록 강제한다.

`manual-result`는 생략이 **아니다.** 검증은 했고 러너를 쓰지 않았을 뿐이라 승인이 필요
없다. 승인은 "검증을 포기한다"에 붙는 것이지 "다른 방법으로 검증했다"에 붙는 것이 아니다.
성립 조건은 `workflows/gates/require-test-evidence.md`가 정한다 (ADR-0013).

`integration`·`e2e`에만 있는 이유는 그 둘만 러너가 저장소 밖 환경(에뮬레이터·기기·실
서버)을 요구할 수 있기 때문이다. `unit`·`ui`는 같은 프로세스 안에서 도므로 "러너를 둘 수
없다"가 성립하지 않는다. 같은 두 계층이 생략 가능한 계층이자 `moot`이 허용되는 계층인
것도 같은 이유다.

`contract-deviation`은 **하류가** 남긴다. 계약을 고정한 쪽이 아니라 그것을 쓰다 막힌
쪽이 무엇을 어떻게 우회했는지 아는 유일한 자리이기 때문이다. 기록만으로 진행할 수는
없다 — `approval-record: granted`가 함께 있어야 하고, 없으면 `specification`으로
되돌린다. 계약을 따르지 않기로 한 선택은 우회이고, 승인은 우회에 붙는다 (ADR-0014).

문서도 같은 구조를 쓴다. `documentation-impact`는 **계약 고정 단계가** 남긴다 —
문서화 레이어가 자기 일의 유무를 스스로 선언하면 그 판정을 검증할 근거가 사라지기
때문이다(ADR-0005 결정 1). 판정이 `not-applicable`이면 `documentation.skip-justification`이
구체적 사유와 함께 있어야 하고, `required`면 `documentation.changeset`이 있어야 한다.

## 4. 프로파일 확장 예시

```yaml
# profiles/frontend/profile.yaml → namespace: frontend
frontend:design.tokens-frozen      # 디자인 토큰 고정 신호
frontend:a11y.axe-result           # axe 실행 결과 증거
frontend:visual.snapshot-result    # 비주얼 스냅샷 증거
```

이 토큰들은 코어 표에 등록하지 않는다. 프론트엔드 프로파일을 떼어내면 함께 사라진다.

**도메인 단계의 생략 어휘도 여기 온다.** `test.skip-justification`은 테스트 계층용이고
`documentation.skip-justification`은 문서용이라, 프로파일이 끼운 단계의 생략은 자기
네임스페이스에 만든다 — `frontend:state.skip-justification`처럼. 코어에 두면 코어가
도메인 축을 알기 시작한다 (ADR-0017).

## 5. 증거 레코드 형식

```yaml
evidence:
  - kind: test.unit.result          # §3 등록 토큰
    status: failed                  # 해당 kind의 허용 status 중 하나
    summary: "3 failed, 12 passed"  # 사람이 읽는 한 줄
    artifact: .harness/runs/{runId}/unit.json   # 원본 경로 (코어 증거는 필수)
    producedBy: test-execution#unit # <capability>[#<variant>]
```

- `status`는 워크플로 전이 조건이 대조하는 값이다. 상태 머신이 아니라 이 값이 전이를 결정한다.
- `artifact`는 코어 증거에서 **필수**다. capability manifest가 `artifactRequired: true`로
  선언하고 `npm run validate`가 대조한다. `status`와 `summary` 한 줄만 남는 증거는 세션과
  함께 사라지고, 다음 세션은 그것을 봤다고 착각한 채 게이트를 통과시킨다.
- 경로가 필요 없어 보이는 것은 증거가 아니라 **신호**다. §1과 §3이 둘을 갈라 둔다 — 신호는
  있음/없음이고, 증거는 사후에 재구성할 수 있어야 한다.
- 프로파일 네임스페이스 증거는 프로파일이 정한다. 코어가 그쪽 `status`를 규정하지 않는 것과
  같은 경계다.
- 검사는 선언이 경로를 *요구하는지*까지만 본다. 그 경로에 실제로 파일이 생겼는지는 증거를
  기록하는 주체가 없어서 아무도 보지 않는다.
- `{runId}` 자리표시자는 실행 인스턴스가 채운다. 실행 인스턴스는 소스 디렉터리로 만들지 않는다.
- **`runId`는 흐름 하나를 식별한다. 세션은 그 경계가 아니다.** 한 실행이 여러 세션에
  걸치면 같은 `runId`를 이어 쓴다. 새로 만들면 증거가 두 디렉터리로 갈라지고, 게이트가
  보려는 증거는 앞쪽에 있는데 지금 실행은 뒤쪽을 본다 (ADR-0022).
- 세션은 어휘에 없다. **하네스의 기록이 세션을 모른다는 것이 외부기억 원칙의 내용이다** —
  게이트는 증거를 보지 그 증거가 어느 세션에서 나왔는지 묻지 않는다.

## 6. 어휘 추가 절차

1. 코어 토큰이 정말 필요한지 본다. 특정 도메인에서만 의미가 있으면 프로파일 네임스페이스로 간다.
2. 코어면 이 문서의 해당 표에 행을 추가한다.
3. `packages/manifest-contracts/vocabulary.json`의 목록을 함께 갱신한다 (검증기가 읽는 기계 판독본).
4. 코어 증거를 더했다면 그것을 선언하는 capability가 `artifactRequired: true`를 켠다. 켤 수
   없다고 느껴지면 그것은 증거가 아니라 신호다 — §1로 간다.
5. 어휘를 **제거**할 때는 참조하는 manifest를 모두 고친 뒤에 지운다. 검증기의 참조 무결성
   검사가 미참조를 잡아준다.
