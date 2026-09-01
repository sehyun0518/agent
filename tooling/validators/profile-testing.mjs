export function resolveTestingLayers(domainLayers = {}, repositoryLayers = {}) {
  const resolved = {}
  for (const layer of new Set([...Object.keys(domainLayers), ...Object.keys(repositoryLayers)])) {
    // 계층 내부를 merge하면 서로 다른 스택의 라이브러리와 패턴이 섞인다.
    resolved[layer] = structuredClone(repositoryLayers[layer] ?? domainLayers[layer])
  }
  return resolved
}

export function librarySignature(layer) {
  return JSON.stringify(layer?.libraries ?? [])
}

// 계층은 러너를 두거나(libraries) 문서화된 수동 절차로 검증하거나(manual) 둘 중
// 하나다 (ADR-0013). 스키마는 "적어도 하나"까지만 보고, 여기서 나머지를 본다 —
// 모순과 누락을 사람이 읽을 수 있는 문장으로 내기 위해서다.

/**
 * @param {Record<string, {libraries?: string[], manual?: object}>} testLayers
 * @param {Record<string, unknown>} commands 프로파일의 commands 맵
 * @param {string} kind 프로파일 kind ('domain' | 'repository')
 * @returns {Array<{layer: string, problem: 'both-runner-and-manual'|'manual-with-command'|'missing-command'}>}
 */
export function findTestLayerConflicts(testLayers, commands, kind) {
  const problems = []
  for (const [layer, config] of Object.entries(testLayers ?? {})) {
    const manual = Boolean(config?.manual)
    const hasLibraries = (config?.libraries ?? []).length > 0
    const hasCommand = Boolean(commands?.[`test.${layer}`])

    // 러너가 있는데 수동으로 하겠다는 뜻이 된다. 어느 쪽이 진짜인지 알 수 없다.
    if (manual && hasLibraries) problems.push({ layer, problem: 'both-runner-and-manual' })
    if (manual && hasCommand) problems.push({ layer, problem: 'manual-with-command' })

    // manual은 러너가 없는 것이 선언의 내용이므로 명령을 요구하지 않는다.
    if (kind === 'repository' && !manual && !hasCommand) {
      problems.push({ layer, problem: 'missing-command' })
    }
  }
  return problems
}
