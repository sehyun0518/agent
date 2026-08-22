---
name: reactlynx-best-practices
description: ReactLynx dual-thread best practices for writing, reviewing, and refactoring Lynx components. Use when working with ReactLynx code — background-only directives, main-thread scripts, bindtap/catchtap events, runOnMainThread/runOnBackground, lazy/Suspense, globalPropsMode, component-library packaging, or render/diff/commit performance traces. Triggers on tasks involving Lynx, ReactLynx, or @lynx-js/react.
license: Apache-2.0
metadata:
  author: lynx-community
  source: https://github.com/lynx-community/skills
  version: "1.0.0"
---

> **⚠️ ReactLynx only.** 웹 React/Next 컴포넌트면 `react-best-practice`,
> React Native(Expo)면 `react-native-skills`를 쓰세요. 세 팩은 혼용하지 않습니다.
> 어느 팩인지는 저장소 의존성으로 판별합니다 — `@lynx-js/react`.

# ReactLynx Best Practices

ReactLynx는 React 프로그래밍 모델을 따르지만, Lynx의 **이중 스레드 런타임** 때문에
부수효과·생명주기 타이밍·이벤트 핸들러·메인 스레드 스크립트를 다르게 다뤄야 합니다.

규칙 9개가 `rules/`에 있습니다. 웹 React의 렌더링 최적화 규칙을 그대로 적용하면
스레드 경계를 어기게 되므로, 이 팩과 다른 팩을 섞지 않습니다.

## When to Apply

- ReactLynx 컴포넌트나 애플리케이션 코드를 새로 작성할 때
- 재사용 가능한 ReactLynx 컴포넌트 라이브러리를 만들거나 검토할 때
- 스레드 경계·생명주기·이벤트·`lynx.__globalProps`·코드 분할·성능 문제를 검토할 때
- `lynx.getJSModule`, `NativeModules`, `runOnMainThread`, `runOnBackground`,
  `lazy`, `Suspense`, `useLayoutEffect`를 호출하는 코드를 리팩터링할 때
- ReactLynx render·diff·commit·patch·setState 트레이스를 조사할 때

## Rules

| Rule | Impact | Use for |
|---|---|---|
| [detect-background-only](rules/detect-background-only.md) | CRITICAL | `lynx.getJSModule`, `NativeModules`, `'background only'`, 커스텀 이벤트·훅 경계 |
| [component-library-packaging](rules/component-library-packaging.md) | HIGH | 컴포넌트 라이브러리 export, type-erased ESM, JSX 보존, Rslib, `tsc` |
| [avoid-use-layout-effect](rules/avoid-use-layout-effect.md) | MEDIUM | 생명주기와 레이아웃 읽기 |
| [proper-event-handlers](rules/proper-event-handlers.md) | MEDIUM | `bindtap`, `catchtap`, 전파, dataset, 커스텀 prop 핸들러 |
| [main-thread-scripts-guide](rules/main-thread-scripts-guide.md) | MEDIUM | `main-thread:*`, `useMainThreadRef`, 스레드 간 호출, 공유 모듈 |
| [global-props-mode](rules/global-props-mode.md) | MEDIUM | `globalPropsMode`, `lynx.__globalProps` 직접 읽기, `useGlobalPropsChanged` 마이그레이션 |
| [code-splitting](rules/code-splitting.md) | MEDIUM | `lazy`, `Suspense`, 독립 lazy 번들, CSS 번들 스코프 |
| [performance-profiling](rules/performance-profiling.md) | MEDIUM | ReactLynx 트레이스 이벤트, flow ID, `displayName` |
| [hoist-static-jsx](rules/hoist-static-jsx.md) | LOW | 정적 JSX와 렌더 비용 |

## 핵심 체크리스트

규칙 문서를 읽기 전에 아래를 먼저 확인합니다.

- **이중 스레드 경계** — 렌더 코드는 메인 스레드에서 돌 수 있다. 부수효과와 네이티브
  API는 백그라운드 전용이다.
- **백그라운드 전용 전파** — 백그라운드 전용 코드에서만 불리는 함수도 백그라운드
  전용이지만, 커스텀 prop과 커스텀 훅 경계에서는 `'background only'` 지시자를 명시해야
  하는 경우가 많다.
- **생명주기** — `useLayoutEffect`는 지원되지 않는다. 백그라운드 부수효과는
  `useEffect`, 레이아웃 읽기는 메인 스레드 레이아웃 이벤트나 ref를 쓴다.
- **이벤트** — 일반 `bind*`·`catch*` 핸들러는 백그라운드 스레드에서 돈다.
  `main-thread:*` 핸들러는 `'main thread'`가 필요하고 제약이 더 엄격하다.
- **MTS** — 캡처한 값은 JSON 직렬화 가능해야 하고, 캡처한 변수는 수정할 수 없으며,
  중첩된 메인 스레드 함수는 지원되지 않는다. 스레드 간 호출은 `runOnMainThread()` 또는
  `runOnBackground()`를 쓴다.
- **공유 모듈** — `with { runtime: 'shared' }`는 코드 공유용이지 상태 공유용이 아니다.
- **코드 분할** — lazy 컴포넌트는 default export, `Suspense`, CSS 스코프 인식,
  중요한 경계의 에러 처리가 필요하다.

## 공식 문서

- Thinking in ReactLynx — <https://lynxjs.org/next/react/thinking-in-reactlynx.html>
- Rendering Process and Lifecycle — <https://lynxjs.org/next/react/lifecycle.html>
- Main Thread Script — <https://lynxjs.org/next/react/main-thread-script.html>
- Code Splitting — <https://lynxjs.org/next/react/code-splitting.html>
- Performance Profiling — <https://lynxjs.org/next/react/performance/profiling>
- `lynx.__globalProps` — <https://lynxjs.org/next/api/lynx-api/lynx/lynx-global-props.html>

## 출처

[lynx-community/skills](https://github.com/lynx-community/skills)의
`packages/skills/reactlynx-best-practices`를 Apache-2.0으로 벤더링했습니다.

원본은 `scripts/index.mjs`에 휴리스틱 스캐너를 함께 제공하지만 이 저장소는 스킬에
실행 코드를 두지 않으므로 규칙 문서만 가져왔습니다. 스캐너가 필요하면 원본 저장소를
직접 설치해서 씁니다. 원본도 "스캐너는 완전한 파서가 아니며 코드 리뷰를 대체하지
않는다"고 적어두고 있습니다.
