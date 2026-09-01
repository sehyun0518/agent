---
name: vercel-react-native-skills
description:
  React Native and Expo best practices for building performant mobile apps. Use
  when building React Native components, optimizing list performance,
  implementing animations, or working with native modules. Triggers on tasks
  involving React Native, Expo, mobile performance, or native platform APIs.
license: MIT
metadata:
  author: vercel
  source: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-native-skills
  version: "1.0.0"
---

> **⚠️ React Native(Expo) only.** 웹 React/Next면 `react-best-practice`,
> ReactLynx면 `reactlynx-best-practices`, Vanilla Lynx(Element PAPI)면
> `vanilla-lynx`를 쓰세요. 네 팩은 혼용하지 않습니다.
> 어느 팩인지는 저장소 의존성으로 판별합니다 — `react-native` / `expo`.

<!-- vendored:begin -->
# React Native Skills

Comprehensive best practices for React Native and Expo applications. Contains
rules across multiple categories covering performance, animations, UI patterns,
and platform-specific optimizations.

## When to Apply

Reference these guidelines when:

- Building React Native or Expo apps
- Optimizing list and scroll performance
- Implementing animations with Reanimated
- Working with images and media
- Configuring native modules or fonts
- Structuring monorepo projects with native dependencies

## Rule Categories by Priority

| Priority | Category         | Impact   | Prefix               |
| -------- | ---------------- | -------- | -------------------- |
| 1        | List Performance | CRITICAL | `list-performance-`  |
| 2        | Animation        | HIGH     | `animation-`         |
| 3        | Navigation       | HIGH     | `navigation-`        |
| 4        | UI Patterns      | HIGH     | `ui-`                |
| 5        | State Management | MEDIUM   | `react-state-`       |
| 6        | Rendering        | MEDIUM   | `rendering-`         |
| 7        | Monorepo         | MEDIUM   | `monorepo-`          |
| 8        | Configuration    | LOW      | `fonts-`, `imports-` |

## Quick Reference

### 1. List Performance (CRITICAL)

- `list-performance-virtualize` - Use FlashList for large lists
- `list-performance-item-memo` - Memoize list item components
- `list-performance-callbacks` - Stabilize callback references
- `list-performance-inline-objects` - Avoid inline style objects
- `list-performance-function-references` - Extract functions outside render
- `list-performance-images` - Optimize images in lists
- `list-performance-item-expensive` - Move expensive work outside items
- `list-performance-item-types` - Use item types for heterogeneous lists

### 2. Animation (HIGH)

- `animation-gpu-properties` - Animate only transform and opacity
- `animation-derived-value` - Use useDerivedValue for computed animations
- `animation-gesture-detector-press` - Use Gesture.Tap instead of Pressable

### 3. Navigation (HIGH)

- `navigation-native-navigators` - Use native stack and native tabs over JS navigators

### 4. UI Patterns (HIGH)

- `ui-expo-image` - Use expo-image for all images
- `ui-image-gallery` - Use Galeria for image lightboxes
- `ui-pressable` - Use Pressable over TouchableOpacity
- `ui-safe-area-scroll` - Handle safe areas in ScrollViews
- `ui-scrollview-content-inset` - Use contentInset for headers
- `ui-menus` - Use native context menus
- `ui-native-modals` - Use native modals when possible
- `ui-measure-views` - Use onLayout, not measure()
- `ui-styling` - Use StyleSheet.create or Nativewind

### 5. State Management (MEDIUM)

- `react-state-minimize` - Minimize state subscriptions
- `react-state-dispatcher` - Use dispatcher pattern for callbacks
- `react-state-fallback` - Show fallback on first render
- `react-compiler-destructure-functions` - Destructure for React Compiler
- `react-compiler-reanimated-shared-values` - Handle shared values with compiler

### 6. Rendering (MEDIUM)

- `rendering-text-in-text-component` - Wrap text in Text components
- `rendering-no-falsy-and` - Avoid falsy && for conditional rendering

### 7. Monorepo (MEDIUM)

- `monorepo-native-deps-in-app` - Keep native dependencies in app package
- `monorepo-single-dependency-versions` - Use single versions across packages

### 8. Configuration (LOW)

- `fonts-config-plugin` - Use config plugins for custom fonts
- `imports-design-system-folder` - Organize design system imports
- `js-hoist-intl` - Hoist Intl object creation

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/list-performance-virtualize.md
rules/animation-gpu-properties.md
```

Each rule file contains:

- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
<!-- vendored:end -->

## 출처

[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)의
`skills/react-native-skills`(브랜치 `main`)를 MIT로 벤더링했습니다. 마커 사이는 원본 그대로입니다.
이 저장소가 더한 것은 frontmatter의 `license`·`metadata`와 상단 배너, 그리고 이
절뿐입니다(ADR-0008 종류 B).

디렉터리 이름은 `react-native-skills`이 아니라 `react-native-skills`입니다. 초기 벤더링 때 정해진 것이고
`metadata.source`가 원본 경로를 가리킵니다.

### 이 저장소에 없는 것

원본 스킬 디렉터리의 아래 파일은 가져오지 않았습니다.

- `AGENTS.md`·`README.md` — 원본 저장소를 설명하는 문서입니다.
- `metadata.json` — 원본 저장소의 배포 메타데이터입니다. 이 저장소는 같은 정보를
  frontmatter의 `license`·`metadata`로 표현합니다.
- `rules/_template.md` — 새 규칙을 쓸 때 쓰는 틀입니다. 규칙이 아닙니다.
