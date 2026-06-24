# .cursor — Cursor 이식 (Claude Code 하네스 미러)

기존 Claude Code 에이전트 하네스(`agents/`, `skills/`)를 Cursor에서 저렴한
모델로 돌리기 위한 미러. Cursor는 **네이티브 서브에이전트**(`.cursor/agents/`)와
**Task 디스패치**를 지원하므로, 이 설계가 거의 그대로 매핑된다. 핵심은
**단일 출처 유지**: 각 서브에이전트 본문은 원본 `agents/<name>.md`를 읽어
따르고 복제하지 않는다(원본을 고치면 Cursor도 따라감).

## 구조

```
.cursor/
  README.md                ← (이 문서)
  agents/                  ← 네이티브 Cursor 서브에이전트 (역할 = 파일)
    discussion.md  orchestration.md  spec.md  design.md
    state-data.md  implementation.md  tester.md
    accessibility.md  review.md
  rules/
    00-pipeline.mdc        alwaysApply: 파이프라인 개요 (항상 로드)
    requirements-spec.mdc  공유 스키마 참조
    skills-index.mdc       설계·성능 스킬 색인
```

## Claude Code ↔ Cursor 매핑

| Claude Code | Cursor | 비고 |
|---|---|---|
| `.claude/agents/*.md` | `.cursor/agents/*.md` | Cursor는 `.claude/agents/`도 호환 읽기(`.cursor/` 우선) |
| frontmatter `tools` | — | 미지원(무시), 기본 도구 접근 |
| frontmatter `skills` | `.cursor/rules/*.mdc` | 스킬은 규칙/색인으로 |
| `model: sonnet/opus/inherit` | `model: composer-2.5 / gpt-5.5 / inherit` | 값만 교체 |
| `background: true` | `is_background: true` | 필드명 다름 |
| 읽기 전용(쓰기 도구 미부여) | `readonly: true` | orchestration·review·discussion |
| `isolation: worktree` | (선택) Agents Window `/worktree` | 서브에이전트도 격리 컨텍스트 보유 |
| 오케스트레이터 `Task` 자동 디스패치 | Task (네이티브) | ✅ 자동/명시(`/name`)/병렬 |

### `agents/`를 그대로 넣어도 되나?

부분적으로 그렇다. Cursor가 읽는 위치는 `.cursor/agents/` 또는 `.claude/agents/`
이며, 저장소 루트의 **바레 `agents/`는 자동 인식하지 않는다.** 또 frontmatter
필드가 다르다(`tools`/`skills`/`isolation`/`color`/`mcpServers` 미지원,
`background`→`is_background`, `model` 값 교체 필요). 그래서 이 미러는 `.cursor/
agents/`에 Cursor 스키마로 얇게 정의하고 본문은 원본을 참조하게 했다.

### 유일한 한계

서브에이전트가 띄운 서브에이전트는 **한 단계 더는 못 띄운다.** 그래서
`orchestration`을 **메인 드라이버로 운용**해 7개 역할을 직접 1차 서브에이전트로
띄운다(우리 DAG는 leaf가 또 위임하지 않으므로 충분).

## 모델 티어 (티어 유지)

| 티어 | 모델(예시) | 에이전트 |
|---|---|---|
| 저가 | `composer-2.5` | discussion · state-data · implementation · tester |
| 강(판단) | `gpt-5.5` | orchestration · spec · design · accessibility · review |

> 기존 Claude `sonnet` 워커 → `composer-2.5`. 판단 역할은 강한 모델. 모델 ID는
> 예시이며 본인 계정 모델(예: `claude-4.5-sonnet`)로 각 `.cursor/agents/*.md`
> frontmatter에서 교체. 더 아끼려면 강 티어도 `composer-2.5`로 내릴 수 있다.

## 실행 순서 (Task 디스패치)

1. **discussion** — 요구사항 → 완결 스펙. (미완결이면 여기 머문다.)
2. **orchestration**(메인 드라이버) — 스펙 → 작업 계획·브리프, 그리고 Task로
   아래 단계를 위임·회수:
3. **spec + design** *(1단계 게이트, 병렬)* — 계약·토큰 산출 → **커밋해 고정.**
4. **state-data + implementation×N + tester** *(2단계, 병렬 `is_background`)* —
   고정된 계약에만 의존. 끝나면 병합.
5. **accessibility** *(3단계)* — 병합 빌드 위 접근성 감사·개선.
6. **review** *(3단계 게이트, readonly)* — 전체 하네스 + 계약 대조로 PASS/FAIL.
   FAIL이면 orchestration이 소유 에이전트로 되돌려 재검증.

명시 호출은 `/spec`, `/design` 등. 자동 위임은 각 에이전트 `description`이
트리거한다. 2단계를 git worktree로까지 격리하려면 Agents Window `/worktree` 병용.
