// 정책이 이름으로 지정한 강제 수단과 검증기가 실제로 구현한 것을 대조한다.
//
// policies/*.yaml의 enforcement.validator는 문자열이고, 이 레지스트리가 없으면 그
// 문자열이 무엇도 가리키지 않아도 아무 일이 일어나지 않는다. 연결이 코드 주석 한 줄뿐이라
// 양방향으로 조용히 어긋난다 — 정책을 지우거나 이름을 바꿔도 검사는 그대로 돌고, 정책이
// 선언한 검증기가 구현되지 않아도 아무도 모른다.
//
// 상태를 셋으로 나누는 이유는 policies/README.md가 표로 적어 둔 구분을 여기서 소유하기
// 위해서다. pending은 훅 런타임(ADR-0002)을 기다리는 것이라 "구현 안 됨"이 정상이다.
// 그것과 "이름이 어디도 가리키지 않음"은 다르고, 표를 손으로 유지하면 이 차이가 흐려진다.

/**
 * 검증기가 구현한 강제 수단.
 *
 * status
 *   implemented — 정책 statement 전부를 정적 검사가 덮는다
 *   partial     — 일부만 정적으로 강제되고 나머지는 런타임을 기다린다
 *   pending     — 정적으로 강제되는 부분이 없다
 */
export const VALIDATOR_REGISTRY = {
  'tools-within-permissions': {
    status: 'implemented',
    by: 'checkAgentPermissions — filesystem 등급 대조',
  },
  'network-within-allowlist': {
    status: 'implemented',
    by: 'checkAgentPermissions — network 등급 대조',
  },
  'destructive-requires-manual-and-approval': {
    status: 'implemented',
    by: 'checkDestructiveApproval + 워크플로 automatic 단계 검사',
  },
  'completion-requires-evidence': {
    status: 'implemented',
    by: 'checkCapabilityTokens — completion.requiresEvidence 대조',
  },
  'blocking-hooks-preserved': {
    status: 'partial',
    by: 'checkProfilePermissions — blocking 훅을 blocking:false로 낮추는 것을 막는다',
    pending: '훅 제거와 재시도 우회는 훅 런타임(ADR-0002)이 필요하다',
  },
}

/**
 * 검증기가 아닌 방식으로 정책을 강제하는 것.
 *
 * ADR-0015가 승인 선언을 플랫폼 permission 설정으로 투영하면서 강제 수단이 하나 늘었다.
 * 검증기도 훅도 아니라 위 레지스트리에 들어가지 않는데, 그대로 두면 `policies/README.md`가
 * 이 정책을 "검증기 ✅ + 훅 ⏳"로만 적게 된다 — 실제로 도는 강제가 표에 안 보이는 상태다.
 * #50이 고친 것과 같은 종류의 드리프트라 같은 방식으로 막는다.
 *
 * **플랫폼별 현황은 여기 적지 않는다.** `permissions.json`의 `unprojected`가 그것을
 * 소유하고, 여기 옮겨 적으면 두 곳이 갈라진다.
 */
export const PROJECTION_REGISTRY = {
  'destructive-approval': {
    // 정책 statement가 넷을 요구하는데 플랫폼은 첫째만 강제한다. 나머지를 pending에
    // 적지 않으면 🛡️ 가 "이 정책이 강제된다"로 읽힌다 (#46 결정 6).
    status: 'partial',
    by: 'requiresApproval 선언을 플랫폼 permission 설정으로 낸다 — 사람을 멈춰 세우는 것까지 (ADR-0015)',
    pending:
      '승인을 approval-record로 남기는 것, status가 granted인지 보는 것, 거부를 재시도로 ' +
      '우회하지 못하게 하는 것. 플랫폼 prompt는 증거를 만들지 않는다 — 훅 런타임(ADR-0002)이 필요하다',
    source: 'tooling/generators/permissions.json',
  },
}

// 아래 함수들의 전제도 같다 — 스키마를 통과한 정책만 수집되고, 호출부가 넘기는 것은
// {id, validator} 꼴로 직접 만든 객체다. 원소가 null인 경로가 없다.

/** 정책이 지정했는데 레지스트리에 없는 이름. 오타이거나 구현이 없다는 뜻이다. */
export function findUnknownValidators(policies, registry = VALIDATOR_REGISTRY) {
  return (policies ?? [])
    .filter((p) => p.validator && !Object.hasOwn(registry, p.validator))
    .map((p) => ({ policy: p.id, validator: p.validator }))
}

/**
 * 레지스트리에 있는데 어떤 정책도 가리키지 않는 이름.
 *
 * 강제 수단만 남고 근거가 사라진 상태다. 정책을 지울 때 검사를 같이 지우지 않으면
 * 무엇을 위한 검사인지 아무도 모르는 코드가 남는다.
 */
export function findUnreferencedValidators(policies, registry = VALIDATOR_REGISTRY) {
  const used = new Set((policies ?? []).map((p) => p.validator).filter(Boolean))
  return Object.keys(registry).filter((name) => !used.has(name))
}

/**
 * 레지스트리에 있는데 그런 정책이 없는 이름.
 *
 * 반대 방향은 보지 않는다 — 대부분의 정책은 투영 대상이 아니고, 투영이 없는 것이
 * 정상이기 때문이다. 썩는 쪽은 이쪽뿐이다.
 */
export function findUnknownProjections(policies, registry = PROJECTION_REGISTRY) {
  const ids = new Set((policies ?? []).map((p) => p.id))
  return Object.keys(registry).filter((id) => !ids.has(id))
}

/**
 * `policies/README.md`의 표와 레지스트리가 갈라진 곳.
 *
 * 이 표는 세 번 갈라졌다. #49는 일부만 강제되는 것을 ⏳로 적어 뒀고, #50과 이 변경은
 * 실제로 도는 강제를 표가 빠뜨린 것을 고쳤다. 단일 출처를 레지스트리로 정해 뒀지만
 * **표를 손으로 옮겨 적는 한 네 번째가 난다.**
 *
 * 표 문법에 기대는 검사라 깨지기 쉽다. 다만 깨지면 조용하지 않고 여기서 실패하므로,
 * 그때는 문법이 바뀐 것이고 이 정규식을 함께 고치면 된다.
 *
 * @param {string} markdown policies/README.md 전문
 * @returns {Array<{name: string, problem: 'not-in-registry'|'not-in-table'}>}
 */
export function findEnforcementTableDrift(markdown, registry = VALIDATOR_REGISTRY) {
  const named = new Set([...(markdown ?? '').matchAll(/validator `([a-z][a-z0-9-]*)`/g)].map((m) => m[1]))
  const known = new Set(Object.keys(registry))

  return [
    ...[...named].filter((n) => !known.has(n)).map((name) => ({ name, problem: 'not-in-registry' })),
    ...[...known].filter((n) => !named.has(n)).map((name) => ({ name, problem: 'not-in-table' })),
  ]
}
