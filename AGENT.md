# AGENT.md — 프로젝트 기반 컨텍스트 (상시 로드)

이 문서는 모든 실행 서브에이전트의 **세계의 바닥(base context)** 이다. 작업마다
다시 묻지 않는 **느리게 변하는 프로젝트 상수**를 한곳에 박아둔다. 브리프에는
*작업 고유* 정보만 담기고, 아래 상수는 담기지 않는다 — 실행자가 이미 이걸
들고 있기 때문이다. (`requirements-spec` 스킬의 "디자인은 슬롯이 아니라
참조다" 참고.)

## 디자인 시스템

디자인 토큰·시각 컨벤션의 단일 출처는 **[DESIGN.md](./DESIGN.md)** 다. 모든
스타일링·구현·디자인 에이전트는 이 링크를 따라간다. 스펙의 `design_ref` 슬롯은
"DESIGN.md 표준을 따른다"는 사실 + 이번 작업의 의도적 벗어남만 기록한다.

## 기술 스택 <!-- TODO: 실제 값으로 채울 것 -->

- 프레임워크: <예: React 19 + TypeScript / React Native (Expo)>
- 스타일링: <예: CSS 변수 / Tailwind / styled-components>
- 서버 상태 / 클라이언트 상태: <예: TanStack Query / Zustand>
- 고립 하네스: <예: Storybook>
- 테스트: <예: vitest + Testing Library / Playwright(E2E) / MSW(목킹) / axe>

## 컨벤션 <!-- TODO: 실제 값으로 채울 것 -->

- 폴더 구조: <...>
- 네이밍: <...>
- test-id 규약: <...>
- 검증 하네스(green 전 종료 금지): `tsc --noEmit` · `eslint` · `vitest run`
  · Playwright · 비주얼 스냅샷 · `axe`
