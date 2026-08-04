# 마이그레이션 인벤토리

> **이관 완료.** 이 문서는 이제 계획서가 아니라 **기록**이다. 왼쪽 열의 루트 `agents/`·
> `skills/`는 존재하지 않는다. 현재 구조는 `README.md`를 본다.
>
> 완료 확인: 역할 9 + 스킬 11 전량 이동(누락 0), 규칙 팩 71/37 보존,
> 미러 3종 생성 왕복 바이트 동일.

ADR-0001의 결정을 조사 시점 자산에 적용한 귀속 매핑이다. **여기 없는 파일은 이관되지 않았다.**

조사 기준 커밋: `b6b29fb` · 전체 405개 파일 (전부 `.md`/`.mdc`)

## 1. 역할 (루트 `agents/*.md` 9개)

| 파일 | 목적지 | 종류 | 비고 |
|---|---|---|---|
| `agents/discussion.md` | `capabilities/requirements/agents/discussion.md` | Capability | 도구 없음·레포 조사 금지 권한 유지 |
| `agents/spec.md` | `capabilities/specification/agents/spec.md` | Capability | 쓰기 권한. 프론트엔드 스킬 4종은 profile이 바인딩 |
| `agents/tester.md` | `capabilities/test-design/agents/tester.md` | Capability | 테스트 **작성**만. 실행은 `test-execution` |
| `agents/implementation.md` | `capabilities/implementation/agents/implementation.md` | Capability | React/RN 규칙 팩 선택은 profile이 주입 |
| `agents/review.md` | `capabilities/review/agents/review.md` | Capability | 하네스 직접 실행 → `test-execution` 증거 소비로 변경 (§5 참조) |
| `agents/orchestration.md` §0~8 | `packages/orchestrator/orchestrator.md` | 비-Capability | 도메인 무지 본체 |
| `agents/orchestration.md` §9 | `profiles/frontend/profile.yaml` | 프로파일 | 로스터·DAG·라우팅. **핵심 분리** |
| `agents/design.md` | `profiles/frontend/agents/design.md` | 프로파일 | 프론트엔드 전용 |
| `agents/accessibility.md` | `profiles/frontend/agents/accessibility.md` | 프로파일 | 프론트엔드 전용 |
| `agents/state-data.md` | `profiles/frontend/agents/state-data.md` | 프로파일 | 프론트엔드 전용 |

`agents/orchestration.md` 한 파일이 두 목적지로 쪼개지는 유일한 항목이다. §9.7
검증 하네스 목록은 아래 §3의 `test-execution` 재료로도 쓰인다.

## 2. 스킬 (루트 `skills/` 11개)

| 파일/디렉터리 | 목적지 | 현재 바인딩 |
|---|---|---|
| `skills/requirements-spec.md` | `packages/boundary-contracts/requirements-spec/` | discussion, orchestration |
| `skills/architecture-avoid-boolean-props.md` | `profiles/frontend/skills/` | spec |
| `skills/architecture-compound-components.md` | `profiles/frontend/skills/` | spec |
| `skills/patterns-children-render-props.md` | `profiles/frontend/skills/` | spec |
| `skills/patterns-explicit-variants.md` | `profiles/frontend/skills/` | spec |
| `skills/react19-no-forwardref.md` | `profiles/frontend/skills/` | **없음** (자동 발견에 의존) |
| `skills/state-lift-state.md` | `profiles/frontend/skills/` | state-data |
| `skills/state-context-interface.md` | `profiles/frontend/skills/` | state-data |
| `skills/state-decouple-implementation.md` | `profiles/frontend/skills/` | state-data |
| `skills/react-best-practice/` (규칙 71개) | `profiles/frontend/skills/react-best-practice/` | implementation |
| `skills/react-native-skills/` (규칙 37개) | `profiles/frontend/skills/react-native-skills/` | implementation |

> 규칙 파일 실측: `react-best-practice/rules` **71개**, `react-native-skills/rules`
> **37개** (`_sections.md` 포함). 계획서 초안의 68/31은 부정확했다. 이관 전후 이 수가
> 보존되는지가 검증 항목이다.

> 최초 이관에서는 `capabilities/requirements/skills/`에 뒀다가, ADR-0003에서
> **경계 계약은 한 레이어가 소유할 수 없다**는 이유로 `packages/boundary-contracts/`로
> 다시 옮겼다. 참조 형식도 `requirements/requirements-spec` → `contracts/requirements-spec`.

### 교차 참조 규칙

`requirements-spec`은 경계마다 검사되는 불변식이라 `requirements` 하나가 독점하지
않는다. `packages/orchestrator`(인테이크 게이트)와 `capabilities/review`(수용 기준
검증)가 같은 스킬을 참조한다. 따라서 manifest 스키마는 **정규화된 교차 참조**를
지원해야 한다:

```yaml
entrypoints:
  skills:
    - contracts/requirements-spec        # 하네스 소유 경계 계약
    - frontend:react-best-practice       # <profile>:<skill>
```

최종적으로 `<capability>/<skill>` 형식의 레이어 간 교차 참조는 **0건**이 됐다.
경계 계약은 하네스가 소유하고, 나머지는 프로파일이 바인딩한다.

### 프로파일 바인딩

도메인 스킬은 Capability 안으로 들어가지 않고 프로파일이 Capability에 **바인딩**한다.

| Capability | 프로파일이 주입하는 것 |
|---|---|
| `specification` | architecture-*, patterns-* 4종 |
| `implementation` | react-best-practice 또는 react-native-skills (타깃 판별 후 택일, 혼용 금지) |
| `test-design` | playwright MCP, test-id 규약 |

`state-lift-state`·`state-context-interface`·`state-decouple-implementation`은
프로파일 전용 에이전트 `state-data`에만 붙으므로 Capability 바인딩이 없다.

## 3. 신규 자산 (기존 파일 없음)

| Capability | 재료 | 새로 써야 할 것 |
|---|---|---|
| `test-execution` | `agents/orchestration.md` §9.7 검증 하네스 목록, `AGENT.md` 컨벤션 절 | `capability.yaml`(variants 3종), 명령 해석·결과 파싱·증거 생성 규약. 명령 자체는 저장소 profile이 제공 |
| `git-operations` | 없음 | 5개 독립 커맨드(`commit`·`push`·`pr-preview`·`pr-create`·`pr-update`), 자동 연쇄 금지 훅, 자동 출처 문구 삽입 금지 |
| `packages/telemetry-contracts` | 없음 | `Agent Run → Capability → Skill → Tool → Hook → Evidence` 이벤트 계약 |
| `packages/policy-contracts` | 없음 | 정책 스키마 + 우선순위(공통 보안 → 저장소 profile → Capability 기본) |
| `packages/manifest-contracts` | 없음 | capability / profile / workflow JSON Schema |
| `workflows/` | `README.md` 실행 플로우 절 | `change.yaml`·`bugfix.yaml`·`review.yaml` |

## 4. 지식 · 문서

| 파일 | 처리 |
|---|---|
| `AGENT.md` | Phase 6에서 재작성. 프로젝트 상수 진입점 역할 유지 |
| `DESIGN.md` | 위치는 Phase 6 논의 항목(루트 유지 vs `profiles/frontend/knowledge/`) |
| `README.md` | Phase 6 전면 재작성. 수동 미러 동기화 절차 제거 |
| `AGENTS.md` | Phase 6 갱신. Codex 진입점 유지 |

## 5. 이관에 따른 동작 변경

구조 이동만으로 끝나지 않고 **행동이 바뀌는** 지점이다. Phase 3~4에서 각 문서 본문을
고쳐야 한다.

1. **`review`가 테스트를 직접 실행하지 않는다.** 현재 `review`는 전체 검증 하네스를
   돌려 PASS/FAIL을 판정한다. 새 구조에서는 `test-execution`이 실행하고 증거를 만들며,
   `review`는 그 증거를 소비해 계약 대조로 판정한다. 상태가 아니라 증거로 전이한다는
   원칙의 구체형이다.
2. **`orchestration`이 명명 에이전트를 모른다.** §9의 `subagent_type` 표가 사라지고
   `profiles/frontend/profile.yaml`만 남는다. 본체에 `spec`·`design` 같은 이름이 0건이어야 한다.
3. **구현 착수에 red 증거가 선행한다.** 구 구조는 구현과 테스트가 2단계 병렬이었다.
   새 워크플로는 `test.red-confirmed` 증거 없이는 구현을 시작하지 않는다. 이 때문에
   테스트 작성 분담도 바뀌었다 — 인수 기준을 검증하는 테스트는 전부 `test-design`이
   쓰고, 구현자는 쓰지 않고 돌리기만 한다.
4. **Git 작업이 연쇄하지 않는다.** 현재 `spec`/`design` 게이트가 "커밋해 고정"을
   지시한다. 새 구조에서는 커밋이 `git-operations/commit`의 독립 호출이며, 다른
   Capability가 이를 자동 호출할 수 없다.
5. **스킬이 자동 발견에 기대지 않는다.** `react19-no-forwardref`처럼 바인딩 없이
   자동 발견에 의존하던 스킬은 프로파일에 명시적으로 바인딩된다.
6. **`discussion`의 도구 제한이 실제로는 걸려 있지 않았다.** 이관 중 발견한 기존 결함이다.
   `agents/discussion.md`는 `tools:`를 빈 스칼라로 두어 "도구 없음"을 의도했지만,
   플랫폼은 빈 스칼라를 **모든 도구 허용**으로 해석한다(세션 로스터에 `(Tools: All tools)`로
   표시됨). 즉 "레포·파일을 조사하지 않는다"는 §1 규칙이 프롬프트로만 강제되고 있었다.
   생성기는 빈 목록을 `tools: []`로 내보내고, manifest는 `permissions.filesystem: none`을
   선언해 검증기가 도구 확대를 잡을 수 있게 한다. 다만 `tools: []`가 플랫폼에서 실제로
   "도구 없음"으로 해석되는지는 아직 확인되지 않았다 — Phase 5에서 확인 후 필요하면
   차단 훅으로 보강한다.

## 6. 미러 (생성 산출물로 전환)

| 경로 | 현재 | 전환 후 |
|---|---|---|
| `.claude/agents/*.md` (9) | 전문 복제, 수동 | `capabilities`+`profiles`에서 생성 |
| `.claude/skills/*/SKILL.md` (11) | 복제, 수동 | 생성 |
| `.cursor/agents/*.md` (9) | 얇은 래퍼, 수동 | 생성 |
| `.cursor/rules/*.mdc` (3) | 수동 | 생성 (`00-pipeline`은 워크플로에서 유도) |
| `.cursor/README.md` | 수동 | 생성 |
| `.codex/agents/*.md` (9) + `README.md` | 얇은 래퍼, 수동 | 생성 |
| `.codex/skills/*/SKILL.md` (11) + `README.md` | 복제, 수동 | 생성 |
| `.codex/AGENTS.md` | 수동 | 생성 |

전환 후 이 경로들은 **직접 편집 금지**다. CI가 재생성 결과와 커밋 상태의 diff를 검사한다.

## 7. 커버리지 확인

- 루트 역할 9개 → Capability 5개 + 프로파일 3개 + 오케스트레이터 1개 = **9** ✅
- 루트 스킬 11개 → Capability 1개 + 프로파일 10개 = **11** ✅
- 신규 Capability 2개(`test-execution`·`git-operations`)는 기존 자산 없음으로 명시 ✅
- 비-Capability 패키지 4개는 전부 신규 작성 ✅
