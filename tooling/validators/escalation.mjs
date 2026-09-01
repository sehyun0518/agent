// 에스컬레이션이 끝나는지 본다.
//
// 실패 분류 넷 중 재시도만 상한이 있다. `transient.maxAttempts`가 스키마에서
// `maximum: 3`으로 묶여 있고, `action`은 분류마다 `const`라 재시도를 다른 분류에
// 붙일 수 없다. 그래서 재시도는 구조적으로 유한하다 — 단계 수가 유한하고 단계마다
// 3회 이하다.
//
// `escalate`에는 그런 것이 없다. `escalateTo`가 다른 Capability를 가리키고, 그쪽이
// 다시 이쪽을 가리키면 사슬이 돌고 아무것도 그것을 세지 않는다 (ADR-0029 · #85).
//
// 지금 여덟 개의 사슬은 전부 orchestrator에서 끝난다.
//
//   implementation → specification → requirements → orchestrator
//   test-execution → test-design   → specification → …
//
// 그런데 requirements가 implementation을 가리키게 바꿔도 아무 일도 일어나지
// 않았다. 끝난다는 것이 사실이지 규칙이 아니었다.
//
// orchestrator는 Capability가 아니라 종점이다. 조정자는 사슬을 더 넘기지 않고
// 사람에게 올린다 — 그래서 여기서 사슬이 끝난다.

const TERMINAL = 'orchestrator'

const escalationTargetOf = (capability) =>
  capability?.failure?.['contract-violation']?.escalateTo ?? TERMINAL

/**
 * 존재하지 않는 Capability로 에스컬레이션하는 선언.
 *
 * @param {Map<string, object>} capabilities
 * @returns {Array<{capability: string, escalateTo: string}>}
 */
export function findDanglingEscalations(capabilities) {
  const found = []
  for (const [id, capability] of capabilities ?? []) {
    const target = escalationTargetOf(capability)
    if (target === TERMINAL || capabilities.has(target)) continue
    found.push({ capability: id, escalateTo: target })
  }
  return found
}

/**
 * 종점에 닿지 않고 도는 에스컬레이션 사슬.
 *
 * 같은 순환을 시작점마다 다시 보고하지 않는다 — 가장 작은 id에서 시작한 것
 * 하나만 낸다. 없는 대상을 가리키는 것은 여기서 보지 않는다
 * (findDanglingEscalations가 본다).
 *
 * @param {Map<string, object>} capabilities
 * @returns {Array<{cycle: string[]}>}
 */
export function findEscalationCycles(capabilities) {
  const seen = new Set()
  const cycles = []

  for (const id of capabilities?.keys() ?? []) {
    const path = []
    let current = id

    while (current !== TERMINAL && capabilities.has(current)) {
      const at = path.indexOf(current)
      if (at !== -1) {
        const cycle = path.slice(at)
        const key = [...cycle].sort().join(' ')
        if (!seen.has(key)) {
          seen.add(key)
          // 가장 작은 id에서 시작하도록 회전한다 — 시작점이 달라도 같은 순환이다.
          const pivot = cycle.indexOf([...cycle].sort()[0])
          cycles.push({ cycle: [...cycle.slice(pivot), ...cycle.slice(0, pivot)] })
        }
        break
      }
      path.push(current)
      current = escalationTargetOf(capabilities.get(current))
    }
  }
  return cycles
}
