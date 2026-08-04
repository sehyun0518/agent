# policy-contracts

정책 스키마와 **해석 우선순위**의 단일 출처. 정책 자체(개별 `.yaml`)는 `policies/`에 둔다.

## 우선순위

```text
변경 불가능한 공통 보안 정책 (level: immutable)
        ↓  이길 수 없음
저장소 로컬 Profile (kind: repository)
        ↓  이길 수 없음
Capability 기본 설정 (capability.yaml)
```

해석 규칙은 하나다. **좁히는 방향으로만 이긴다.**

- 프로파일은 Capability의 권한을 **축소**할 수 있다. 확대는 검증기가 거부한다.
- 프로파일은 `level: default` 정책을 대체하거나 더 엄격하게 만들 수 있다.
- 프로파일은 `level: immutable` 정책을 완화할 수 없다. 같은 id로 재선언하면 검증 실패다.

## 완화 불가 항목

`level: immutable`로 선언되며, 어떤 프로파일도 되돌릴 수 없다.

| 영역 | 항목 |
|---|---|
| data-handling | 비밀정보 제거 |
| data-handling | 민감 데이터 저장 제한 |
| permissions | 파일 시스템 경계 |
| permissions | 외부 네트워크 접근 제한 |
| destructive-actions | 파괴적 작업 승인 |
| — | 감사 기록 |
| — | 필수 검증 훅 |

## 권한 축소 판정

의미 권한은 순서가 있는 격자다. 프로파일 값은 Capability 값보다 **작거나 같아야** 한다.

```text
filesystem:  none < read < write
network:     none < allowlist < any
destructive: false < true
```

`networkAllowlist`는 부분집합이어야 한다. Capability가 `network: none`인데 프로파일이
`allowlist`를 선언하면 확대이므로 거부한다.

## 2계층 권한 검사

`capability.yaml`의 의미 권한과 각 에이전트의 구체 도구 목록은 따로 선언되고, 검증기가
둘을 대조한다. 도구가 의미 권한을 넘으면 실패다.

| 도구 | 요구하는 최소 권한 |
|---|---|
| `Read` · `Grep` · `Glob` | `filesystem: read` |
| `Write` · `Edit` · `NotebookEdit` | `filesystem: write` |
| `WebFetch` · `WebSearch` | `network: allowlist` 이상 |
| `Bash` | `filesystem: read` (파괴적 명령은 destructive-actions 정책이 별도로 본다) |
| MCP 도구 | 서버별로 `tooling/validators`의 매핑표를 따른다 |

이 매핑이 있어야 생성기가 `.claude/agents/*.md`의 `tools:` frontmatter를 만들면서
동시에 정책 위반을 잡을 수 있다.

## 정책을 쓸 때

- 강제 수단 없는 정책은 만들지 않는다. `enforcement`에 `validator` 또는 blocking `hooks`가
  최소 하나는 있어야 스키마를 통과한다.
- `statement`는 판정 가능한 문장으로 쓴다. "안전하게 다룬다" 같은 문장은 게이트가 될 수 없다.
- 승인이 필요한 정책은 `requiresApproval: true`와 `approval-record` 증거를 함께 선언한다.
