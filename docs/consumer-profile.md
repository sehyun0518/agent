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
| `commands` | 실행 명령. Capability variant의 `commandKey`가 여기를 찾는다 |
| `conventions` | 컨벤션 문서 **경로**. 내용을 인라인하지 않는다 |
| `knowledge` | 저장소 상수 문서 참조 |
| `permissions` | 권한 **축소** |
| `git` | 커밋 컨벤션, 자동 출처 문구 정책, PR 템플릿 |
| `telemetry` | 코어 이벤트 → 저장소 이벤트 이름 매핑 |
| `fixtures` · `evals` | 저장소 전용 픽스처와 평가 케이스 |
| `agents` · `skills` · `bindings` | 저장소 전용 역할·스킬과 그 주입 |

## 명령이 왜 여기 있나

`test-execution`의 각 변형은 `commandKey`만 갖는다.

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
