# Copilot 리뷰 지침

이 저장소에서 Copilot이 PR에 남기는 리뷰는 **버전 관리 판정 하나만** 다룬다.

코드 스타일, 네이밍, 성능, 리팩터링 제안은 남기지 않는다. 정확성과 구조는
`npm run check`(스키마 검증 · 계약 테스트 · 문서 형식 · 미러 드리프트)와
사람 리뷰가 판정한다. Copilot이 그 영역에 끼면 신호가 묻힌다.

## 남길 것

PR의 diff를 읽고 다음 세 가지만 답한다.

1. 이 변경이 **공개 표면**을 건드리는가
2. 건드린다면 semver 등급이 무엇인가 — major / minor / patch
3. `package.json`의 `version`이 그 등급에 맞게 올라와 있는가. 아니라면 얼마로
   올려야 하는지

판정 근거가 되는 파일과 줄을 함께 적는다. 근거 없이 등급만 말하지 않는다.

## 공개 표면

소비 저장소가 의존하는 것만 공개 표면이다.

- `packages/manifest-contracts/*.schema.json` — capability · workflow · profile ·
  orchestrator 스키마
- `packages/policy-contracts/policy.schema.json`,
  `packages/telemetry-contracts/event.schema.json`
- 생성 산출물의 경로와 형태 — `tooling/generators/platforms.json`이 정의하는
  `.claude/`, `.codex/` 레이아웃
- 프로파일 계약 — `profiles/*/profile.yaml`의 키, 소비 저장소가 쓰는
  `.agent-harness/profile.yaml`의 스키마
- Capability와 워크플로의 **id**, 그리고 각 `capability.yaml`이 선언한 입력 ·
  출력 · 증거 · 완료 조건

공개 표면이 아닌 것: `README.md`, `docs/`(ADR 포함), 에이전트 · 스킬의 산문,
벤더링한 3자 스킬, 주석, CI 설정. 이것만 바뀐 PR에는 "공개 표면 변경 없음,
버전 유지"라고만 답한다.

## 등급 기준

| 등급 | 해당하는 변경 |
|---|---|
| major | 필수 스키마 필드나 capability · 워크플로 id를 지우거나 이름을 바꾼다. 생성 산출물 경로를 옮긴다. 스키마를 좁혀서 기존에 통과하던 선언이 실패한다. |
| minor | 선택 필드, capability, 워크플로, 프로파일, 생성 대상을 새로 더한다. 기존 선언은 그대로 통과한다. |
| patch | 문서, 산문, 벤더링 동기화. 유효한 입력의 통과 · 실패 판정을 바꾸지 않는 검증기 버그 수정. |

## 0.x 규칙

현재 `0.y.z`다. 1.0.0 전에는 **파괴적 변경도 minor로 올린다**. major를 권하지
말고 "0.x에서는 minor" 라고 적는다.

1.0.0은 워크플로 실행 엔진과 증거 저장소가 붙어 공개 표면이 한 번 안정되고,
소비 저장소 한 곳이 실제로 `.agent-harness/profile.yaml`로 붙어본 뒤에 올린다.
그 전에는 1.0.0을 권하지 않는다.

## 형식

리뷰는 다섯 줄을 넘기지 않는다. 바꿀 것이 없으면 한 줄로 끝낸다.
