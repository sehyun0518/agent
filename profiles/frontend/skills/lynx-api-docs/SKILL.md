---
name: lynx-api-docs
description: Provides authoritative guidance for Lynx development involving pages, templates, components, CSS, layouts, elements, web migration, rendering or styling bugs, and code review. Applies to *.ttml, Lynx *.tsx, and all Lynx-specific files, and requires searching the installed API docs before acting.

license: Apache-2.0
metadata:
  author: lynx-community
  source: https://github.com/lynx-community/skills/tree/release/skills/lynx-api-docs
  version: "1.0.0"
---

> **📚 Lynx 레퍼런스.** Lynx 개발 레퍼런스입니다 — 요소·CSS·레이아웃·패턴·예제, 그리고 웹과의 차이.
> 규칙 팩이 아니라 조회 자료라 `reactlynx-best-practices`·`vanilla-lynx`와 **함께**
> 씁니다. 웹 React나 React Native 프로젝트에는 해당하지 않습니다.


<!-- vendored:begin -->
# Using Lynx API Docs

## Overview

**Pre-training knowledge is insufficient for Lynx.** Lynx is a rendering platform (like a browser) with its own elements, non-standard CSS behavior, unique layout systems, and web-incompatible defaults. Always retrieve from the installed API docs before writing or modifying Lynx page code.

## Core Rule

**MUST ALWAYS read the relevant API docs BEFORE writing or editing any Lynx code.**

Do not rely on web CSS knowledge. Do not assume standard HTML behavior. Do not guess element APIs. Lynx is a distinct platform with its own rules.

## Why Web Knowledge Fails

Lynx is **not** a web browser. Web assumptions produce broken Lynx code:

- **Elements**: `<view>`, `<text>`, `<image>` — not `<div>`, `<span>`, `<img>`
- **CSS defaults**: `border-box`, no margin collapsing, Linear layout (not Flow)
- **Properties**: Many CSS properties are unsupported or behave differently — always check `css/` docs

**Every web assumption is a potential bug.**

## How to Use the Docs

1. Identify what you're working on (layout, CSS, element, migration, pattern)
2. Look up the relevant doc file from the table below
3. **Read the doc BEFORE writing or editing code**
4. Apply the rules and constraints from the doc
5. If uncertain, search the `elements/` or `css/` directories

## Quick Reference

| Task | Read These Files First |
|------|------------------------|
| Choose layout | `layout/linear-layout.md` (default), `layout/flex-layout.md`, `layout/grid-layout.md`, `layout/relative-layout.md` |
| CSS properties/units | `css/supported-properties.md`, `css/values-and-units.md` |
| CSS selectors | `css/selectors.md`, `css/pseudo-classes.md` |
| Use an element | `elements/<element-name>.md` |
| Migrate from web | `lynx-vs-web/migration-guide.md`, `lynx-vs-web/css-differences.md` |
| Theming/animation/responsive | `patterns/theming.md`, `patterns/animation.md`, `patterns/responsive.md` |
| General lookup | `quick-reference.md`, `best-practices.md` |

## Core Rules

The compact layout decision rules and key CSS constraints are documented in `quick-reference.md`. Most critical:

- **Text** must use `<text>` component
- **Default box-sizing** is `border-box` (not `content-box`)
- **No margin collapsing**
- **Use `rem` + `vw`** for screen adaptation

## Red Flags — Stop and Read Docs

- Adding a `<div>` or `<span>` → Lynx uses `<view>`, `<text>`
- Using `margin` without checking if margin collapsing applies → It doesn't
- Assuming `content-box` → Default is `border-box`
- Using web CSS properties without checking `css/supported-properties.md`
- Guessing element attributes → Read `elements/<name>.md`
- Choosing `rpx` for web-portable code → `rpx` is Lynx-specific; use `rem` + `vw` for web compatibility
- Writing plain text without `<text>` wrapper → Invalid in Lynx
- Using web pseudo-classes without checking `css/pseudo-classes.md`
- Assuming standard HTML flow layout → Lynx uses linear layout by default
<!-- vendored:end -->

## 출처

[lynx-community/skills](https://github.com/lynx-community/skills)의
`skills/lynx-api-docs`(브랜치 `release`)를 Apache-2.0으로 벤더링했습니다. 본문은 원본
그대로입니다. 이 저장소가 더한 것은 frontmatter의 `license`·`metadata`와 상단 안내,
그리고 이 절뿐입니다.

`references/`나 하위 디렉터리 없이 문서만 있는 스킬입니다.

### 이 저장소에 없는 것

원본 컬렉션의 다른 스킬을 가리키는 부분이 있습니다. 아래는 의도적으로 가져오지
않았으니 그 경로는 여기서 끊깁니다.

- `lynx-devtool` — 실행 중인 앱을 붙잡는 일이라 이 하네스에 붙일 단계가 없습니다.
- `lynx-ui` — 해당 컴포넌트 라이브러리를 쓰는 프로젝트에만 의미가 있습니다.
- `lynx-check-css-support`·`lynx-trace-*`·`habitat-usage`·`lynx-debug-info-remapping`
  — 문서가 아니라 스크립트와 데이터 덩어리입니다.

필요하면 원본 저장소에서 따로 설치해서 씁니다.
