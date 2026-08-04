# policies/

개별 정책 문서. 스키마와 **해석 우선순위**는 `packages/policy-contracts/`가 소유한다.

```text
변경 불가능한 공통 보안 정책 (level: immutable)
        ↓  이길 수 없음
저장소 로컬 Profile (kind: repository)
        ↓  이길 수 없음
Capability 기본 설정
```

좁히는 방향으로만 이긴다. 프로파일은 `level: default` 정책을 더 엄격하게 만들 수 있지만,
`level: immutable` 정책은 완화할 수 없다.

## 불변 정책 7종

| scope | id | 강제 수단 |
|---|---|---|
| permissions | `filesystem-boundary` | validator `tools-within-permissions` ✅ |
| permissions | `network-access` | validator `network-within-allowlist` ✅ |
| permissions | `required-verification-hooks` | validator `blocking-hooks-preserved` ⏳ |
| data-handling | `secrets-redaction` | blocking hook (`on-evidence`·`before-tool`) ⏳ |
| data-handling | `sensitive-data-storage` | blocking hook (`on-evidence`) ⏳ |
| data-handling | `audit-trail` | validator `completion-requires-evidence` ✅ + hook ⏳ |
| destructive-actions | `destructive-approval` | validator ✅ + blocking hook ⏳ |

✅ 은 `npm run validate`에서 실제로 도는 검사, ⏳ 은 훅 런타임(ADR-0002)이 필요한 것이다.
선언만 있고 몸이 없는 상태를 표로 드러내 둔다 — 강제되지 않는 정책을 강제되는 것처럼
읽지 않기 위해서다.

## 정책을 쓸 때

- `enforcement`가 비면 스키마가 거부한다. 강제 수단 없는 정책은 만들지 않는다.
- `statement`는 판정 가능한 문장으로 쓴다. "안전하게 다룬다"는 게이트가 될 수 없다.
- `level: immutable`이면 `relaxable`은 반드시 `false`다. 스키마가 검사한다.
