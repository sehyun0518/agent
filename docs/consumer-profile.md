# 소비 저장소 profile 계약

하네스를 쓰는 저장소가 자기 것을 소유하는 방법. 공용 하네스에는 특정 저장소의 명령·
경로·컨벤션이 들어가지 않는다.

동작하는 예시: `examples/consumer-repo/.agent-harness/profile.yaml`
(검증기가 이 파일도 검사한다 — 스키마가 실제 소비 설정을 표현할 수 있는지 확인하려고.)

## 위치

```text
consumer-repository/
└─ .agent-harness/
   ├─ profile.yaml
   ├─ conventions/
   ├─ fixtures/
   └─ evals/
```

**하네스 안에 중첩하지 않는다.** 위 그림이 그리는 것은 소비 저장소가 하네스 설정을
담는 것이지 그 반대가 아니다. 중첩하면 그 디렉터리가 하네스 쪽에서 untracked가 되고,
`isolation: worktree`를 선언한 역할의 worktree에 아예 존재하지 않게 된다 — 격리가
아무것도 격리하지 못한다(ADR-0020). 검증기가 막는다.

배포 방식이 정해지기 전까지 두 저장소를 어떻게 두든(나란히·별도 체크아웃) 이 최소선은
같다.

## 최소 형태

```yaml
schemaVersion: 1
id: <저장소 id>
kind: repository        # domain이 아니다
namespace: <토큰 접두사>
```

`kind: repository`는 `workflowExtensions`를 가질 수 없다. 순서는 워크플로가, 도메인
단계의 삽입 지점은 도메인 프로파일이 소유한다.

## 무엇을 제공하는가

| 필드 | 담는 것 |
|---|---|
| `schemaVersion` | 이 문서가 따르는 profile 스키마 판. 하네스 밖에 놓이는 유일한 선언이라 하네스와 따로 움직일 수 있다. 판이 다르면 검증기가 거부한다 (ADR-0027) |
| `commands` | 실행 명령. Capability variant의 `commandKey`가 여기를 찾는다. `preflight`는 어느 변형도 가리키지 않는 규약 키다 |
| `testing.layers` | 계층별 라이브러리·파일 패턴. 같은 계층의 domain 기본값을 전체 대체 |
| `conventions` | 컨벤션 문서 **경로**. 내용을 인라인하지 않는다 |
| `knowledge` | 저장소 상수 문서 참조 |
| `permissions` | 권한 **축소** |
| `git` | 커밋 컨벤션, 자동 출처 문구 정책, PR 템플릿 |
| `telemetry` | 코어 이벤트 → 저장소 이벤트 이름 매핑 |
| `fixtures` · `evals` | 저장소 전용 픽스처와 평가 케이스 |
| `agents` · `skills` · `bindings` | 저장소 전용 역할·스킬과 그 주입 |

## 명령이 왜 여기 있나

`test-execution`의 각 변형은 `commandKey`만 갖는다. 키는 `test.unit`·`test.ui`·
`test.integration`·`test.e2e`로 분리한다.

```yaml
# capabilities/test-execution/capability.yaml
variants:
  unit:
    commandKey: test.unit
```

```yaml
# .agent-harness/profile.yaml
commands:
  test.unit:
    command: pnpm vitest run --reporter=json
```

공용 하네스가 명령 문자열을 담으면 저장소마다 포크해야 한다. 키만 두면 하나의
하네스를 여러 저장소가 공유한다.

키가 없으면 실행자는 명령을 **추측하지 않고** `precondition-unmet`으로 되돌린다.

## 계층별 라이브러리 우선순위

domain 프로파일은 기본 테스트 스택을 제공하고 repository 프로파일은 필요한 계층을
대체할 수 있다. 대체는 계층 내부 merge가 아니다. 예를 들어 repository가 `ui`를
선언하면 domain의 UI `libraries`와 `filePatterns`는 함께 사라지고 repository의 `ui`
객체 전체가 사용된다. 서로 다른 러너·패턴이 섞이는 것을 막기 위해서다.

repository가 계층을 선언하면 같은 이름의 `commands.test.<layer>`도 반드시 선언한다.
필요한 의존성이나 명령이 없으면 자동 설치하지 않는다.
네 계층을 모두 선언한 예시는
[`examples/consumer-repo/.agent-harness/profile.yaml`](../examples/consumer-repo/.agent-harness/profile.yaml)에 있다.

## 권한은 좁힐 수만 있다

```text
filesystem:  none < read < write
network:     none < allowlist < any
destructive: false < true
```

Capability나 불변 정책보다 넓게 선언하면 검증기가 거부한다. `networkAllowlist`는
부분집합이어야 한다.

## 완화할 수 없는 것

`level: immutable` 정책은 저장소 profile이 되돌릴 수 없다.

| 영역 | 항목 |
|---|---|
| data-handling | 비밀정보 제거 · 민감 데이터 저장 제한 · 감사 기록 |
| permissions | 파일 시스템 경계 · 외부 네트워크 접근 제한 · 필수 검증 훅 |
| destructive-actions | 파괴적 작업 승인 |

같은 id로 재선언하거나 `blocking` 훅을 `blocking: false`로 낮추면 검증 실패다.
자세한 건 `packages/policy-contracts/README.md`.

## 확장 토큰

`namespace`를 선언하면 그 아래 토큰을 중앙 등록 없이 만들 수 있다.

```yaml
namespace: acme
# → acme:deploy.staged, acme:contract-test.result ...
```

코어 어휘(`docs/vocabulary.md`)는 작게 유지되고, 저장소별 증거는 각자 네임스페이스에서
늘어난다. 이게 "중앙 registry 비대화"를 막는 장치다.

## 관측 매핑

```yaml
telemetry:
  capability.started: acme.agent.step_start
  evidence.recorded: acme.agent.evidence
```

Capability 구현은 이 매핑을 알지 못하고 코어 이벤트만 낸다. Sentry·GA 같은 실제 시스템은
별도 Adapter가 붙는다 — `packages/telemetry-contracts/README.md`.

## 배포 방식

아직 정하지 않았다(ADR-0001 D9). 이 계약이 안정된 뒤 npm 퍼블리시 / git submodule /
복사 중에서 후속 ADR로 고른다. 지금은 **스키마와 정책 우선순위만 고정**돼 있다.

배포와 별개로 **하네스 안에 중첩하지 않는다**는 최소선은 이미 정해져 있다(ADR-0020).

## 툴체인은 아직 계약에 자리가 없다

command 객체는 `command`·`cwd`·`description`뿐이라 Node 버전 같은 선행조건을 선언할
자리가 없다. 그래서 명령 문자열에 버전 관리자 활성화가 섞여 들어간다.

**그 접두사는 완화이지 보장이 아니다.** 버전 관리자가 없는 기계에서는 조용히 통과하고
호출자의 런타임이 그대로 쓰인다.

### `preflight`로 선언한다

`commands`는 임의 키를 받으므로 스키마를 건드리지 않는다.

```yaml
commands:
  preflight:
    command: node -e "process.exit(process.version.startsWith('v22')?0:1)"
    description: 이 저장소가 요구하는 런타임인지 본다
```

흐름을 시작하기 전에 돌린다. 0이 아니면 `precondition-unmet`이고, 흐름 밖의 결함이므로
사람이 고치고 다시 시작한다.

**무엇을 검사할지는 저장소가 정한다.** 하네스는 Node도 pnpm도 모른다 — 명령을 담지
않는 것과 같은 이유다. **버전을 여기 옮겨 적지 않는다.** `engines`와 `.nvmrc`가 이미
그것을 선언하고 있고, 두 곳에 적으면 한 곳이 낡는다 (ADR-0026).

`preflight`가 있으면 명령 문자열의 버전 관리자 접두사는 필요 없어진다.
