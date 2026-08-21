/**
 * 프로파일이 이름으로 부르는 실행자가 실재하는지 해석한다.
 *
 * 해석 규칙은 새로 만든 것이 아니다. `checkWorkflowExtensions`가 함수 안에서 만들던
 * 집합과 같고, profile.schema.json이 `roster[].runner`에 적어 둔 설명
 * ("capability id, <capability>#<variant>, 또는 프로파일 agent id")과도 같다.
 * 같은 규칙을 세 곳이 따로 알고 있으면 한 곳만 고쳐지므로 여기로 모은다.
 */

/**
 * @param {Map<string, any>|Iterable<[string, any]>} capabilities capability id → manifest
 * @param {Array<{id: string}>} agents 프로파일이 선언한 도메인 전용 역할
 * @returns {Set<string>} 실행자로 쓸 수 있는 이름 전체
 */
export function resolveRunners(capabilities, agents = []) {
  const entries = capabilities instanceof Map ? capabilities : new Map(capabilities)
  const runners = new Set([...entries.keys(), ...agents.map((agent) => agent.id)])
  for (const [id, capability] of entries) {
    for (const variant of Object.keys(capability?.variants ?? {})) runners.add(`${id}#${variant}`)
  }
  return runners
}

/**
 * roster와 routing이 부르는 이름 중 해석되지 않는 것을 모은다.
 *
 * 오케스트레이터는 roster를 통해서만 실행자 이름을 알고, 판정 결과는 routing이 정한
 * 소유자로 되돌아간다. 둘 중 하나라도 실재하지 않는 이름을 담고 있으면 그 경로는
 * 런타임에 끊긴다 — 선언 시점에 잡는다.
 *
 * @param {{roster?: Array, routing?: Array}} profile
 * @param {Set<string>} runners resolveRunners의 결과
 * @returns {Array<{field: string, index: number, name: string, label: string}>}
 */
export function findUnresolvedRunners(profile, runners) {
  const problems = []

  for (const [index, entry] of (profile.roster ?? []).entries()) {
    if (!runners.has(entry.runner)) {
      problems.push({ field: 'roster', index, name: entry.runner, label: entry.unit })
    }
  }

  for (const [index, entry] of (profile.routing ?? []).entries()) {
    if (!runners.has(entry.owner)) {
      problems.push({ field: 'routing', index, name: entry.owner, label: entry.symptom })
    }
  }

  return problems
}
