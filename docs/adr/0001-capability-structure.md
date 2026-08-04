# ADR-0001 — 작업 Capability 기반 구조

- 상태: 채택
- 날짜: 2026-08-04
- 대체: 없음

## 배경

이 저장소는 구성요소 **종류**(`agents/`, `skills/`)를 축으로 배치돼 있다. 그 결과:

- 하나의 작업을 수행하는 자산이 여러 디렉터리에 흩어진다.
- 어떤 에이전트가 어떤 스킬·훅과 함께 동작하는지 구조에서 읽히지 않는다.
- `agents/orchestration.md` §9가 프론트엔드 로스터·DAG·라우팅을 직접 소유해,
  역할이 늘 때마다 중앙 문서를 고쳐야 한다.
- 프론트엔드 도메인 지식이 공용 하네스 본체에 섞여 다른 도메인에 재사용할 수 없다.
- 명세·테스트·구현·리뷰의 작업 경계가 구조에 반영되지 않는다.

조사 시점 실태: 파일 405개가 **전부 `.md`/`.mdc`** 이며 실행 코드·`package.json`·CI가
없다. 루트 `agents/*.md` 9개, 루트 `skills/` 11개(단일 md 9 + 규칙 팩 2),
플랫폼 미러 3종(`.claude`·`.cursor`·`.codex`)이 전부 수동 동기화된다.

제약: 플랫폼 탐색 경로는 고정이다. Claude Code는 `.claude/agents/*.md`와
`.claude/skills/*/SKILL.md`만 인식한다.

## 결정

### D1. 축을 도메인이 아니라 작업 Capability로 잡는다

각 Capability가 `agents`·`skills`·`tools`·`hooks`·`tests`·`evals`를 수직 슬라이스로
소유하고, `capability.yaml`이 입력·출력·선행조건·권한·증거·진입점을 선언한다.
개별 GitHub Issue나 실행 건마다 패키지를 만들지 않는다 — 실행 인스턴스는 소스가 아니라 기록이다.

### D2. 런타임화는 단계적으로 한다

1단계는 선언(YAML manifest + JSON Schema)과 `tooling/`의 검증·생성 CLI만 만든다.
`orchestrator`·`hook-runtime`·`policy-engine`·`execution-state`·`capability-registry`·
`test-kit`의 실행 코드화는 manifest 계약이 안정된 뒤 ADR-0002로 승격한다.

**근거**: 현재 저장소에 실행 코드가 0이다. 계약이 굳기 전에 런타임을 먼저 만들면
잘못된 추상화를 되돌리는 비용이 크다.

### D3. 도메인 특화 자산은 프로파일로 분리한다

core capability는 도메인 무관으로 두고, 프론트엔드 특화 자산(`design`·
`accessibility`·`state-data`·React/RN 규칙 팩·컴포넌트 API 패턴 스킬)은
`profiles/frontend/`로 옮긴다. 프로파일이 Capability에 도메인 에이전트와 스킬을
**바인딩**한다. 소비 저장소의 `.agent-harness/` 로컬 profile과 같은 메커니즘이다.

### D4. 플랫폼 미러는 생성 산출물로 전환한다

`capabilities/` + `profiles/`가 단일 출처가 되고, `tooling/generators`가
`.claude`·`.cursor`·`.codex`를 생성한다. 플랫폼이 git에서 읽어야 하므로 생성물은
커밋하되 직접 편집을 금지하고, CI가 "재생성 결과 == 커밋 상태"를 검사한다.
`README.md`의 수동 동기화 절차는 폐기된다.

### D5. 요구사항과 명세를 별도 Capability로 나눈다

`requirements`(사용자 발화 → 요구사항 스펙)와 `specification`(스펙 → 기술 계약)을
분리한다.

**근거**: 둘은 입력원·권한·증거가 다르다. `discussion`은 도구 없음·레포 조사 금지이고,
`spec`은 쓰기 권한·레포 조사가 필요하다. 한 Capability에 묶으면 manifest의
`permissions`가 자기 모순에 빠진다.

### D6. 테스트 실행은 1 Capability + 3 변형으로 둔다

`test-execution/` 아래 `unit/`·`integration/`·`e2e/`를 두고 `capability.yaml`의
`variants`로 선언한다. 각 변형은 독립된 `produces`와 `evidence`를 갖는다.

**근거**: 제안서의 디렉터리 구조와 "unit·integration·e2e를 하나의 `test` 상태로
합치지 않는다"는 요구를 동시에 만족한다. 3개 독립 Capability로 쪼개면 명령 해석·
결과 파싱·증거 생성 훈련이 3곳에 중복된다.

### D7. orchestration과 observability는 Capability가 아니다

- `orchestration` §0~8(도메인 무지 본체) → `packages/orchestrator/`
- `observability` → `packages/telemetry-contracts/`

**근거**: 제안서 원칙 "Orchestrator는 작업 Capability와 분리한다"를 따른다. 둘 다
`requires`/`produces`로 표현되는 작업 단계가 아니라 횡단 관심사다. Orchestrator를
Capability로 두면 자기 자신을 registry에 등록해야 해서 순환이 생긴다.

> 제안서 초안의 `capabilities/observability/`에서 벗어난 지점이다.
> 관측 **계약**은 `packages/telemetry-contracts/`에 두고, 증거 수집 동작은 각
> Capability의 `evidence` 선언과 `hooks/`가 수행한다. Capability 구현이 특정 관측
> SDK를 직접 호출하지 않는다는 원칙은 그대로 유지된다.

### D8. 선언 포맷은 YAML, 스키마는 JSON Schema, 루트 `package.json` 1개

manifest는 사람이 읽고 쓰는 YAML로 두고(주석 가능), 검증 스키마는 JSON Schema로 둔다.
루트에 `package.json` 하나만 두고 `tooling/`이 `yaml`·`ajv`를 사용한다.
pnpm workspace·turbo 같은 모노레포 도구는 실행 코드가 생기는 ADR-0002로 미룬다.

### D9. 배포 채널은 이번 범위에서 정하지 않는다

`.agent-harness/profile.yaml` 스키마와 정책 우선순위만 확정한다. npm 퍼블리시 /
git submodule / 복사 중 무엇으로 소비 저장소에 배포할지는 후속 ADR에서 정한다.

## 확정 Capability 목록

| Capability | 유래 | 변형 |
|---|---|---|
| `requirements` | 기존 `discussion` | — |
| `specification` | 기존 `spec` | — |
| `test-design` | 기존 `tester`(설계 몫) | — |
| `test-execution` | 신규 | `unit` · `integration` · `e2e` |
| `implementation` | 기존 `implementation` | — |
| `review` | 기존 `review` | — |
| `git-operations` | 신규 | `commit` · `push` · `pr-preview` · `pr-create` · `pr-update` |

비-Capability: `packages/orchestrator`, `packages/telemetry-contracts`,
`packages/manifest-contracts`, `packages/policy-contracts`, `profiles/frontend`.

## 결과

**좋아지는 것**

- 작업 하나를 고칠 때 디렉터리 하나만 연다.
- 중앙 registry나 오케스트레이터를 고치지 않고 Capability를 추가할 수 있다.
- 프로파일 교체만으로 다른 도메인에 재사용된다.
- 미러 드리프트가 CI 게이트로 구조적으로 차단된다.

**감수하는 것**

- 미러를 손으로 못 고친다. 반드시 소스를 고치고 재생성해야 한다.
- 루트에 `package.json`과 `node_modules`가 생긴다(현재는 순수 문서 저장소).
- 마이그레이션 기간 동안 구 구조와 신 구조가 공존한다(덧붙임 우선 원칙).

**되돌리는 법**

Phase 5에서 루트 `agents/`·`skills/`를 제거하기 전까지는 `capabilities/`를 삭제하면
원상 복구된다. 그 이후로는 생성기를 통해서만 미러를 재구성한다.

## 참조

- `docs/migration/inventory.md` — 자산별 귀속 매핑
- 제안서 원문: 이슈 "작업 Capability 기반 Agent Harness 모노레포 구조 재설계"
