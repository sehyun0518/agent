# telemetry-contracts

공급자 독립 실행 관측 계약. **Capability 구현이 특정 관측 SDK를 직접 호출하지 않게** 하는 것이 목적이다.

## 계층

```text
Agent Run
  └─ Capability (variant)
       └─ Skill
            └─ Tool
                 └─ Hook
                      └─ Evidence
```

`event.schema.json`의 각 이벤트는 `runId`·`parentId`·`spanId`로 이 계층을 재구성한다.

`run.started`·`run.completed`가 여는 것은 **흐름**이지 세션이 아니다. 한 실행이 여러
세션에 걸쳐도 `runId`는 하나다(ADR-0022). 세션은 이 계약에 없다 — 모델이 도는 자리는
플랫폼 사실이고, 하네스의 기록이 그것을 몰라야 세션을 넘는 기억이 성립한다.

## 비용과 재시도

`attempt`·`model`·`tokens`가 선언 필드다. **재시도로 통과한 것과 한 번에 통과한 것은
다른 사건**인데 `attempt` 없이는 구분되지 않는다 — 궤적이 사라진다.

`cost`는 없다. **단가는 바뀌고 기록된 비용은 그때의 단가를 주장하게 된다.** `model`과
`tokens`로 필요할 때 계산한다 (ADR-0023).

성공률·재시도율 같은 **집계는 이 계약에 없다.** 증거는 실행 하나의 사실이고 지표는 여러
실행의 집계라 층이 다르다. 이 계약의 책임은 집계 가능한 사실을 내보내는 데까지다.

## 이벤트

| 이벤트 | 언제 |
|---|---|
| `run.started` · `run.completed` | 실행 인스턴스 하나의 시작·끝 |
| `capability.started` · `capability.completed` | Capability(변형 포함) 실행 |
| `skill.invoked` | 스킬이 컨텍스트에 로드됨 |
| `tool.invoked` | 도구 호출 |
| `hook.fired` | 훅 실행 |
| `evidence.recorded` | 증거 레코드 기록 |
| `policy.evaluated` | 정책 판정 |
| `failure.classified` | 실패가 4분류 중 하나로 판정됨 |

## Adapter 경계

Sentry·Google Analytics 등 실제 관측 시스템은 **별도 Adapter**가 이 이벤트를 받아 자기
포맷으로 변환한다. 이 패키지는 Adapter를 포함하지 않는다.

```text
Capability ──emit──▶ telemetry event (이 계약)
                          │
                          ├─▶ Sentry adapter      (후속)
                          ├─▶ GA adapter          (후속)
                          └─▶ 파일 로그 adapter    (후속)
```

프로파일의 `telemetry` 맵이 코어 이벤트 이름을 저장소별 이벤트 이름으로 옮긴다.
Capability 코드는 그 매핑을 알지 못한다.

## 담지 않는 것

`attributes`에 비밀정보나 민감 데이터를 넣지 않는다. `policies/data-handling`의
불변 정책이 강제하며, 위반은 `level: immutable`이라 어떤 프로파일도 완화할 수 없다.
