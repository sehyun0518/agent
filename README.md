# Agent Harness

작업 유형(**Capability**)을 축으로 구성한 에이전트 하네스. 구성요소 종류가 아니라
**하나의 작업**이 디렉터리 경계이고, 각 작업이 자기 agent·skill·tool·hook·test·eval을
수직 슬라이스로 소유한다.

## 한 줄 요약

```text
requirements → specification/test-plan → unit red/green → UI red/green → integration red/green → E2E red/green → review
```

각 화살표는 **증거**로 건넌다. 상태 플래그가 아니라 증거가 전이 근거다.

## 왜 이렇게 생겼나

두 가지가 이 구조를 결정한다.

**1. 작업이 경계다.** 예전에는 `agents/`·`skills/`처럼 구성요소 종류로 나뉘어 있어,
"테스트 설계"를 고치려면 여러 디렉터리를 열어야 했고 무엇이 무엇과 함께 도는지 구조에서
읽히지 않았다. 이제 `capabilities/test-design/` 하나만 열면 된다.

**2. 도메인은 교체 가능하다.** Capability는 프론트엔드를 모른다. 디자인 토큰·React 규칙
팩·컴포넌트 API 패턴은 `profiles/frontend/`가 소유하고 바인딩으로 주입한다. 프로파일을
갈아끼우면 같은 Capability가 다른 도메인에서 돈다.

## 레이어와 하네스

**레이어(Capability)는 혼자서도 쓸 수 있어야 하고, 하네스는 일하지 않는다.**
하네스는 묶고(bind) · 검증하고(gate) · 넘기는(handoff) 것만 한다. ([ADR-0003](docs/adr/0003-layer-harness-boundary.md))

이 원칙이 두 가지를 결정한다.

**훅에는 두 종류가 있고 소유자가 다르다.**

| 종류 | 검사 대상 | 소유 | 예 |
|---|---|---|---|
| 자기 산출 검사 | 내 결과가 쓸 만한가 | 레이어 | `completeness-gate` · `contract-freeze` |
| **이관 게이트** | 앞 레이어가 넘긴 게 조건을 만족하나 | **하네스** | `workflows/gates/require-red-evidence` |

이관 게이트가 레이어 안에 있으면 그 레이어는 단독으로 못 쓴다. 구현 하나만 시키려 해도
앞 단계 증거를 요구하며 막힌다. **게이트 파일을 지웠을 때 레이어가 그대로 도는가**가
올바른 배치인지 판별하는 시험이다.

**레이어는 토큰으로만 말한다.**

```diff
- 테스트를 실행하지 않습니다 — `test-execution` Capability의 몫입니다.
+ 테스트를 실행하지 않습니다. `test.<layer>.red-proof` 증거는 이 층이 만드는 것이 아닙니다.
```

누가 그 토큰을 만드는지, 실패하면 어디로 보내는지는 워크플로의 `dependsOn`과 프로파일의
`routing`이 안다. 검증기가 Capability 본문의 이웃 이름을 실패로 잡는다.

## 구조

```text
capabilities/           작업 유형별 수직 슬라이스 (단일 출처)
  <id>/capability.yaml    계약 — 입력·출력·선행조건·권한·증거·완료조건·진입점·실패정책
  <id>/agents/            역할 본문 (frontmatter 없음 — 메타는 manifest가 소유)
  <id>/skills/ hooks/ tests/ evals/

profiles/               도메인 바인딩 (교체 가능)
  frontend/profile.yaml   로스터 · 라우팅 · 바인딩 · 워크플로 확장 · 지식 참조
  frontend/agents/ skills/ knowledge/

packages/               계약과 조정자 (Capability 아님)
  manifest-contracts/     capability·profile·workflow·orchestrator JSON Schema + 어휘
  policy-contracts/       정책 스키마 + 우선순위
  telemetry-contracts/    공급자 독립 관측 이벤트 계약
  boundary-contracts/     경계마다 검사되는 계약 (requirements-spec)
  orchestrator/           도메인 무지 조정자 본체

workflows/              change · bugfix · review
  gates/                  이관 게이트 — 앞 레이어가 넘긴 증거를 검사
policies/               permissions · data-handling · destructive-actions
tooling/                validators · generators
docs/                   vocabulary · adr · migration · consumer-profile

.claude/ .cursor/ .codex/   생성 산출물 — 직접 편집 금지
```

## Capability

| id | requires | produces | 비고 |
|---|---|---|---|
| `requirements` | — | `requirements.spec` | 도구 없음. 입력원은 발화뿐 |
| `specification` | `requirements.*` | `specification.contract` · `.testids` · `.test-plan` | 책임 경계와 계층 적용 여부 고정 |
| `test-design` | `specification.*` | `test-design.<layer>.suite` | 네 계층 변형. 작성만 수행 |
| `test-execution` | 계층별 suite | `test.<layer>.red-confirmed` · `.completed` | `unit`·`ui`·`integration`·`e2e` 변형 |
| `implementation` | 계층별 red 증거 | `implementation.patch` | 계층별 red 없이 동작 구현 불가 |
| `review` | `test.unit.completed` | `review.verdict` | 증거 소비. 직접 안 돌림 |
| `git-operations` | — | `git.*` | `inspect`·`commit`·`push`·`pr-*` 6변형, 전부 수동 |

계약의 단일 출처는 각 `capabilities/<id>/capability.yaml`이다.

## 증거로 전이한다

이 하네스의 중심 규칙이다.

```yaml
evidence:
  - kind: test.unit.result
    status: failed              # 기계가 이걸 보고 전이를 판정한다
    summary: "3 failed, 12 passed"
    artifact: .harness/runs/{runId}/unit.json
    producedBy: test-execution#unit
```

- **완료는 증거로만 판정된다.** `capability.yaml`에 상태 플래그 필드가 없다.
- **`test.*.completed`는 "실행됐다"만 뜻한다.** 통과 여부는 `status`가 담는다. 둘을
  한 토큰에 섞으면 "돌렸는데 실패"와 "아예 안 돌림"을 구분할 수 없다.
- **red는 "빨갛다"가 아니라 "예상한 이유로 빨갛다"다.** 컴파일·import 실패는 `rejected`이며
  구현이 시작되지 않는다.
- **침묵 생략이 없다.** unit은 동작 변경에서 필수다. UI가 없는 작업은 test-plan에
  구체적인 사유를 남기고, `integration`·`e2e`를 건너뛰려면 사유
  (`test.skip-justification`)와 승인(`approval-record: granted`)을 모두 남긴다.

어휘의 단일 출처는 `docs/vocabulary.md`, 기계 판독본은 `packages/manifest-contracts/vocabulary.json`.

## 프로파일

Capability는 `profileExtensible`로 무엇을 주입받을지 선언하고, 프로파일이 그 축만 채운다.

frontend 기본 테스트 스택은 unit=Vitest, UI=Vitest+React Testing Library+user-event,
integration=Vitest+React Testing Library+MSW, E2E=Playwright다. 소비 저장소가
`testing.layers.<layer>`를 선언하면 그 계층 객체 전체가 기본값을 대체한다. 내부 필드를
merge하지 않으므로 서로 다른 러너와 파일 패턴이 섞이지 않는다.

```yaml
# profiles/frontend/profile.yaml
bindings:
  - capability: implementation
    skillsOneOf:                      # 택일 — 혼용 금지가 스키마로 표현된다
      - frontend:react-best-practice
      - frontend:react-native-skills
    tools: [mcp__playwright]
```

프로파일은 **권한을 좁힐 수만 있다**. `none < read < write`, `none < allowlist < any`
격자에서 Capability보다 넓으면 검증기가 거부한다.

프로파일은 `<namespace>:` 접두사로 자기 토큰을 만든다. 코어 어휘를 건드리지 않고
도메인 증거를 늘릴 수 있는 이유다.

## 오케스트레이터는 이름을 모른다

`packages/orchestrator/orchestrator.md`에는 특정 Capability도 명명 에이전트도 등장하지
않는다. 검증기가 `forbiddenReferences`로 이걸 강제한다.

실행자 이름은 프로파일의 `roster`가, 지적의 소유자는 `routing`이 정한다.
그래서 Capability를 추가해도 중앙 문서를 고칠 필요가 없다.

**순서는 워크플로만 안다.** 프로파일은 도메인 단계를 어디에 끼울지(`workflowExtensions`)만
선언한다. 프로파일이 자기 순서를 따로 갖고 있으면 워크플로와 경쟁하는 정의가 둘이 되고,
어느 쪽을 따르는지에 따라 게이트가 통째로 우회된다.

```yaml
workflowExtensions:
  - workflow: "*"
    insert:
      - id: design
        runner: design
        mode: parallel-with
        anchorCapability: specification   # step id가 아니라 Capability로 앵커
```

step id가 아니라 Capability로 앵커하는 이유는 워크플로마다 이름이 다르기 때문이다
(`change`는 `implementation`, `bugfix`는 `fix`). 대상 워크플로에 그 Capability가 없으면
삽입은 건너뛰어진다 — 그 흐름에 해당 단계가 없다는 뜻이다.

## Git 작업은 연쇄하지 않는다

```text
commit ─╳→ push ─╳→ pr-create
```

- `commit`은 push하지 않고, `push`는 PR을 만들지 않고, `pr-create`는 commit도 push도 하지 않는다.
- 기존 PR이 있으면 `pr-create` 대신 `pr-update`를 명시적으로 쓴다.
- 커밋·PR에 자동화 도구 출처 문구를 자동으로 넣지 않는다.

두 겹으로 막는다: `chaining.autoInvoke: false`(나가는 호출)와
`chaining.autoTriggerable: false`(들어오는 자동 진행), 그리고 `before-tool` 훅.

## 플랫폼 미러는 생성물이다

`.claude` · `.cursor` · `.codex`를 **직접 편집하지 않는다.**

```sh
npm run validate   # 선언 검증
npm run generate   # 미러 생성
npm run check      # 둘 다 (CI가 도는 것)
```

CI가 재생성 결과와 커밋 상태를 대조하고, 다르면 병합을 막는다. 소스에 대응이 없는
생성물(고아)은 제거된다. 손으로 고친 내용은 되돌아간다.

| 플랫폼 | 형태 |
|---|---|
| `.claude/` | 본문 전문 인라인 + frontmatter |
| `.cursor/` | 얇은 래퍼 + `rules/` 색인 |
| `.codex/` | 얇은 래퍼 + `SKILL.md` 미러 + `AGENTS.md` 진입점 |

## 검증기가 막는 것

프롬프트가 아니라 `npm run validate`가 강제한다.

- 미등록 어휘 토큰(오타), 허용되지 않은 증거 status
- 선언하지 않은 증거를 완료 조건으로 요구
- 없는 파일을 가리키는 진입점
- 도구가 `permissions`를 초과 (`filesystem-boundary` · `network-access`)
- 파괴적 작업인데 승인·증거 선언 없음
- 프로파일이 권한을 넓히거나 blocking 훅을 낮춤
- 오케스트레이터 본체에 도메인 지식 유입
- 워크플로가 변형을 안 쓰고 테스트 층을 합침
- 중복 단계·의존 순환·선행 단계가 아닌 증거 참조
- 계층별 red 생산자를 의존 그래프 조상으로 두지 않은 구현 단계
- repository 테스트 계층에 대응하는 `commands.test.<layer>` 누락
- 자동 진행 금지 Capability를 `automatic` 단계로 둠

전체 목록은 `tooling/README.md`.

## 운영

| 문서 | 언제 |
|---|---|
| **[docs/walkthrough.md](docs/walkthrough.md)** | 처음 쓸 때. 작업 하나가 발화에서 판정까지 가는 전 과정 |
| **[docs/operations.md](docs/operations.md)** | 기준이 필요할 때. 게이트 조건, 되돌릴 곳, 무엇을 고치면 무엇을 돌리는지 |

지금 **자동인 것은 선언 검사와 미러 드리프트 두 가지뿐**이다. 워크플로 순서와 게이트는
문서상 규칙이고 실행 주체는 사람 또는 메인 에이전트다. 이 경계를 먼저 확인한다.

## 유지보수

### Capability 추가

1. `capabilities/<id>/capability.yaml`을 쓴다 (`id` = 디렉터리명).
2. 토큰이 `docs/vocabulary.md`에 있는지 본다. 도메인 전용이면 프로파일 네임스페이스로.
3. 증거를 정한다. **증거 없이 완료되는 Capability는 만들지 않는다.**
4. `npm run check`.

중앙 registry나 오케스트레이터는 고치지 않는다.

### 역할 본문 수정

`capabilities/<id>/agents/*.md` 또는 `profiles/<id>/agents/*.md`를 고치고 재생성한다.
본문에 frontmatter를 넣지 않는다 — 메타데이터는 manifest가 소유하고, 남아 있으면
생성기가 오류로 잡는다.

### 도메인 지식 수정

`profiles/<id>/`에서 고친다. Capability 본문에 도메인 지식을 넣으면 프로파일을 교체해도
그 도메인이 따라온다.

### 소비 저장소 연결

`docs/consumer-profile.md`와 `examples/consumer-repo/.agent-harness/profile.yaml`.
실행 명령·컨벤션·권한 축소는 소비 저장소가 소유한다.

## 아직 코드가 아니다

`orchestrator`·`hook-runtime`·`policy-engine`·`execution-state`는 선언만 있고 실행
코드가 없다. `tooling/`은 검증·생성 도구이지 하네스 런타임이 아니다.

정책 7종 중 실제로 강제되는 것과 훅 런타임을 기다리는 것은 `policies/README.md`에
✅/⏳로 구분해 뒀다. 승격 조건은 `docs/adr/0002-runtime-promotion.md`.

## 결정 기록

| ADR | 내용 |
|---|---|
| [0001](docs/adr/0001-capability-structure.md) | Capability 축, 단계적 런타임화, 프로파일 분리, 생성 미러 |
| [0002](docs/adr/0002-runtime-promotion.md) | 실행 코드화 승격 조건 |
| [0003](docs/adr/0003-layer-harness-boundary.md) | 레이어는 단독 동작, 하네스는 묶고 검증하고 이관만 |
| [0004](docs/adr/0004-layered-red-green.md) | unit → UI → integration → E2E 계층별 red-green과 생략 규칙 |

이관 기록은 `docs/migration/inventory.md`.
