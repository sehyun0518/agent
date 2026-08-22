# profiles/

도메인 무관 Capability에 **도메인 지식을 바인딩**하는 곳. 프로파일을 교체하면 같은
Capability가 다른 도메인에서 돈다.

## 두 종류

| kind | 사는 곳 | 소유 |
|---|---|---|
| `domain` | 이 저장소의 `profiles/<id>/` | 공용 하네스 |
| `repository` | 소비 저장소의 `.agent-harness/` | 소비 저장소 |

둘 다 `packages/manifest-contracts/profile.schema.json`을 쓴다. 차이는 역할이다.
도메인 프로파일이 **로스터·DAG·라우팅**을 소유하고, 저장소 프로파일은 **명령·컨벤션·
권한 축소**를 제공한다.

## 무엇을 담는가

```text
profiles/<id>/
├─ profile.yaml     namespace · agents · skills · bindings · roster · dag · routing
├─ agents/          이 도메인에만 존재하는 역할
├─ skills/          도메인 규칙 팩과 패턴 스킬
└─ knowledge/       느리게 변하는 도메인 상수 문서 (참조만, 인라인 금지)
```

## 바인딩

Capability는 `profileExtensible`로 무엇을 주입받을지 선언하고, 프로파일은 그 축만
채운다. 허용되지 않은 축을 건드리면 검증기가 거부한다.

```yaml
bindings:
  - capability: implementation
    skillsOneOf:                    # 택일 — 혼용 금지를 스키마가 표현한다
      - frontend:react-best-practice
      - frontend:react-native-skills
    tools: [mcp__playwright]        # permissions 상한을 넘으면 거부
```

`skills`는 항상 함께 주입되고, `skillsOneOf`는 실행 시 타깃을 판별해 하나만 고른다.
서로 다른 실행 환경을 전제한 규칙 팩을 섞으면 둘 다 틀린 코드가 나오기 때문이다.

## 권한은 좁힐 수만 있다

```text
filesystem:  none < read < write
network:     none < allowlist < any
destructive: false < true
```

프로파일 값이 Capability 값보다 크면 검증기가 거부한다. 불변 정책(`level: immutable`)은
어떤 프로파일도 완화할 수 없다. 자세한 건 `packages/policy-contracts/README.md`.

## 확장 토큰

프로파일은 `namespace`를 선언하고 그 아래 토큰을 중앙 등록 없이 만든다.

```yaml
namespace: frontend
# → frontend:design.tokens-frozen, frontend:a11y.axe-result ...
```

코어 어휘(`docs/vocabulary.md`)를 건드리지 않고 도메인 증거를 늘릴 수 있는 이유다.

## 현재 프로파일

| id | 담는 것 |
|---|---|
| `frontend` | design·accessibility·state-data 역할, project-design 3종(수동), React/RN/Lynx 규칙 팩, Lynx 레퍼런스, 컴포넌트 API 패턴 스킬, 워크플로 확장 3건 |
