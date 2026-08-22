# ADR-0008: 3자 스킬은 원본과 바이트 일치로 벤더링한다

- 상태: accepted
- 날짜: 2026-08-22
- 관련 이슈: #26 · #28 · #29
- 관련 PR: #24 · #27 · #30

## 배경

`profiles/frontend/skills/` 아래 15개 중 **7개가 남의 저장소에서 복사해 온 것**이다.
문서 179개이고 미러 두 벌을 세면 537개다.

| 스킬 | 출처 | 라이선스 | 파일 |
|---|---|---|---:|
| `react-best-practice` | Vercel | MIT | 72 |
| `react-native-skills` | Vercel | MIT | 38 |
| `lynx-api-docs` | lynx-community | Apache-2.0 | 37 |
| `rspeedy-bundle-size` | lynx-community | Apache-2.0 | 13 |
| `reactlynx-best-practices` | lynx-community | Apache-2.0 | 10 |
| `vanilla-lynx` | lynx-community | Apache-2.0 | 8 |
| `lynx-typescript` | lynx-community | Apache-2.0 | 1 |

보통은 의존성으로 설치한다. 스킬은 npm 패키지가 아니라 마크다운 파일이고, 에이전트가
`.claude/skills/`에서 읽어야 하므로 저장소 안에 있어야 한다. 그래서 복사한다.

규칙이 없어서 세 번 어겼다.

1. #24가 `markdownlint --fix`를 `profiles/**/*.md`에 돌려 Vercel 파일 7개를 고쳤다.
   지금도 main에 남아 있다(#28).
2. #27에서 규칙 문서를 옮겨 적다가 9개 중 5개를 건드렸다. 목록 앞 빈 줄과 em dash다.
   원본을 다시 받아 교체했다.
3. #27에서 "스킬에 실행 코드를 두지 않는다"를 근거로 에셋을 뺐는데, 그런 규칙이
   저장소에 없었다. #30에서 되돌렸다.

## 결정

### 1. 원본과 바이트 일치를 유지한다

벤더링한 파일은 저장소에 있지만 우리 것이 아니다. 손대면 **무엇이 상류 변경이고
무엇이 우리 수정인지 구분되지 않는다.** 다음 동기화에서 충돌하거나 우리 수정이 조용히
사라진다.

### 2. 무엇을 무엇과 비교하는가

"바이트 일치"만으로는 부족하다. 같은 파일에 우리 내용을 더하도록 허용하면 그 파일은
**항상** 상류와 다르고, 정상 상태와 로컬 드리프트를 구분할 수 없다.

파일을 세 종류로 나눈다.

| 종류 | 무엇 | 비교 범위 |
|---|---|---|
| A | `rules/`·`references/`·`assets/` 등 `SKILL.md`가 아닌 모든 파일 | **파일 전체** |
| B | 상류 본문을 그대로 담은 `SKILL.md` | **마커 사이 구간만** |
| C | 이 저장소가 새로 쓴 `SKILL.md` | **비교하지 않음** |

현재 분포다.

```text
A  172개  전부 일치
B    6개  vanilla-lynx · lynx-api-docs · lynx-typescript · rspeedy-bundle-size
          react-best-practice · react-native-skills
C    1개  reactlynx-best-practices
```

#### 종류 A — 파일 전체

예외 없이 상류와 바이트 단위로 같아야 한다. 오타도 고치지 않는다.

#### 종류 B — 마커로 경계를 고정한다

상류 본문을 HTML 주석으로 감싼다. 렌더링에 보이지 않고 마크다운 의미도 바꾸지 않는다.

```markdown
---
name: vanilla-lynx
description: ...        ← 상류 키
license: Apache-2.0     ← 우리 키
metadata: ...           ← 우리 키
---

> **⚠️ ...** 배너        ← 우리 것

<!-- vendored:begin -->
...상류 본문 그대로...
<!-- vendored:end -->

## 출처                  ← 우리 것
```

검증기는 `<!-- vendored:begin -->` 다음 줄부터 `<!-- vendored:end -->` 앞 줄까지를 떼어
상류 `SKILL.md`의 frontmatter 이후 본문(앞뒤 개행 제거)과 대조한다.

frontmatter는 따로 본다. **상류 키는 값까지 같아야 하고, 이 저장소가 더할 수 있는 키는
`license`와 `metadata` 둘뿐이다.** 상류 키를 고치거나 지우는 것은 드리프트다.

마커 밖은 전부 우리 것이다 — 배너와 `출처` 절.

#### 종류 C — 비교 대상이 아니다

`reactlynx-best-practices`의 `SKILL.md`는 상류 본문(8472B)을 그대로 쓰지 않고 이
저장소가 다시 썼다(4057B). 규칙 표와 체크리스트를 한국어로 정리하고, 가져오지 않은
스캐너 실행 절차를 뺐다.

이런 경우 `metadata`에 표시하고 `출처` 절에 무엇을 다시 썼는지 적는다. 마커를 넣지
않는다 — 넣을 상류 본문이 없기 때문이다.

**종류 C는 최소화한다.** 상류 본문을 그대로 쓸 수 있으면 B로 한다. C는 상류 본문이 이
저장소에 없는 것(스캐너 실행 절차 등)을 전제할 때만 쓴다.

#### 정규화 규칙

비교는 **정확히** 한다. 공백 제거도, 대소문자 무시도, 줄 끝 정리도 하지 않는다.

- 줄바꿈은 LF로 고정한다.
- 파일은 개행 하나로 끝난다.
- 마커 구간을 뗄 때 앞뒤 개행 하나씩만 벗긴다. 그 외 손대지 않는다.

이 규칙이 없으면 편집기 설정 차이가 드리프트로 보이거나 반대로 실제 드리프트가
정규화에 묻힌다.

### 3. 고칠 것이 있으면 상류에서 고친다

문서에 결함이 있으면 원본 저장소에 이슈나 PR을 낸다. 우리 복사본을 고치지 않는다.
고쳐지면 다음 동기화에서 받는다.

선례로 `vanilla-lynx`의 description이 존재하지 않는 `rspeedy-bundle-quality`를
가리키는 것을 [lynx-community/skills#142](https://github.com/lynx-community/skills/pull/142)로
올렸다.

다만 모든 결함을 상류에 올리지는 않는다. 예제 코드에 선언되지 않은 식별자가 있다는
지적이 있었는데, 그 컬렉션은 전체가 부분 조각으로 예제를 쓴다
(`detect-background-only.md`에는 `import`가 한 줄도 없다). 한 파일만 고치면 형제
문서들과 어긋나고, 전부 고치자는 건 문서를 새로 쓰라는 제안이 된다. **명백한 사실
오류는 올리고 스타일 논쟁은 올리지 않는다.**

### 4. 서식 검사에서 제외한다

`.markdownlint-cli2.jsonc`의 `ignores`에 벤더링 팩을 넣는다.

```jsonc
"**/skills/react-best-practice/**",
"**/skills/react-native-skills/**",
"**/skills/reactlynx-best-practices/**",
"**/skills/vanilla-lynx/**",
"**/skills/lynx-api-docs/**",
"**/skills/lynx-typescript/**",
"**/skills/rspeedy-bundle-size/**"
```

바이트 일치가 서식보다 중요하다. 검사 대상이 488개에서 104개로 줄지만, 빠진 384개가
전부 3자 문서다.

이 저장소가 더한 배너와 `출처` 절도 함께 빠진다. 감수한다.

### 5. `metadata.source`에 저장소·브랜치·경로를 적는다

```yaml
metadata:
  author: lynx-community
  source: https://github.com/lynx-community/skills/tree/release/skills/vanilla-lynx
  version: "1.0.0"
```

브랜치가 중요하다. lynx-community/skills는 기본 브랜치가 `release`이고 스킬 경로가
`skills/`인데, `main`에는 같은 내용이 `packages/skills/`에 있다. 어느 쪽을 봤는지
적어두지 않으면 다음 동기화 때 다른 곳을 본다.

Vercel 팩 2개에는 이 필드가 없어 원본을 찾지 못했다. #28에서 찾아 채웠다 —
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)의
`skills/react-best-practices`와 `skills/react-native-skills`다.

### 6. 실행 코드를 포함할 수 있다

#27에서 "이 저장소는 스킬에 실행 코드를 두지 않는다"를 근거로 에셋을 뺐다. **그런
규칙이 없었다.**

- ADR-0002는 하네스 자체(오케스트레이터·실행 엔진)의 실행 코드화 조건이지 스킬에
  딸린 도구를 다루지 않는다.
- `profile.schema.json`의 `skills`는 `id`·`path`·`description`만 요구하고 내용을
  제약하지 않는다.
- 생성기 `skillFiles()`는 파일 종류를 가리지 않고 재귀 복사한다.

에셋 없이 문서만 가져오면 `SKILL.md`가 없는 파일을 가리켜 반쪽이 된다.

현재 `rspeedy-bundle-size/references/assets/` 7개가 유일한 비마크다운 파일이다. 그중
에이전트가 실제로 실행하는 것은 `scan-levers.mjs` 하나이고 나머지는 사용자 프로젝트에
꽂는 템플릿과 변환 스크립트다.

**판단 기준은 "실행 코드인가"가 아니라 "그것 없이 문서가 성립하는가"다.**
`reactlynx-best-practices`의 `scripts/index.mjs`는 여전히 가져오지 않는다. 원본이
"완전한 파서가 아니며 코드 리뷰를 대체하지 않는다"고 적어뒀고, 규칙 문서만으로 목적을
달성한다.

### 7. 가져오지 않은 것을 `출처` 절에 남긴다

컬렉션의 일부만 가져오면 남은 참조가 끊긴다. 조용히 끊기지 않도록 각 `SKILL.md`의
`출처` 절에 **무엇을 왜 안 가져왔는지** 적는다.

#27에서 이걸 안 해서 `lynx-devtool`·`lynx-typescript`·`lynx-api-docs`·
`rspeedy-bundle-size` 넷이 끊긴 채 머지됐다(#29). 셋은 #30에서 가져왔고 `lynx-devtool`은
`출처` 절에 명시했다.

## 결과

- 상류가 갱신되면 `diff`로 무엇이 바뀌었는지 볼 수 있다.
- 3자 문서를 고치는 것과 우리 문서를 고치는 것이 구분된다.
- 문서 결함이 상류로 흘러가 다른 사용자도 혜택을 본다.
- 일부만 가져와도 남은 참조가 어디로 갔는지 읽는 쪽이 알 수 있다.

## 현재 강제 범위

**바이트 일치를 검사하는 도구가 없다.** 지금은 사람이 `md5`로 대조한다. 벤더링 파일을
고쳐도 CI가 알려주지 않는다.

기계로 강제하려면 각 팩의 `metadata.source`를 읽어 상류와 대조하는 검사가 필요하다.
결정 2가 그 검사의 입력을 고정한다 — 종류 A는 파일 전체, 종류 B는 마커 구간과 상류 키,
종류 C는 제외. 정규화 규칙도 거기 있다.

네트워크에 의존하므로 `npm run check`가 아니라 별도 스크립트나 정기 작업이 맞다.
지금은 일곱 팩 모두 `source`가 있어 검사 대상이 된다.

마커를 지우거나 옮기는 것도 지금은 아무도 막지 않는다. 마커가 없으면 종류 B가 종류 C로
조용히 바뀐다.

또한 **벤더링 팩과 자체 제작 스킬을 구분하는 표식이 `metadata.author`뿐이다.**
자체 제작 8개에는 그 필드가 없다는 관행에 기대고 있고 검증기가 보지 않는다.
