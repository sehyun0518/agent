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
| `test-design.completed` | 인수 기준을 검증하는 테스트가 작성됨 | `test-design` |
| `test.red-confirmed` | 그 테스트가 **예상한 이유로** 실패함이 확인됨 | `test-execution` |
| `test.unit.completed` | 단위 테스트가 실행됨 (통과 여부가 아니라 실행 사실) | `test-execution#unit` |
| `test.integration.completed` | 통합 테스트가 실행됨 | `test-execution#integration` |
| `test.e2e.completed` | E2E가 실행됨 | `test-execution#e2e` |
| `implementation.completed` | 구현이 끝나고 변경 파일이 확정됨 | `implementation` |
| `review.completed` | 최종 판정이 내려짐 (통과 여부는 verdict가 담음) | `review` |

`test.*.completed`는 "실행됐다"만 뜻한다. 통과/실패는 증거의 `status`가 담고, 그 판정은
워크플로의 전이 조건이 본다. 실행 사실과 판정 결과를 한 토큰에 섞으면 "돌렸는데 실패"와
"아예 안 돌림"을 구분할 수 없게 된다.

`test.red-confirmed`는 구현 착수의 유일한 관문이다. "테스트를 썼다"(`test-design.completed`)와
"테스트가 올바른 이유로 실패한다"(`test.red-confirmed`)를 분리한 이유는, 컴파일 에러나
import 실패로 빨간 것을 구현 착수 근거로 삼지 않기 위해서다.

이 신호는 **구현 전에 의미 있게 실패할 수 있는 층**에서만 나온다 — 실무적으로 단위 층이다.
통합은 픽스처·목킹 미비로, E2E는 화면 부재로 `errored`가 되기 쉽고 그건 실패가 아니라
실행 불가다. 그래서 E2E는 red 확인 대상이 아니다.

## 2. 아티팩트 (artifact) — 다음 단계가 소비하는 산출물

| 토큰 | 내용 | 생산자 |
|---|---|---|
| `requirements.spec` | `requirements-spec` 포맷의 요구사항 스펙 문서 | `requirements` |
| `specification.contract` | 타입·props·API 스키마·훅 시그니처 | `specification` |
| `specification.testids` | 컴포넌트가 붙일 test-id 규약 | `specification` |
| `test-design.suite` | 작성된 테스트 파일 집합 | `test-design` |
| `implementation.patch` | 변경 diff | `implementation` |
| `implementation.summary` | 변경 요약 (오케스트레이터가 받는 것) | `implementation` |
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
| `test.unit.result` | 단위 테스트 실행 결과 | `passed` · `failed` · `errored` |
| `test.integration.result` | 통합 테스트 실행 결과 | `passed` · `failed` · `errored` |
| `test.e2e.result` | E2E 실행 결과 | `passed` · `failed` · `errored` |
| `test.red-proof` | 실패가 **예상한 이유**임을 보이는 근거 (실패 테스트명 + 실패 메시지) | `confirmed` · `rejected` |
| `test.skip-justification` | 어떤 테스트 층을 왜 생략했는지 | `recorded` |
| `review-findings` | 지적 목록 + 우선순위 + 소유자 | `recorded` |
| `policy-decision` | 정책 판정 기록 (허용/거부 + 근거 정책 id) | `allowed` · `denied` |
| `approval-record` | 파괴적 작업에 대한 사람의 승인 기록 | `granted` · `refused` |

`test.skip-justification`이 있어야 integration·e2e를 생략할 수 있다. 침묵 생략은
"전부 통과"처럼 읽히므로 워크플로가 생략 사유를 증거로 남기도록 강제한다.

## 4. 프로파일 확장 예시

```yaml
# profiles/frontend/profile.yaml → namespace: frontend
frontend:design.tokens-frozen      # 디자인 토큰 고정 신호
frontend:a11y.axe-result           # axe 실행 결과 증거
frontend:visual.snapshot-result    # 비주얼 스냅샷 증거
```

이 토큰들은 코어 표에 등록하지 않는다. 프론트엔드 프로파일을 떼어내면 함께 사라진다.

## 5. 증거 레코드 형식

```yaml
evidence:
  - kind: test.unit.result          # §3 등록 토큰
    status: failed                  # 해당 kind의 허용 status 중 하나
    summary: "3 failed, 12 passed"  # 사람이 읽는 한 줄
    artifact: .harness/runs/{runId}/unit.json   # 원본 경로 (선택)
    producedBy: test-execution#unit # <capability>[#<variant>]
```

- `status`는 워크플로 전이 조건이 대조하는 값이다. 상태 머신이 아니라 이 값이 전이를 결정한다.
- `artifact`는 선택이지만, `status`만으로 재현할 수 없는 증거(테스트 출력·스크린샷·diff)는
  반드시 경로를 남긴다.
- `{runId}` 자리표시자는 실행 인스턴스가 채운다. 실행 인스턴스는 소스 디렉터리로 만들지 않는다.

## 6. 어휘 추가 절차

1. 코어 토큰이 정말 필요한지 본다. 특정 도메인에서만 의미가 있으면 프로파일 네임스페이스로 간다.
2. 코어면 이 문서의 해당 표에 행을 추가한다.
3. `packages/manifest-contracts/vocabulary.json`의 목록을 함께 갱신한다 (검증기가 읽는 기계 판독본).
4. 어휘를 **제거**할 때는 참조하는 manifest를 모두 고친 뒤에 지운다. 검증기의 참조 무결성
   검사가 미참조를 잡아준다.
