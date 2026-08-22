/**
 * 수동 실행 대상을 계약에서 유도한다.
 *
 * 중앙 목록을 두지 않는다. 커맨드로 낼 것을 따로 선언하면 선언과 계약이 어긋날 수
 * 있고, 새 변형을 넣으면서 목록을 안 고치면 조용히 빠진다(ADR-0001).
 *
 * 세 축에서 유도한다.
 *   1. chaining.autoTriggerable이 false인 Capability의 각 변형
 *   2. workflowExtensions에 삽입되지 않은 프로파일 역할
 *   3. (범위 밖) 워크플로 진입점 — 실행 엔진이 없어 미룬다
 */

/** `git-operations#pr-create` → `git-pr-create` */
function shortId(capabilityId, variant) {
  const head = capabilityId.replace(/-operations$/, '').replace(/^project-design$/, 'project')
  return `${head}-${variant}`
}

/**
 * @param {Map<string, any>|Iterable<[string, any]>} capabilities
 * @returns {Array<{name, kind, capability, variant, title, description}>}
 */
export function commandsFromCapabilities(capabilities) {
  const entries = capabilities instanceof Map ? capabilities : new Map(capabilities)
  const out = []
  for (const [id, capability] of entries) {
    // 워크플로가 자동 단계로 둘 수 없는 것 = 사람이 직접 부르는 것.
    if (capability?.chaining?.autoTriggerable !== false) continue
    for (const [variant, scope] of Object.entries(capability.variants ?? {})) {
      out.push({
        name: shortId(id, variant),
        kind: 'variant',
        capability: id,
        variant,
        title: scope.title ?? variant,
        description: (scope.description ?? capability.description ?? '').trim(),
      })
    }
  }
  return out
}

/**
 * 삽입 지점이 없는 프로파일 역할은 어느 워크플로에도 들어가지 않는다.
 * 그것이 곧 수동 전용이라는 선언이다(ADR-0010).
 *
 * @param {{agents?: Array, workflowExtensions?: Array}} profile
 * @returns {Array<{name, kind, runner, title, description}>}
 */
export function commandsFromProfile(profile) {
  const inserted = new Set(
    (profile.workflowExtensions ?? []).flatMap((e) => (e.insert ?? []).map((i) => i.runner)),
  )
  return (profile.agents ?? [])
    .filter((agent) => !inserted.has(agent.id))
    .map((agent) => ({
      name: agent.id.replace(/^project-design-/, 'project-'),
      kind: 'agent',
      runner: agent.id,
      title: agent.id,
      description: (agent.description ?? '').trim(),
    }))
}

/** 이름이 겹치면 어느 쪽이 불릴지 알 수 없다. 생성 전에 잡는다. */
export function findDuplicateCommands(commands) {
  const seen = new Map()
  const dupes = []
  for (const c of commands) {
    if (seen.has(c.name)) dupes.push({ name: c.name, sources: [seen.get(c.name), sourceOf(c)] })
    else seen.set(c.name, sourceOf(c))
  }
  return dupes
}

function sourceOf(c) {
  return c.kind === 'variant' ? `${c.capability}#${c.variant}` : c.runner
}
