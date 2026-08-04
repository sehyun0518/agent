# ADR-0003 — 레이어와 하네스의 경계

- 상태: 채택
- 날짜: 2026-08-04
- 선행: [ADR-0001](./0001-capability-structure.md)

## 원칙

> 개별 레이어는 레이어로서도 충분히 잘 동작할 수 있도록 지원하되, 하네스는 이 레이어를
> 묶고 게이트를 통해 검증하여 다른 레이어로 이관할 수 있도록 돕는 형태로**만** 존재한다.

두 문장으로 나누면 이렇다.

1. **레이어는 혼자서도 쓸 수 있어야 한다.** 자기 `requires`만 주면 동작한다.
2. **하네스는 일하지 않는다.** 묶고(bind) · 검증하고(gate) · 넘긴다(handoff). 그뿐이다.

## 배경

ADR-0001로 Capability 구조를 만든 직후 감사해 보니 네 군데가 이 원칙과 어긋났다.

| 위반 | 규모 |
|---|---|
| 레이어 본문이 이웃 레이어 이름을 앎 | 14곳 |
| 이관 게이트 훅이 레이어 안에 있음 | 2개 |
| 경계 계약 스킬이 한 레이어 소유물 | 1개 |
| 조정자가 판단 작업을 함 | 판단 보류 |

이후 전수 감사에서 네 건이 더 나왔다. 셋은 계약 누락이고 하나는 위 D5다.

| 결함 | 내용 |
|---|---|
| `test.red-proof` 위치 | Capability 루트에 있어 모든 변형에 강요됐고, 워크플로의 `expect`와도 어긋났다 |
| `test-execution.requires` | `test-design.completed`(신호)만 받고 `test-design.suite`(실행할 파일)를 안 받았다 |
| `review.requires` | 본문은 `git diff`를 본다는데 `implementation.patch`가 계약에 없었다 |
| 순서 정의 이중화 | 워크플로와 프로파일 `dag` → D5 |

특히 첫 번째는 ADR-0001 이관 과정에서 **새로 생긴** 결함이다. 도메인 이름
("구현 에이전트")을 지우면서 이웃 이름("`implementation` Capability")을 심었다.
도메인 결합은 끊었지만 레이어 간 결합을 만든 것이다.

## 결정

### D1. 훅은 두 종류이고 소유자가 다르다

| 종류 | 검사 대상 | 소유 |
|---|---|---|
| **자기 산출 검사** (exit) | 내 결과가 쓸 만한가 | 레이어 |
| **이관 게이트** (entry) | 앞 레이어가 넘긴 게 조건을 만족하나 | **하네스** |

이관 게이트가 레이어 안에 있으면 그 레이어는 단독으로 쓸 수 없다. 구현 하나만 시키려
해도 앞 단계의 증거를 요구하며 막힌다.

이관 게이트는 `workflows/gates/`에 두고 워크플로 step의 `gate:` 필드가 연결한다.
**그 파일을 지우면 레이어는 그대로 단독 동작한다** — 이것이 올바르게 놓였는지 판별하는
시험이다.

현재 배치:

```text
workflows/gates/                     ← 하네스
  require-red-evidence.md              구현 착수 전 red 증거 검사
  require-test-evidence.md             판정 전 테스트 증거 검사

capabilities/requirements/hooks/     ← 레이어 (자기 산출 검사)
  completeness-gate.md
capabilities/specification/hooks/
  contract-freeze.md
capabilities/git-operations/hooks/   ← 레이어 (자기 제약)
  no-auto-chaining.md
  no-auto-attribution.md
```

`git-operations`의 훅 둘은 이관 게이트가 아니라 **자기 제약**이다(자기가 다른 명령을
실행하지 않게, 자기 출력에 출처 문구를 넣지 않게). 그래서 레이어가 소유한다.

### D2. 레이어는 토큰으로만 말한다

레이어 본문에 이웃 레이어 이름을 쓰지 않는다.

```diff
- 테스트를 실행하지 않습니다 — `test-execution` Capability의 몫입니다.
+ 테스트를 실행하지 않습니다. `test.red-proof` 증거는 이 층이 만드는 것이 아닙니다.

- `rejected`면 `test-design`으로 되돌린다.
+ `rejected`면 되돌린다. 어디로 보낼지는 하네스의 routing이 정한다.
```

**누가 그 토큰을 만드는지, 실패하면 어디로 보내는지는 하네스가 안다.** 워크플로의
`dependsOn`과 프로파일의 `routing`이 그 지식을 소유한다.

검증기가 이걸 강제한다 — Capability 본문에 다른 Capability id가 등장하면 실패다.
오케스트레이터에 `forbiddenReferences`를 건 것과 같은 방식이다.

### D3. 경계 계약은 하네스가 소유한다

`requirements-spec`은 스킬 본문 스스로 "경계마다 검사되는 불변식"이라고 말한다.
경계에서 검사되는 것이 한 레이어의 소유물이면, 다른 레이어가 그걸 쓰기 위해 이웃을
참조하게 된다.

`packages/boundary-contracts/`로 옮기고 `contracts/<name>`으로 참조한다.
이로써 **Capability 간 교차 참조가 0**이 됐다.

### D4. 조정자의 분할·브리프 생성은 이관 준비로 본다

오케스트레이터의 `[2] 작업 단위 분할`·`[4] 브리프 생성`은 판단이 들어가므로 "일하지
않는다"에 어긋나 보인다. 하지만 워크플로가 단계를 이미 선언하고 있고, 조정자가 하는 것은
**한 단계 안에서 N개로 팬아웃하고 각자에게 넘길 것을 추리는 일**이다. 이관 준비로 보고
유지한다.

이 판단은 재검토 대상이다. 분할 로직이 도메인 지식을 요구하기 시작하면 별도 레이어
(`planning` Capability)로 분리한다.

### D5. 순서는 워크플로만 소유한다

프로파일이 `dag`로 자기 실행 순서를 갖고 있었다. 워크플로에도 순서가 있으므로
**경쟁하는 정의가 둘**이었고, 어느 쪽을 따르는지 정해져 있지 않았다.

| 따르는 쪽 | 결과 |
|---|---|
| 워크플로 | 도메인 역할(`design`·`state-data`·`accessibility`)이 영영 안 돈다 |
| 프로파일 DAG | 워크플로의 `gate`·`expect`가 통째로 우회된다 |

`dag`를 없애고 `workflowExtensions`로 바꿨다. 프로파일은 **도메인 단계를 어디에
끼울지만** 선언하고, 순서 자체는 워크플로가 소유한다. 이렇게 해야 삽입된 도메인
단계도 워크플로의 게이트를 그대로 받는다.

```yaml
workflowExtensions:
  - workflow: "*"
    insert:
      - id: design
        runner: design
        mode: parallel-with
        anchorCapability: specification
```

**step id가 아니라 Capability로 앵커한다.** 워크플로마다 step 이름이 다르기 때문이다
(`change`는 `implementation`, `bugfix`는 `fix`). 대상 워크플로에 그 Capability가
없으면 삽입은 건너뛰어진다 — 그 흐름에 해당 단계가 없다는 뜻이므로 정상이다.
어떤 대상에도 없으면 오타이므로 검증기가 실패시킨다.

## 판별 시험

새로 무언가를 추가할 때 어디에 둘지 헷갈리면 이렇게 묻는다.

> **이걸 지우면 레이어가 여전히 단독으로 동작하는가?**

| 답 | 위치 |
|---|---|
| 예 (지워도 레이어는 돎) | 하네스 — `workflows/` · `packages/` · `policies/` |
| 아니오 (레이어의 일부) | 레이어 — `capabilities/<id>/` |

두 번째 시험도 있다.

> **레이어 본문에 다른 레이어 이름을 쓰고 싶은가?**

그렇다면 그 지식은 하네스 것이다. 토큰으로 바꾸고 이름은 워크플로·routing에 맡긴다.

## 결과

**좋아지는 것**

- Capability 하나를 떼어 다른 곳에서 쓸 수 있다. `requires`만 주면 된다.
- 레이어를 추가·제거해도 다른 레이어 본문이 바뀌지 않는다.
- 이관 규칙을 바꿀 때 `workflows/`만 고친다.

**감수하는 것**

- 본문이 덜 친절하다. "`review`가 판정한다" 대신 "`review.verdict`는 이 층의 산출이
  아니다"라고 쓴다. 읽는 쪽이 워크플로를 한 번 더 봐야 한다.
- 이관 게이트가 레이어에서 떨어져 있어 한 곳만 봐서는 전체 조건을 알 수 없다.

두 번째는 의도한 대가다. 한 곳에서 다 보이게 하려면 레이어가 이웃을 알아야 하고,
그러면 단독으로 쓸 수 없다.

## 검증

```sh
npm run validate
```

- 레이어 본문의 이웃 참조 → 실패
- 없는 게이트 파일 참조 → 실패
- Capability 간 교차 스킬 참조 → `contracts/`가 아니면 해석 실패
