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
