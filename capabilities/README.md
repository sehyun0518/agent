# capabilities/

작업 유형 하나가 자신의 실행 자산을 전부 소유하는 수직 슬라이스. 구성요소 종류가 아니라
**작업**이 디렉터리 경계다.

## 레이아웃

```text
capabilities/<id>/
├─ capability.yaml     계약 — 입력·출력·선행조건·권한·증거·완료조건·진입점·실패정책
├─ agents/             역할 본문 (frontmatter 없음)
├─ skills/<name>/SKILL.md
├─ tools/              이 작업 전용 도구
├─ hooks/              **자기 산출 검사만** (이관 게이트는 workflows/gates/)
├─ tests/              결정론적 케이스 — 훅과 계약이 지켜지는지
└─ evals/              품질 평가 케이스 — 에이전트 행동이 기준을 만족하는지
```

빈 디렉터리는 만들지 않는다. 그 작업에 훅이 없으면 `hooks/`도 없다.

## 메타데이터는 manifest가 소유한다

`agents/*.md`에는 frontmatter가 없다. 도구·모델 티어·격리·설명은 전부
`capability.yaml`의 `entrypoints.agents`에 있고, 생성기가 플랫폼 형식으로 옮긴다.

같은 사실을 두 곳에 적지 않기 때문에 드리프트가 생길 자리가 없고, 검증기가
"이 도구가 선언된 권한을 넘는가"를 검사할 수 있다. 소스 md에 frontmatter가 남아 있으면
생성기가 오류로 잡는다.

## 이웃 레이어를 알지 않는다

레이어는 `requires`/`produces` 토큰으로만 말한다. 본문에 다른 Capability id를 쓰면
검증기가 실패시킨다 — 이웃을 아는 레이어는 단독으로 쓸 수 없기 때문이다.

이관 게이트(앞 레이어의 증거를 검사하는 것)도 여기 두지 않는다. `workflows/gates/`가
소유하고 워크플로 step의 `gate:`가 연결한다. 여기 `hooks/`에는 **자기 산출 검사**만 둔다.

경계 계약(`requirements-spec` 같은)도 특정 레이어 소유가 아니다.
`packages/boundary-contracts/`에 두고 `contracts/<name>`으로 참조한다.
그래서 **Capability 간 교차 참조가 0**이다. (ADR-0003)

## 도메인 지식을 넣지 않는다

Capability는 도메인 무관이다. 프론트엔드 컴포넌트 API 패턴, React 규칙 팩, 디자인 토큰
같은 것은 `profiles/`가 소유하고 `bindings`로 주입한다. Capability 안에 도메인 지식을
두면 프로파일을 교체해도 그 도메인이 따라온다.

## 실행 인스턴스를 만들지 않는다

`capabilities/`는 **작업 종류**만 담는다. 특정 요청·이슈·실행 건마다 디렉터리나 패키지를
만들지 않는다. 실행 기록은 증거(`.harness/runs/{runId}/`)로 남는다.

## 새 Capability 추가

1. `capabilities/<id>/capability.yaml`을 쓴다. `id`는 디렉터리명과 같아야 한다.
2. `requires`/`produces`에 쓸 토큰이 `docs/vocabulary.md`에 있는지 본다. 없고 코어에
   필요하면 어휘를 먼저 추가한다. 도메인 전용이면 프로파일 네임스페이스로 간다.
3. 증거를 정한다. **증거 없이 완료되는 Capability는 만들지 않는다** — 다음 단계가
   상태가 아니라 증거로 전이하기 때문이다.
4. `npm run validate`로 검증하고 `npm run generate`로 미러를 만든다.

중앙 registry나 오케스트레이터를 고칠 필요는 없다. 그게 이 구조의 목적이다.

## 현재 슬라이스

| id | 상태 | 비고 |
|---|---|---|
| `requirements` | 완료 | 발화 → 요구사항 스펙. 도구 없음 |
| `specification` | 완료 | 스펙 → 고정된 계약 |
| `test-design` | 완료 | 테스트 **작성**만. 실행·판정은 하지 않는다 |
| `test-execution` | 완료 | 공유 에이전트 1개 + `unit`·`integration`·`e2e` 변형 |
| `implementation` | 완료 | `test.red-confirmed` 없이는 착수 불가 |
| `review` | 완료 | 테스트를 돌리지 않고 증거를 소비한다 |
| `git-operations` | 완료 | 6개 독립 변형. 나가는 호출·들어오는 자동 진행 둘 다 차단 |

## 흐름

```text
requirements ──requirements.spec──▶ specification ──specification.contract──▶ test-design
                                                                                   │
                                                              test-design.completed │
                                                                                   ▼
                                        implementation ◀──test.red-confirmed── test-execution#unit
                                              │
                             implementation.completed
                                              ▼
                                      test-execution (unit·integration·e2e)
                                              │
                                       증거 (result·skip)
                                              ▼
                                           review
```

`git-operations`는 이 흐름에 자동으로 붙지 않는다. 커밋·푸시·PR은 각각 사람이 명시적으로
부르는 독립 호출이다.
