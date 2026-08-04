# 작업 하나를 끝까지

실제 요청 하나가 발화에서 판정까지 가는 과정. `docs/operations.md`가 기준이라면 이 문서는
**그 기준이 실제로 어떻게 적용되는지**다.

예시 작업: **"설정 페이지에 알림 토글 추가"**

---

## 0. 시작 전에 정할 것 하나

워크플로를 고른다. 새 기능이니 `change`다.

```sh
cat workflows/change.yaml     # 대본. 자동으로 돌지 않는다
```

프론트엔드 프로파일이 켜져 있으면 여기에 세 단계가 더 끼어든다.

| 끼는 것 | 어디에 |
|---|---|
| `design` | `specification`과 **병렬** |
| `state-data` | `implementation`과 **병렬** |
| `accessibility` | `review` **앞** |

이건 `profiles/frontend/profile.yaml`의 `workflowExtensions`가 정한다.

---

## 1. requirements — 발화를 스펙으로

```
호출: discussion
입력: "설정 페이지에 알림 토글 추가해줘"
```

이 역할은 **도구가 없다.** 레포를 뒤지지 않고 발화만 본다. 필수 슬롯 6개를 채우려 하고,
못 채우면 묻는다.

```
Q1. 대상 디바이스와 브라우저 하한은?
Q2. 토글을 끄면 기존 알림도 취소되나, 새 알림만 안 오나?
Q3. 이번에 제외할 것은? (예: 알림 종류별 세분화)
```

**여기서 통과 조건**

```yaml
kind: completeness-check
status: passed
summary: "필수 슬롯 6/6, 수용 기준 3개, 미확인 추론 0"
```

`failed`면 어느 슬롯이 왜 미달인지가 `summary`에 있어야 한다. "미달"만 적혀 있으면
다음 라운드에 뭘 물을지 알 수 없다.

**자주 걸리는 것** — 수용 기준이 "사용성이 좋다" 같은 문장이면 `failed`다. 글자가
들어있다고 채워진 게 아니다. 판정 가능해야 한다.

```
✅ "토글을 끄고 새로고침해도 꺼진 상태가 유지된다"
❌ "설정이 잘 저장된다"
```

---

## 2. specification — 스펙을 계약으로

```
호출: spec   (프로파일이 켜져 있으면 design과 동시에)
```

여기서 나오는 건 **파일**이다. 대화 속 설명은 계약이 아니다 — 하류는 격리된 컨텍스트에서
돌기 때문에 대화를 보지 못한다.

고정해야 할 네 가지:

```ts
// 1. 타입과 props
interface NotificationToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

// 2. API 스키마
type UpdateSettingsRequest = { notifications: boolean }
type UpdateSettingsResponse = { notifications: boolean; updatedAt: string }

// 3. 데이터 접근 훅 시그니처  ← 실제 훅이 아니라 시그니처
function useNotificationSetting(): {
  enabled: boolean
  isLoading: boolean
  error: Error | null
  update: (next: boolean) => Promise<void>
}

// 4. test-id 규약
// data-testid="settings-notification-toggle"
```

3번이 중요하다. **실제 훅 없이도 구현이 가능해야** 한다. 구현자는 격리된 worktree에서
돌아 데이터 레이어의 실제 파일을 보지 못한다. 시그니처만 있으면 완성할 수 있고, 실제
훅은 병합 시점에 연결된다.

4번도 마찬가지다. 테스트 작성자는 DOM을 보지 못한 채 테스트를 쓴다.

**통과 조건**

```yaml
kind: contract-diff
status: recorded
summary: "신규 인터페이스 3, 변경 0, 제거 0"
artifact: .harness/runs/{runId}/contract-diff.md
```

`status: violated`는 이미 고정된 계약이 재고정 절차 없이 바뀐 경우다. 하류가 이전
계약에 기대 작업 중일 수 있으므로 `contract-violation`으로 분류한다.

---

## 3. test-design — 인수 기준을 테스트로

```
호출: tester
```

**층으로 분담하지 않는다.** 인수 기준마다 "이걸 무엇으로 판정하지?"를 묻고, 그 답이
층을 정한다.

| 인수 기준 | 층 |
|---|---|
| "꺼진 상태로 저장하면 API에 `notifications: false`가 간다" | 단위 |
| "저장 실패 시 토글이 이전 상태로 돌아간다" | 통합 |
| "토글을 끄고 새로고침해도 꺼져 있다" | E2E |

요약에 **인수 기준 ↔ 테스트 대응표**를 남긴다. 이게 없으면 다음 단계가 "이 실패가
인수 기준을 검증하는 실패인가"를 판정할 수 없다.

```markdown
| 인수 기준 | 테스트 | 층 |
|---|---|---|
| AC1 저장 요청 페이로드 | useNotificationSetting.test.ts:12 | unit |
| AC2 실패 시 롤백 | settings-flow.test.tsx:34 | integration |
| AC3 새로고침 후 유지 | e2e/settings.spec.ts:8 | e2e |
```

**구현자는 이 테스트를 쓰지 않는다.** 코드를 쓴 뒤에 쓰는 테스트는 요구사항이 아니라
구현을 확인하는 것이고, 결국 통과하는 테스트를 쓰게 된다.

---

## 4. red 확인 — 구현 착수의 유일한 관문

```
호출: test-runner (variant: unit)
```

여기가 이 공정의 핵심이다. **"빨갛다"와 "올바른 이유로 빨갛다"는 다르다.**

```yaml
kind: test.unit.result
status: failed
summary: "1 failed — useNotificationSetting.test.ts > 저장 요청 페이로드"
artifact: .harness/runs/{runId}/unit.json

kind: test.red-proof
status: confirmed
summary: "useNotificationSetting이 아직 없어 단언 실패. 컴파일은 통과."
```

### confirmed 판정 기준

| 실패 이유 | 판정 |
|---|---|
| 단언 실패, 기대값 불일치, 미구현 반환 | ✅ `confirmed` |
| 컴파일·타입 에러 | ❌ `rejected` |
| import·모듈 해석 실패 | ❌ `rejected` |
| 테스트 파일 문법 오류 | ❌ `rejected` |
| 픽스처·설정 누락 | ❌ `rejected` |
| 러너가 아예 안 뜸 | ❌ `rejected` |

`rejected`면 테스트가 **아직 돌지도 않는** 상태다. 이때 구현을 시작하면 나중에 초록이
됐을 때 그게 요구사항을 만족해서인지 에러가 사라져서인지 구분할 수 없다.

### 왜 unit만인가

| 층 | 구현 전 |
|---|---|
| unit | 대상이 없어 단언이 깨진다 → 의미 있는 red |
| integration | 픽스처·목킹 미비로 깨지기 쉽다 → `errored`가 red로 오인됨 |
| e2e | 화면이 없어 러너가 못 뜬다 → **무조건 `errored`. red 확인 대상 아님** |

---

## 5. implementation — 초록으로 만들기

```
호출: implementation   (프로파일이 켜져 있으면 state-data와 동시에)
게이트: workflows/gates/require-red-evidence.md
```

게이트가 먼저 본다. `test.red-proof`가 `confirmed`가 아니면 **여기서 멈춘다.**

구현자가 소비하는 세 가지 — 어느 것도 새로 정의하지 않는다:

1. 고정된 계약 (2번 산출)
2. 디자인 토큰 (프로파일의 `design`이 낸 것)
3. 데이터 접근 인터페이스 (시그니처. 실제 훅이 아니다)

**테스트를 쓰지 않고 돌리기만 한다.** 이미 있는 테스트를 초록으로 만드는 것이 목표다.

```yaml
kind: changed-files
status: recorded
summary: "3 files — NotificationToggle.tsx, SettingsPage.tsx, tokens 적용"
artifact: .harness/runs/{runId}/changed-files.json
```

여기서 돌린 자가 검증은 **작업 방식이지 기록의 증거가 아니다.** 초록이 됐다고 게이트를
통과한 게 아니다. 판정 근거가 되는 증거는 다음 단계가 만든다.

---

## 6. 테스트 실행 — 세 층을 따로

```
호출: test-runner (unit) → test-runner (integration) → test-runner (e2e)
```

**하나로 합치지 않는다.** 각 층이 자기 신호와 증거를 낸다.

```yaml
# unit
kind: test.unit.result
status: passed
summary: "13 passed"

# integration
kind: test.integration.result
status: passed
summary: "4 passed"

# e2e
kind: test.e2e.result
status: passed
summary: "2 passed"
```

### 생략하려면

unit은 생략 불가. integration·e2e는 **사유와 승인**이 둘 다 있어야 한다.

```yaml
kind: test.skip-justification
status: recorded
summary: "e2e 생략 — 이번 변경은 기존 설정 페이지에 토글 하나를 더한 것이고
          라우팅·인증 경로를 건드리지 않음"

kind: approval-record
status: granted
```

```
✅ "이번 변경은 순수 함수만 건드리고 UI 경로가 없음"
❌ "이번엔 필요 없어서"
```

사유 없는 생략은 "전부 통과"처럼 읽힌다.

---

## 7. accessibility — 프로파일이 끼워 넣은 단계

```
호출: accessibility   (프론트엔드 프로파일이 review 앞에 삽입)
```

자동 검사 너머를 본다 — 키보드 조작, 포커스 관리, 스크린리더 시맨틱, 명도 대비,
모션 환경설정.

이 역할은 **접근성 범위만 직접 고친다.** 대비 문제의 뿌리가 토큰이면 고치지 않고
`design`으로 라우팅한다.

---

## 8. review — 판정

```
호출: review
게이트: workflows/gates/require-test-evidence.md
```

게이트가 먼저 본다. 증거가 없거나 생략 사유가 비어 있으면 **판정하지 않고 되돌린다.**

`review`는 **테스트를 돌리지 않는다.** 증거를 읽는다.

```markdown
## 판정: PASS

### 계약 적합성
- props가 계약과 일치 ✓
- 데이터 접근 인터페이스가 실제 훅에 연결됨 ✓
- 디자인 토큰 하드코딩 없음 ✓

### 증거
- test.unit.result: passed (13)
- test.integration.result: passed (4)
- test.e2e.result: passed (2)

### 지적
- Warning: SettingsPage.tsx:45 — 토글 상태 변경 시 낙관적 업데이트가
  에러 경로에서 롤백되지 않을 수 있음. 소유자: implementation
```

지적마다 **파일·라인·위반한 규칙**을 적는다. 모호한 피드백은 라우팅이 불가능하다.

소유자 이름은 `profiles/frontend/profile.yaml`의 `routing`이 정한다.

---

## 9. Git — 여기서 자동으로 이어지지 않는다

```
호출: git-operator (commit)     ← 사람이 명시적으로
```

`review`가 PASS를 냈다고 커밋이 자동으로 되지 않는다. 그리고 커밋이 됐다고 푸시가
자동으로 되지 않는다.

```
commit ─╳→ push ─╳→ pr-create
```

각각 따로 부른다. `push`·`pr-create`·`pr-update`는 승인(`approval-record: granted`)이
필요하다. 커밋 메시지와 PR 본문에 자동화 도구 출처 문구를 자동으로 넣지 않는다.

---

## 실패했을 때

각 단계는 실패를 **4분류 중 하나**로 판정한다.

| 분류 | 동작 | 예 |
|---|---|---|
| `transient` | 재시도 (기본 2회) | 네트워크 일시 오류 |
| `precondition-unmet` | 선행 단계로 되돌림 | red 증거가 없음 |
| `contract-violation` | 에스컬레이션 | 고정된 계약이 말없이 바뀜 |
| `policy-denied` | **즉시 중단. 재시도 불가** | 승인 없이 푸시 시도 |

`policy-denied`가 재시도되지 않는 것은 스키마가 고정한다 —
`"action": {"const": "halt"}`. 재시도로 뚫리면 막는 의미가 없다.

되돌릴 곳은 증상이 정한다.

| 증상 | 되돌릴 곳 |
|---|---|
| 수용 기준이 모호 | `discussion` |
| 계약 드리프트·타입 불일치 | `spec` |
| 토큰 부재·대비 부족 | `design` |
| 테스트가 안 돌음·red `rejected` | `tester` |
| 마크업·렌더 상태 | `implementation` |
| 데이터 페칭·상태 로직 | `state-data` |
| 커버리지 누락 | `tester` |

---

## 짧은 작업은 어디까지 줄이나

전부 다 돌릴 필요는 없다. 다만 **줄여도 되는 것과 안 되는 것**이 있다.

| 단계 | 줄일 수 있나 |
|---|---|
| `discussion` | 요구사항이 이미 명확하면 생략 |
| `spec` | 계약이 안 바뀌면 확인만 (차이 0으로 기록) |
| `tester` → red 확인 → `implementation` | **줄이지 않는다.** 이 공정의 핵심 |
| `integration`·`e2e` | 사유 + 승인이 있으면 생략 |
| `unit` | 생략 불가 |
| `review` | 가능하면 항상 |

---

## 이 흐름이 지켜지는 정도

**정직하게** — 위 순서와 게이트는 **문서상 규칙**이다. 안 지켜도 지금은 아무 일도
일어나지 않는다. 실행 주체는 사람 또는 메인 에이전트다.

자동으로 막히는 건 두 가지뿐이다.

```sh
npm run validate    # 선언끼리 앞뒤가 맞는지
npm run check       # 위 + 미러 드리프트
```

`.harness/runs/{runId}/`에 증거를 남긴다는 규약도 **만드는 주체가 없다.**
실행 코드가 생기는 조건은 `docs/adr/0002-runtime-promotion.md`.
