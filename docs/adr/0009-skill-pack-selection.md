# ADR-0009: 규칙 팩 선택은 실행 에이전트가 한다

- 상태: accepted
- 날짜: 2026-08-22
- 관련 이슈: #26 · #29
- 관련 PR: #27 · #30

## 배경

구현 레이어에 상호 배타적인 규칙 팩이 넷이다.

| 팩 | 대상 |
|---|---|
| `react-best-practice` | 웹 React / Next.js |
| `react-native-skills` | React Native / Expo |
| `reactlynx-best-practices` | ReactLynx (JSX) |
| `vanilla-lynx` | Vanilla Lynx (Element PAPI) |

섞으면 안 된다. 웹 React의 렌더링 최적화 규칙을 ReactLynx에 적용하면 스레드 경계를
어긴다. `rerender-memo`(웹)와 `detect-background-only`(Lynx)는 같은 코드에 다른 답을
낸다.

프로파일은 이것을 `skillsOneOf`로 선언하고, 스키마는 이렇게 설명한다.

> 택일 주입. **실행 시 타깃 판별로 하나만 고른다.**

그런데 그 "타깃"을 어디서 읽는지가 없었다. 생성기는 전부 주입한다.

```js
// tooling/generators/generate.mjs
target.skills.push(...(binding.skills ?? []), ...(binding.skillsOneOf ?? []))
```

팩이 둘일 때도 그랬지만 넷이 되면서 드러났다.

## 결정

### 1. 에이전트가 저장소 의존성으로 판별한다

프로파일에 `target` 같은 선언 필드를 두지 않는다.

| 팩 | 판별 근거 |
|---|---|
| `react-best-practice` | `react` + `next` / `react-dom` |
| `react-native-skills` | `react-native` / `expo` |
| `reactlynx-best-practices` | `@lynx-js/react` |
| `vanilla-lynx` | `@lynx-js/rspeedy` 있고 `@lynx-js/react` 없음 |

**타깃은 이미 소비 저장소의 `package.json`에 있다.** 프로파일에 다시 적으면 두 곳이
어긋난다. 의존성이 바뀌어도 선언 필드는 따라오지 않는다.

모노레포처럼 패키지마다 타깃이 다른 경우는 저장소 단위 필드 하나로 표현되지 않는다.
`apps/web`과 `apps/mobile`이 같이 있으면 `target: web`이 거짓이 된다. 패키지별
의존성을 읽는 에이전트는 그냥 된다.

이 하네스는 이미 더 어려운 판단을 에이전트에게 맡긴다 — 생략 사유가 구체적인지, red가
예상한 이유로 실패했는지, 문서 영향이 있는지. "이 저장소가 React인가 Lynx인가"는
그보다 쉽다.

### 2. 판별 근거는 각 `SKILL.md`의 상단 배너가 소유한다

에이전트가 고르게 한다면 **배너가 그 판별의 근거**다. 네 팩 모두 나머지 셋과 자기
판별 조건을 명시한다.

```markdown
> **⚠️ ReactLynx only (JSX).** 같은 Lynx라도 JSX 없이 Element PAPI로 짜면
> `vanilla-lynx`, 웹 React/Next면 `react-best-practice`, React Native(Expo)면
> `react-native-skills`를 쓰세요. 네 팩은 혼용하지 않습니다.
> 어느 팩인지는 저장소 의존성으로 판별합니다 — `@lynx-js/react`.
```

#27 이전에는 비대칭이었다. `react-native-skills`에는 배너가 아예 없어 다른 팩의 존재를
몰랐고, `react-best-practice`의 배너는 RN만 언급해 Lynx 프로젝트에서도 "RN 아니면 이거
써도 됨"으로 읽혔다.

### 3. 주입 비용은 이름 몇 줄이다

생성물의 `skills:`에는 이름만 들어가고 본문은 `.claude/skills/<name>/SKILL.md`에 따로
있다. `rules/`와 `references/`는 `SKILL.md`를 읽은 뒤 필요할 때 열린다.

```yaml
skills:
  - react-best-practice
  - react-native-skills
  - reactlynx-best-practices
  - vanilla-lynx
```

넷을 나열해도 4줄이다. 생성 시점에 하나로 고정하는 것은 이 이득이 없으면서 플랫폼의
description 기반 선택 메커니즘과 싸운다.

### 4. `skillsOneOf`와 `skills`를 구분한다

| 바인딩 | 의미 | 예 |
|---|---|---|
| `skillsOneOf` | 상호 배타. 하나만 쓴다 | 위 규칙 팩 4종 |
| `skills` | 항상 함께 쓴다 | `lynx-api-docs`·`lynx-typescript`·`rspeedy-bundle-size` |

레퍼런스는 택일 대상이 아니다. `reactlynx-best-practices`를 고르든 `vanilla-lynx`를
고르든 `lynx-api-docs`는 함께 본다. Lynx가 아닌 저장소에서는 description이 맞지 않아
에이전트가 고르지 않는다.

## 대가

**잘못 고르는 것을 기계가 막지 못한다.** RN 프로젝트에서 웹 규칙을 적용해도 검증기는
통과한다. 배너와 description이 유일한 방어선이다.

판정 레이어와 테스트가 실제 오작동은 잡지만, 잘못된 조언 자체는 잡지 못한다.

## 결과

- 타깃이 한 곳(소비 저장소의 `package.json`)에만 있다.
- 모노레포에서 패키지마다 다른 팩을 쓸 수 있다.
- 팩을 추가할 때 스키마를 고칠 필요가 없다. 배너만 넷에서 다섯으로 늘린다.

## 현재 강제 범위

**검증기가 배너 존재를 검사하지 않는다.** 새 팩을 `skillsOneOf`에 넣으면서 기존 팩들의
배너를 안 고쳐도 통과한다. #27에서 실제로 그렇게 됐고, 사람이 리뷰에서 잡았다.

기계로 강제하려면 `skillsOneOf`에 속한 각 스킬의 `SKILL.md`가 나머지 전부를 언급하는지
검사해야 한다. `tooling/validators/profile-roster.mjs`처럼 순수 헬퍼로 분리하면 계약
테스트를 붙일 수 있다.

`skillsOneOf`에 두 팩만 남기고 나머지를 지워도 검증기는 아무 말 하지 않는다.
