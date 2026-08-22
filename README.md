# Agent Harness

Agent Harness는 에이전트 작업을 **Capability 단위의 레이어**로 나누고, 각 레이어를
증거로 연결하는 선언형 하네스입니다. 각 레이어는 자신의 계약과 역할을 소유하고,
워크플로는 레이어의 실행 순서와 이관 조건을 정의합니다.

> 현재 저장소는 선언, 정적 검증, 플랫폼별 설정 생성을 제공합니다. 워크플로 실행 엔진과
> 증거 저장소는 아직 제공하지 않습니다. 실제 단계 호출과 증거 기록은 사람 또는 메인
> 에이전트가 수행합니다.

## 빠르게 이해하기

하나의 변경 작업은 다음 순서로 진행합니다.

```text
요구사항
  → 계약과 테스트 계획
  → Unit Red → 순수 로직 → Unit Green
  → UI Red → 컴포넌트 → UI Green
  → Integration Red → 연결 구현 → Integration Green
  → E2E Red → 사용자 여정 연결 → E2E Green
  → 문서 갱신
  → 최종 검토
```

각 화살표는 상태 플래그가 아니라 **증거**를 전달합니다. 테스트가 실패했다는 사실만으로는
구현을 시작하지 않습니다. 테스트가 예상한 단언 때문에 실패했다는 `red-proof`가 있어야
같은 계층의 구현을 시작합니다.

Git 작업은 위 흐름에 자동으로 연결하지 않습니다. 상태 확인, 커밋, 푸시, PR 생성은
사용자가 각각 명시적으로 요청할 때만 수행합니다.

## 레이어 바로가기

이 저장소에서는 Capability와 레이어를 같은 의미로 사용합니다. 각 링크에서 해당 레이어의
입력, 출력, 실행 단위, 완료 조건을 확인할 수 있습니다.

| 순서 | 레이어 | 담당하는 일 | 담당하지 않는 일 |
|---:|---|---|---|
| 1 | [Requirements](capabilities/requirements/README.md) | 사용자 발화를 실행 가능한 요구사항으로 정리합니다. | 저장소나 외부 자료를 조사하지 않습니다. |
| 2 | [Specification](capabilities/specification/README.md) | 계약과 계층별 테스트 계획을 고정합니다. | 제품 코드나 테스트를 구현하지 않습니다. |
| 3 | [Test Design](capabilities/test-design/README.md) | 계층별 테스트를 작성합니다. | 테스트를 실행하거나 제품 코드를 수정하지 않습니다. |
| 4 | [Test Execution](capabilities/test-execution/README.md) | 테스트를 실행하고 red 또는 green 증거를 남깁니다. | 테스트나 제품 코드를 수정하지 않습니다. |
| 5 | [Implementation](capabilities/implementation/README.md) | 확인된 red를 같은 계층의 구현으로 green으로 만듭니다. | 인수 기준 테스트를 새로 작성하지 않습니다. |
| 6 | [Documentation](capabilities/documentation/README.md) | 변경 때문에 낡은 문서를 갱신하고 근거를 남깁니다. | 문서 영향 범위를 스스로 판정하거나 제품 코드를 수정하지 않습니다. |
| 7 | [Review](capabilities/review/README.md) | 계약과 테스트·문서 증거를 읽고 최종 판정을 내립니다. | 테스트를 다시 실행하거나 코드를 수정하지 않습니다. |
| 수동 | [Git Operations](capabilities/git-operations/README.md) | Git과 GitHub 작업을 한 번에 하나씩 수행합니다. | 다음 Git 작업을 자동으로 이어서 수행하지 않습니다. |

레이어 공통 규칙과 새 레이어 추가 방법은
[Capability 안내서](capabilities/README.md)에서 확인할 수 있습니다.

## 전체 구조

```text
capabilities/                 작업 레이어의 단일 출처입니다.
  <id>/capability.yaml        입력, 출력, 권한, 증거, 완료 조건을 정의합니다.
  <id>/README.md              사람이 읽는 레이어 안내서입니다.
  <id>/agents/                역할의 실행 지침을 보관합니다.
  <id>/hooks/ tests/ evals/   산출 검사와 평가 자료를 보관합니다.

workflows/                    change, bugfix, review 순서를 정의합니다.
  gates/                      레이어 사이의 이관 조건을 검사합니다.

profiles/                     도메인별 도구와 규칙을 주입합니다.
  frontend/                   프론트엔드 기본 프로파일을 제공합니다.

packages/                     스키마, 어휘, 정책 계약, 조정자를 제공합니다.
policies/                     권한과 데이터 처리 정책을 정의합니다.
tooling/                      선언 검증기와 플랫폼 생성기를 제공합니다.
docs/                         운영 문서, 결정 기록, 이관 문서를 보관합니다.

.claude/ .codex/              소스에서 생성한 플랫폼별 산출물입니다.
  .claude/commands/           수동 실행 대상의 슬래시 커맨드입니다.
```

## 설계 원칙

### 레이어가 작업 경계를 소유합니다

각 Capability는 agent, skill, hook, test, eval을 하나의 수직 슬라이스로 소유합니다.
예를 들어 테스트 설계를 변경할 때는 `capabilities/test-design/`에서 관련 계약과 역할을
함께 확인합니다.

### 하네스는 연결만 담당합니다

레이어는 단독으로 실행할 수 있어야 합니다. 하네스는 레이어를 바인딩하고, 이관 조건을
검증하고, 다음 단계에 증거를 전달합니다. 레이어의 실제 작업을 하네스에 구현하지 않습니다.
자세한 결정은 [ADR-0003](docs/adr/0003-layer-harness-boundary.md)에서 확인할 수 있습니다.

### 워크플로만 순서를 정의합니다

Capability는 자신의 입력과 출력만 압니다. 다음에 어떤 레이어가 실행되는지는
`workflows/`가 정의합니다. 도메인 프로파일은 필요한 단계를 추가할 수 있지만 별도의 실행
순서를 만들지 않습니다.

### 프로파일은 도메인 지식을 주입합니다

Capability는 프레임워크나 테스트 라이브러리를 직접 선택하지 않습니다.
`profiles/frontend/profile.yaml`이 React 계열 규칙, 테스트 도구, 역할 로스터를
주입합니다. 소비 저장소는 `.agent-harness/profile.yaml`에서 실행 명령과 파일 패턴을
대체할 수 있습니다.

## 테스트 계층

| 계층 | 검증 대상 | 프론트엔드 기본 도구 | 생략 조건 |
|---|---|---|---|
| Unit | DOM에 의존하지 않는 순수 함수의 입출력을 검증합니다. | Vitest를 사용합니다. | 동작 변경에서는 생략하지 않습니다. |
| UI | 실제 컴포넌트의 렌더링과 상호작용을 검증합니다. | Vitest, React Testing Library, user-event를 사용합니다. | UI가 없다는 구체적인 테스트 계획이 있어야 합니다. |
| Integration | 여러 모듈과 네트워크 경계의 연결을 검증합니다. | Vitest, React Testing Library, MSW를 사용합니다. | 구체적인 사유와 승인이 있어야 합니다. |
| E2E | 브라우저에서 사용자의 핵심 여정을 검증합니다. | Playwright를 사용합니다. | 구체적인 사유와 승인이 있어야 합니다. |

새 UI는 Unit Green 이후에 import 가능한 무동작 scaffold를 먼저 만듭니다. UI 테스트는
scaffold를 정상적으로 불러온 뒤 렌더링이나 상호작용 단언으로 실패해야 합니다. import,
컴파일, 러너 설정 오류는 올바른 red로 인정하지 않습니다.

계층별 결정의 배경은 [ADR-0004](docs/adr/0004-layered-red-green.md)에서 확인할 수 있습니다.

## 증거와 완료 판정

Capability는 `requires`로 입력을 선언하고 `produces`로 출력을 선언합니다. 실행 결과는
증거의 `kind`, `status`, `summary`, `artifact`, `producedBy`로 기록합니다.

```yaml
kind: test.unit.result
status: failed
summary: "3 failed, 12 passed"
artifact: .harness/runs/{runId}/unit.json
producedBy: test-execution#unit
```

다음 규칙을 공통으로 적용합니다.

- 완료 여부는 선언된 증거로 판정합니다.
- `test.<layer>.completed`는 실행 사실만 나타냅니다.
- 통과와 실패는 `test.<layer>.result`의 상태로 판정합니다.
- 구현 착수 여부는 `test.<layer>.red-proof`로 판정합니다.
- 테스트 생략 여부는 사유와 필요한 승인 기록으로 판정합니다.

통제 어휘는 [docs/vocabulary.md](docs/vocabulary.md)에서 확인할 수 있습니다.

## 저장소를 사용하는 방법

### 하네스를 유지보수할 때

소스 파일을 수정한 뒤 다음 명령을 실행합니다.

```sh
npm run validate
npm run generate
npm run check
```

수동 실행 대상은 `.claude/commands/`에 슬래시 커맨드로도 나옵니다. 하네스 구조를 몰라도
`/git-commit`처럼 바로 부를 수 있습니다. 목록은 계약에서 유도하므로 따로 관리하지
않습니다 — `chaining.autoTriggerable: false`인 변형과 워크플로에 삽입되지 않은 프로파일
역할이 대상입니다.

`npm run validate`는 manifest와 워크플로 계약을 검사합니다. `npm run generate`는 플랫폼별
산출물을 다시 만듭니다. `npm run check`는 계약 테스트와 생성물 드리프트까지 검사합니다.

`.claude/`, `.codex/`는 직접 수정하지 않습니다. 이 디렉터리는
Capability와 프로파일 소스에서 생성합니다.

### 소비 저장소에 연결할 때

소비 저장소는 `.agent-harness/profile.yaml`에 테스트 명령, 파일 패턴, 컨벤션, 권한을
선언합니다. 전체 설정 방법은 [소비 저장소 프로파일 안내서](docs/consumer-profile.md)와
[예제 프로파일](examples/consumer-repo/.agent-harness/profile.yaml)에서 확인할 수 있습니다.

## 관련 문서

| 문서 | 사용하는 시점 |
|---|---|
| [작업 흐름 안내서](docs/walkthrough.md) | 요구사항부터 리뷰까지 전체 실행 예시가 필요할 때 사용합니다. |
| [운영 안내서](docs/operations.md) | 게이트 조건과 실패 시 되돌릴 위치를 확인할 때 사용합니다. |
| [통제 어휘](docs/vocabulary.md) | 신호, 아티팩트, 증거 이름을 확인할 때 사용합니다. |
| [프로파일 안내서](profiles/README.md) | 도메인 바인딩 구조를 변경할 때 사용합니다. |
| [정책 안내서](policies/README.md) | 권한과 데이터 처리 정책을 확인할 때 사용합니다. |
| [도구 안내서](tooling/README.md) | 검증기와 생성기의 검사 범위를 확인할 때 사용합니다. |

## 결정 기록

| ADR | 결정 내용 |
|---|---|
| [ADR-0001](docs/adr/0001-capability-structure.md) | Capability 중심 구조와 단계적 런타임화를 결정합니다. |
| [ADR-0002](docs/adr/0002-runtime-promotion.md) | 실행 코드로 승격할 조건을 결정합니다. |
| [ADR-0003](docs/adr/0003-layer-harness-boundary.md) | 레이어와 하네스의 책임 경계를 결정합니다. |
| [ADR-0004](docs/adr/0004-layered-red-green.md) | 계층별 red-green 순서와 생략 규칙을 결정합니다. |
| [ADR-0005](docs/adr/0005-documentation-capability.md) | 문서화를 독립 Capability로 분리하고 강제 수단을 결정합니다. |
| [ADR-0006](docs/adr/0006-drop-cursor-mirror.md) | cursor 미러를 생성 대상에서 제외합니다. |
| [ADR-0007](docs/adr/0007-accessibility-readonly.md) | 마지막 green 뒤의 역할이 코드를 고치지 않도록 결정합니다. |
| [ADR-0008](docs/adr/0008-vendoring-third-party-skills.md) | 3자 스킬을 원본과 바이트 일치로 벤더링하도록 결정합니다. |
| [ADR-0009](docs/adr/0009-skill-pack-selection.md) | 규칙 팩 선택을 실행 에이전트에 맡기도록 결정합니다. |
| [ADR-0010](docs/adr/0010-project-design-roles.md) | 프로젝트 상수를 수동 실행 역할 셋이 정하도록 결정합니다. |

구조 이관 내역은 [docs/migration/inventory.md](docs/migration/inventory.md)에서 확인할 수 있습니다.
