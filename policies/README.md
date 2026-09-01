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
| permissions | `required-verification-hooks` | validator `blocking-hooks-preserved` 🟡 |
| data-handling | `secrets-redaction` | blocking hook (`on-evidence`·`before-tool`) ⏳ |
| data-handling | `sensitive-data-storage` | blocking hook (`on-evidence`) ⏳ |
| data-handling | `audit-trail` | validator `completion-requires-evidence` ✅ + hook ⏳ |
| destructive-actions | `destructive-approval` | validator `destructive-requires-manual-and-approval` ✅ + 플랫폼 투영 🛡️ + blocking hook ⏳ |

✅ 은 `npm run validate`에서 실제로 도는 검사, 🟡 는 일부만 정적으로 강제되고 나머지가
런타임을 기다리는 것, 🛡️ 는 **플랫폼의 permission 런타임이 강제하는 것**, ⏳ 은 훅
런타임(ADR-0002)이 필요한 것이다. 선언만 있고 몸이 없는
상태를 표로 드러내 둔다 — 강제되지 않는 정책을 강제되는 것처럼 읽지 않기 위해서다.

`blocking-hooks-preserved`가 🟡 인 이유: 프로파일이 blocking 훅을 `blocking:false`로
낮추는 것은 검증기가 막는다. 훅 제거와 재시도 우회는 아직 막지 못한다.

🛡️ 는 이 저장소가 만든 강제가 아니다. `requiresApproval` 선언을 플랫폼 설정으로 내고
플랫폼이 그것을 집행한다(ADR-0015). **강제 수준은 플랫폼마다 다를 수 있다.** 어느
플랫폼이 투영되고 무엇이 왜 빠졌는지는 `tooling/generators/permissions.json`이 소유한다 —
투영하지 않는 플랫폼은 거기 사유와 함께 적히고, 사유 없이 비어 있으면 생성이 실패한다.

**여기 옮겨 적지 않는다.** 현황을 두 곳에 적으면 한 곳은 반드시 낡는다 — 이 문단이
실제로 그렇게 낡아서 지웠다.

**이 표의 단일 출처는 `tooling/validators/policy-enforcement.mjs`의 레지스트리다.**
검증기 축은 `VALIDATOR_REGISTRY`가, 그 밖의 강제 수단은 `PROJECTION_REGISTRY`가 갖는다.
`enforcement.validator`가 실재하는 검사를 가리키는지, 레지스트리에만 있고 근거 정책이
사라진 검사가 없는지를 `npm run validate`가 대조한다. 전에는 정책과 검사의 연결이 코드
주석 한 줄뿐이라 양쪽 어디가 어긋나도 조용했다 — 이 표가 ⏳ 로 적어 둔 것 하나가 실제로는
일부 강제되고 있었던 것이 그 증거다.

## 정책을 쓸 때

- `enforcement`가 비면 스키마가 거부한다. 강제 수단 없는 정책은 만들지 않는다.
- `statement`는 판정 가능한 문장으로 쓴다. "안전하게 다룬다"는 게이트가 될 수 없다.
- `level: immutable`이면 `relaxable`은 반드시 `false`다. 스키마가 검사한다.
