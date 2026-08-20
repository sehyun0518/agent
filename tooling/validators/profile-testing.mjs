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
