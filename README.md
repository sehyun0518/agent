# Frontend Agent Harness

이 저장소는 프론트엔드 작업을 여러 역할 에이전트로 나누어 처리하기 위한 하네스다.
핵심 설계는 요구사항을 먼저 스펙으로 고정하고, 계약과 디자인을 게이트로 만든 뒤,
구현·상태·테스트를 병렬화하고, 접근성·리뷰로 통합 검증하는 흐름이다.

## 한 줄 요약

```text
discussion -> orchestration -> (spec + design) -> (state-data + implementation + tester) -> accessibility -> review
```

## 단일 출처

이 하네스는 플랫폼별 미러를 두지만, 역할과 규칙의 원본은 한 곳에 둔다.

| 영역 | 단일 출처 | 설명 |
|---|---|---|
| 프로젝트 상수 | `AGENT.md` | 스택, 컨벤션, 검증 하네스, 디자인 문서 링크 |
| 디자인 시스템 | `DESIGN.md` | 토큰, 시각 규칙, 컴포넌트 프리미티브 |
| 역할 정의 | `agents/*.md` | 서브에이전트별 책임·경계·검증 방식 |
| 요구사항 계약 | `skills/requirements-spec.md` | 요구사항 슬롯, 완결성 판정, 스펙 포맷 |
| 웹 React 성능 | `skills/react-best-practice/` | React/Next 규칙 팩 |
| React Native 성능 | `skills/react-native-skills/` | RN/Expo 규칙 팩 |

플랫폼 미러는 원본을 복제하는 장소가 아니라 실행 환경에 맞춘 얇은 포장이다.
충돌이 있으면 루트 원본을 우선한다.

## 레이어 설계

### 1. 지식 레이어

느리게 변하는 프로젝트 상수를 둔다.

- `AGENT.md`: 모든 역할이 공유하는 프로젝트 기반 컨텍스트
- `DESIGN.md`: 디자인 토큰과 시각 컨벤션의 단일 출처
- `skills/`: 스키마, 패턴, 성능 규칙

작업 브리프에 디자인 토큰이나 컨벤션을 매번 복사하지 않는다. 실행자는 필요한
단일 출처 파일을 직접 읽는다.

### 2. 논의 레이어

담당: `discussion`

사용자 발화를 `requirements-spec` 스키마에 맞춘 실행 가능한 스펙으로 바꾼다.
레포 조사나 구현 판단은 하지 않는다. 필수 슬롯이 비면 질문하고, 충분하면 스펙을
오케스트레이션으로 넘긴다.

필수 슬롯:

| 슬롯 | 의미 |
|---|---|
| `goal` | 사용자가 달성하려는 목적 |
| `target` | 대상 유저, 디바이스, 브라우저 범위 |
| `design_ref` | `DESIGN.md` 준수와 의도적 벗어남 |
| `scope_in` | 이번 작업에 포함할 것 |
| `scope_out` | 이번 작업에서 제외할 것 |
| `acceptance_criteria` | 검증 가능한 수용 기준 |

### 3. 설계/조정 레이어

담당: `orchestration`

스펙을 자기완결 작업 단위로 쪼개고, 의존성 그래프와 실행 브리프를 만든다.
코드는 직접 수정하지 않는다. 각 단위는 독립 검증 가능해야 하고, 하위 역할 하나가
소화할 수 있는 크기여야 한다.

오케스트레이터가 만드는 산출물:

- 작업 단위 목록
- 위상 정렬된 실행 순서
- 병렬 가능 여부
- 단위별 실행 브리프
- 수용 기준과 검증 하네스 매핑
- 실패 시 소유자 라우팅

### 4. 게이트 레이어

담당: `spec`, `design`

병렬 작업의 전제는 대화가 아니라 고정된 계약이다. `spec`과 `design`이 먼저
산출물을 만들고, 이후 단계가 이 계약에만 의존한다.

`spec`이 고정하는 것:

- 컴포넌트 트리
- TypeScript 타입과 props 인터페이스
- API 요청/응답 스키마
- 데이터 접근 훅 시그니처
- test-id 규약

`design`이 고정하는 것:

- 디자인 토큰
- 컴포넌트별 시각 스펙
- 상태별 시각 규칙
- 반응형 동작
- 대비 기준

계약이 부족하거나 모순되면 다음 단계가 추측하지 않고 `spec` 또는 `design`으로
되돌린다.

### 5. 실행 레이어

담당: `state-data`, `implementation`, `tester`

고정된 계약 이후 병렬로 실행한다.

| 역할 | 책임 | 건드리지 않는 것 |
|---|---|---|
| `state-data` | API 클라이언트, 데이터 훅, 상태 스토어 | UI, JSX, 스타일 |
| `implementation` | 컴포넌트 마크업, 상태별 렌더링, Storybook | 계약, 데이터 레이어, 토큰 정의 |
| `tester` | 통합/E2E 플로우, 엣지/에러 커버리지 | 제품 코드, 최종 판정 |

구현 역할은 타깃을 먼저 판별한다.

- 웹 React/Next: `react-best-practice`
- React Native/Expo: `react-native-skills`

두 규칙 팩을 섞지 않는다.

### 6. 피드백 레이어

담당: `accessibility`, `review`

`accessibility`는 병합된 통합 빌드에서 자동 검사 너머의 접근성을 점검하고,
접근성 범위의 수정만 직접 수행한다. 대비의 근본 원인이 토큰이면 `design`으로
되돌린다.

`review`는 최종 게이트다. 코드를 수정하지 않고, 고정된 계약과 스펙에 대조해
PASS/FAIL을 판정한다. 실패하면 어느 역할이 고쳐야 하는지 라우팅한다.

## 서브에이전트 로스터

| 에이전트 | 단계 | 모델 티어 | 쓰기 권한 | 핵심 산출물 |
|---|---:|---|---|---|
| `discussion` | 0 | 저가 | 없음 | 실행 가능한 요구사항 스펙 |
| `orchestration` | 1 | 강 | 없음 | 작업 그래프, 브리프, 라우팅 |
| `spec` | 2 | 강 | 있음 | 계약 문서, 타입, 스키마 |
| `design` | 2 | 강 | 있음 | 토큰, 시각 스펙 |
| `state-data` | 3 | 저가 | 있음 | API/훅/스토어 |
| `implementation` | 3 | 저가 | 있음 | 컴포넌트, 스토리, 단위 테스트 |
| `tester` | 3 | 저가 | 있음 | 통합/E2E 테스트 |
| `accessibility` | 4 | 강 | 접근성 한정 | a11y 개선 |
| `review` | 5 | 강 | 없음 | 최종 판정, 수정 라우팅 |

모델 이름은 플랫폼별 파일에서 조정한다. 티어 의도만 유지하면 된다.

## 실행 플로우

### 새 기능 작업

1. 요구사항이 모호하면 `discussion`으로 스펙을 완결한다.
2. `orchestration`이 스펙을 작업 단위로 분해한다.
3. `spec`과 `design`을 병렬 실행해 계약과 토큰을 고정한다.
4. `state-data`, `implementation`, `tester`를 병렬 실행한다.
5. 결과를 병합한 뒤 `accessibility`가 접근성을 점검하고 필요한 범위만 고친다.
6. `review`가 전체 검증 하네스와 계약 대조로 최종 판정한다.
7. 실패하면 `orchestration`이 소유 역할로 되돌리고 해당 부분만 재실행한다.

### 작은 수정 작업

작업이 명확하고 영향 범위가 작으면 전체 DAG를 모두 돌리지 않아도 된다. 그래도
아래 원칙은 지킨다.

- 계약을 바꾸는 수정이면 `spec`을 거친다.
- 토큰이나 시각 규칙을 바꾸면 `design`을 거친다.
- UI만 바꾸면 `implementation`과 필요한 검증을 수행한다.
- 데이터 계약이나 훅을 바꾸면 `state-data`와 관련 테스트를 수행한다.
- 최종 결과는 가능한 한 `review` 기준으로 확인한다.

## 실패 라우팅

| 증상 | 되돌릴 역할 |
|---|---|
| 요구사항 슬롯 부족, 수용 기준 모호 | `discussion` |
| 작업 분할이 틀림, 브리프가 과대/과소 | `orchestration` |
| props, 타입, API 스키마, test-id 불일치 | `spec` |
| 토큰 부재, 토큰 대비 부족, 시각 스펙 모순 | `design` |
| 데이터 페칭, API 클라이언트, 상태 훅 문제 | `state-data` |
| 마크업, 렌더 상태, 컴포넌트 경계 문제 | `implementation` |
| 플로우 커버리지, E2E 누락 | `tester` |
| 키보드, 포커스, ARIA, 모션 문제 | `accessibility` |
| 소유자 판정, 통합 PASS/FAIL | `review` |

실패는 단위 단위로 격리한다. 같은 단위를 한 번 재시도하고, 그래도 실패하면
브리프를 보강하거나 상위 레이어로 되돌린다.

## 검증 하네스

프로젝트별 실제 명령은 `AGENT.md`에 기록한다. 기본 게이트는 다음 신호를 기준으로
한다.

- `tsc --noEmit`
- `eslint`
- `vitest run`
- Playwright E2E와 스크린샷
- 비주얼 스냅샷
- `axe`

역할별 검증 범위는 다르다. `review`만 최종 통합 PASS/FAIL을 판정한다.

## 플랫폼별 미러

| 플랫폼 | 경로 | 목적 |
|---|---|---|
| Claude Code | `.claude/` | Claude 네이티브 agent/skill 포맷 |
| Cursor | `.cursor/` | Cursor agent/rule 포맷 |
| Codex | `.codex/` | Codex `AGENTS.md` 진입점과 `SKILL.md` 미러 |

### Claude

`.claude/agents/*.md`와 `.claude/skills/*/SKILL.md`를 둔다. 원본과 같은 구조에
가깝고, 역할 frontmatter의 도구·모델·스킬 정보가 유지된다.

### Cursor

`.cursor/agents/*.md`는 Cursor 스키마로 얇게 정의하고, 본문은 루트
`agents/*.md`를 참조한다. `.cursor/rules/*.mdc`는 항상 로드 규칙과 스킬 색인을
담는다.

### Codex

루트 `AGENTS.md`가 Codex 진입점이다. `.codex/AGENTS.md`는 Codex 운용 규칙,
`.codex/agents/*.md`는 역할 래퍼, `.codex/skills/*/SKILL.md`는 스킬 미러다.
Codex가 프로젝트 스킬을 자동 발견하지 못하는 환경이면 `.codex/AGENTS.md` 지시에
따라 필요한 `SKILL.md`를 직접 읽는다.

## 유지보수 절차

### 역할 수정

1. 루트 `agents/<role>.md`를 수정한다.
2. Claude 미러가 원본 복사 방식이면 `.claude/agents/<role>.md`도 맞춘다.
3. Cursor/Codex 래퍼는 원본 참조만 유지한다. 운용 차이가 생길 때만 수정한다.
4. 해당 역할이 사용하는 스킬 목록이 바뀌면 플랫폼별 frontmatter/rule/index도 맞춘다.

### 스킬 수정

1. 루트 `skills/`의 원본을 수정한다.
2. `SKILL.md` 패키징이 필요한 스킬은 `.claude/skills/`와 `.codex/skills/`를 동기화한다.
3. 대형 규칙 팩은 rule 파일 개수와 이름이 플랫폼 미러 간 동일한지 확인한다.

확인 명령:

```sh
diff -qr -x README.md .claude/skills .codex/skills
find .codex/skills -maxdepth 2 -type f -name 'SKILL.md' | sort | wc -l
find .claude/skills -maxdepth 2 -type f -name 'SKILL.md' | sort | wc -l
```

### 새 역할 추가

1. `agents/<name>.md`를 만든다.
2. 역할의 책임, 하지 않는 일, 입력, 산출물, 검증 하네스를 명확히 쓴다.
3. `agents/orchestration.md`의 로스터와 DAG에 연결한다.
4. `.claude/agents/`, `.cursor/agents/`, `.codex/agents/`에 플랫폼 미러를 추가한다.
5. 이 README의 로스터와 실패 라우팅 표를 갱신한다.

### 새 스킬 추가

1. `skills/<name>.md` 또는 `skills/<name>/SKILL.md`를 만든다.
2. 어떤 역할이 언제 읽어야 하는지 스킬 설명에 쓴다.
3. 사용하는 역할의 frontmatter 또는 래퍼에 스킬을 연결한다.
4. `.claude/skills/<name>/SKILL.md`와 `.codex/skills/<name>/SKILL.md`가 필요하면 만든다.
5. Cursor는 `.cursor/rules/skills-index.mdc`에 색인을 추가한다.

## 운영 규칙

- 브리프에는 작업 고유 정보만 넣는다. 프로젝트 상수는 단일 출처 파일을 읽게 한다.
- 병렬 실행 전에는 계약과 토큰을 먼저 고정한다.
- 하류 역할은 계약을 재정의하지 않는다.
- 검증할 수 없는 작업 단위는 만들지 않는다.
- 하위 에이전트가 사용자에게 직접 질문하지 않는다. 질문은 오케스트레이션을 통해 표면화한다.
- 리뷰는 수정하지 않는다. 판정과 라우팅만 한다.
- 접근성 역할은 접근성 범위만 수정한다.
- 웹 React와 React Native 규칙 팩을 섞지 않는다.

## 관리 체크리스트

정기적으로 아래를 확인한다.

- `agents/`와 플랫폼 미러의 역할 목록이 일치하는가
- `.claude/skills`와 `.codex/skills`의 `SKILL.md` 수가 일치하는가
- React/RN rule 파일 수가 미러 간 일치하는가
- `AGENT.md`의 스택과 검증 명령이 실제 프로젝트와 맞는가
- `DESIGN.md`의 토큰 TODO가 실제 값으로 채워졌는가
- `requirements-spec`의 슬롯 정의와 `discussion`/`orchestration` 설명이 충돌하지 않는가
