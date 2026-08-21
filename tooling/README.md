# tooling/

선언을 검사하고 플랫폼 미러를 만드는 도구. 하네스의 **런타임이 아니다** —
Capability를 실행하는 코드는 ADR-0002 이후에 생긴다.

```sh
npm run validate   # 선언 검증
npm run generate   # 미러 생성
npm run check      # 검증 + 드리프트 검사 (CI가 도는 것)
```

## validators/

`validate.mjs` 하나가 모든 선언을 검사한다.

| 검사 | 무엇을 막는가 |
|---|---|
| JSON Schema | 필드 누락·타입 오류·`policy-denied`를 retry로 바꾸기 |
| 코어 어휘 등록 | `specification.complete` 같은 오타가 런타임까지 흘러가는 것 |
| 증거 status | 등록되지 않은 status로 전이 조건을 쓰는 것 |
| completion ⊆ evidence | 선언하지 않은 증거를 완료 조건으로 요구하는 것 |
| 참조 무결성 | 없는 파일을 가리키는 진입점 |
| 2계층 권한 | 도구가 `permissions`를 넘는 것 (`filesystem-boundary`·`network-access`) |
| 파괴적 작업 승인 | `destructive: true`인데 승인·증거 선언이 없는 것 |
| 프로파일 권한 축소 | 프로파일이 Capability보다 넓은 권한을 주는 것 |
| blocking 훅 보존 | 프로파일이 게이트 훅을 `blocking: false`로 낮추는 것 |
| 조정자 순수성 | 도메인 지식이 오케스트레이터 본체로 새는 것 |
| 레이어 독립성 | 레이어 본문이 이웃 레이어 이름을 아는 것 (ADR-0003) |
| 게이트 참조 | 워크플로가 없는 이관 게이트를 가리키는 것 |
| 워크플로 교차 검증 | 변형 미지정(층 합치기)·자동 진행 금지 위반·산출 확대 |

정책 파일이 선언한 `enforcement.validator` 중 여기 구현된 것은
`policies/README.md`의 ✅ 표시를 본다. ⏳ 는 훅 런타임이 필요하다.

## generators/

`generate.mjs`가 `capabilities/` + `profiles/` + `packages/orchestrator/`를 읽어
`.claude` · `.codex`를 만든다.

- **에이전트 frontmatter는 manifest에서 나온다.** 소스 `.md`에 frontmatter가 남아
  있으면 오류다.
- **규칙 팩은 디렉터리 전체를 옮긴다.** `SKILL.md`만 옮기면 `rules/`가 드리프트 검사
  밖으로 나간다.
- **고아를 지운다.** 소스에 대응이 없는데 관리 디렉터리에 남은 파일은 제거한다.
  이름이 바뀐 역할의 옛 파일을 플랫폼이 계속 읽는 것을 막는다.
- **멱등이다.** 두 번 돌려도 결과가 같고, 지우고 다시 만들어도 같다.

플랫폼별 출력 경로·모델 티어 매핑은 `platforms.json`에 있다.

## ci/

없다. CI는 `.github/workflows/harness.yml`에 둔다. 별도 디렉터리를 만들면 실제로
도는 것과 문서상 있는 것이 갈라진다.

## 미러를 손으로 고치면

되돌아간다. CI가 재생성 결과와 커밋 상태를 대조하고 다르면 병합을 막는다.
고치려면 소스를 고치고 다시 생성한다.
