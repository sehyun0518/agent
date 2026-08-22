---
name: vanilla-lynx
description: |
  Build Rspeedy Vanilla Lynx apps with Element PAPI and Lynx Runtime APIs, never ReactLynx or JSX. Use for project scaffolding, main-thread UI, lifecycle/events, background communication, styling, or external bundles. Do not use for device-side runtime validation or debugging of an already built artifact; use lynx-devtool instead. For general APIs use lynx-api-docs; for ReactLynx use reactlynx-best-practices; for bundle quality use rspeedy-bundle-quality. Excludes Element PAPI JSON mode and output formats outside the Rspeedy Vanilla Lynx workflow.
license: Apache-2.0
metadata:
  author: lynx-community
  source: https://github.com/lynx-community/skills/tree/release/skills/vanilla-lynx
  version: "1.0.0"
---

> **⚠️ Vanilla Lynx only (Element PAPI, JSX 없음).** 같은 Lynx라도 ReactLynx면
> `reactlynx-best-practices`, 웹 React/Next면 `react-best-practice`,
> React Native(Expo)면 `react-native-skills`를 쓰세요. 네 팩은 혼용하지 않습니다.
> 어느 팩인지는 저장소 의존성으로 판별합니다 — `@lynx-js/rspeedy`가 있고
> `@lynx-js/react`가 없음.

# Build Vanilla Lynx Apps

Use this skill to build Lynx apps directly with Element PAPI and Lynx Runtime APIs, without ReactLynx or JSX.

## Core Rules

- Do not use ReactLynx, JSX, virtual DOM, or browser DOM APIs unless explicitly requested.
- Always pass all four required arguments to `__AddEventListener(element, eventName, handler, options)`; pass `{}` when no listener options are needed.
- Keep Element PAPI tree creation, mutation, lifecycle rendering, and UI updates in `main-thread.ts`. Never call Element PAPI APIs or `__FlushElementTree()` from `background.ts`; the background thread only sends serializable patches for the main thread to apply and flush.
- Rely on the SDK flush for initial render; call `__FlushElementTree()` after later UI mutations.
- Add `background.ts` only for heavier business logic, async work, timers, native calls, or data processing. Keep cross-thread payloads serializable.
- Use `lynx.getEngine()` only for engine-defined lifecycle events such as `__RenderPage`, `__UpdatePage`, and `__DestroyLifetime`; never use it for app-defined thread-local or cross-thread events. Lifecycle handlers may ignore their event payload when the implementation does not need it. Keep stable handler references for long-lived and cross-thread listeners; remove them with the same context and event name during destroy instead of registering inline callbacks.
- Keep external bundle building and loading separate and background-only. External modules must be plain TypeScript or JavaScript; never use ReactLynx, JSX, or ReactLynx transforms in them. Match the rslib entry key to the first `loadScript` argument.

## Reference Routing

Read only the reference files needed for the current task. Preserve their explicit constraints rather
than replacing them with generic guidance.

| Task                                                             | Read                             |
| ---------------------------------------------------------------- | -------------------------------- |
| Create a Vanilla Lynx project built with Rspeedy                 | `references/rspeedy-project.md`  |
| Build the main-thread Element PAPI tree or update UI             | `references/main-thread.md`      |
| Choose runtime event APIs or wire lifecycle events               | `references/event.md`            |
| Implement heavier logic on the background thread                 | `references/background.md`       |
| Author or review CSS using Lynx styling and layout rules         | `references/style.md`            |
| Build background-thread code into an external bundle with rslib  | `references/external-build.md`   |
| Load or call a background-thread external bundle in Vanilla Lynx | `references/external-runtime.md` |

## Runtime Validation

When the user asks to run, inspect, debug, or validate a built artifact on a device, use the
`lynx-devtool` skill. It owns client discovery, opening an already reachable artifact URL, runtime
inspection, console logs, screenshots, and interactions. Do not duplicate that workflow here or
present `agent-lynx` as an artifact builder or server.

## 출처

[lynx-community/skills](https://github.com/lynx-community/skills)의
`skills/vanilla-lynx`(브랜치 `release`)를 Apache-2.0으로 벤더링했습니다. 본문과
`references/` 7개는 원본 그대로입니다. 이 저장소가 더한 것은 frontmatter의
`license`·`metadata`와 상단 배너뿐입니다.

원본이 함께 두는 `evals/`와 `CHANGELOG.md`는 상류의 검증 자료라 가져오지 않았습니다.

본문이 가리키는 `lynx-devtool`·`lynx-api-docs`·`rspeedy-bundle-size`는 이 저장소에
없습니다. 상류 문맥이며, 필요하면 원본 저장소에서 따로 설치해서 씁니다.
