export function createWorkflowGraph(steps) {
  const duplicates = []
  const byId = new Map()
  for (const step of steps) {
    if (byId.has(step.id)) duplicates.push(step.id)
    byId.set(step.id, step)
  }

  const unknownDependencies = []
  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!byId.has(dependency)) unknownDependencies.push({ step: step.id, dependency })
    }
  }

  const cycles = []
  const cache = new Map()
  function ancestorsOf(id, trail = []) {
    if (cache.has(id)) return cache.get(id)
    const cycleAt = trail.indexOf(id)
    if (cycleAt !== -1) {
      cycles.push([...trail.slice(cycleAt), id])
      return new Set()
    }
    const ancestors = new Set()
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      ancestors.add(dependency)
      for (const ancestor of ancestorsOf(dependency, [...trail, id])) ancestors.add(ancestor)
    }
    cache.set(id, ancestors)
    return ancestors
  }

  const producers = new Map()
  for (const step of steps) {
    for (const token of step.produces ?? []) {
      const ids = producers.get(token) ?? []
      ids.push(step.id)
      producers.set(token, ids)
    }
  }

  for (const step of steps) ancestorsOf(step.id)

  return {
    duplicates,
    unknownDependencies,
    cycles,
    ancestorsOf,
    producerIds(token) {
      return producers.get(token) ?? []
    },
    hasAncestorProducer(stepId, token) {
      return (producers.get(token) ?? []).some((producer) => ancestorsOf(stepId).has(producer))
    },
  }
}
