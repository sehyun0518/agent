// 소비 저장소가 테스트 계층을 어떻게 쓰는지 안 적었을 때 도메인 프로파일의 것을
// 알려준다.
//
// **막지 않는다.** 저장소가 자기 도구를 고르는 자리이고, 하네스가 `vitest`를 아는
// 순간 도메인 무관이라는 주장이 무너진다 (`AGENT.md`). 그래서 하네스가 아니라
// **도메인 프로파일이 출처**다 — 하네스는 "frontend는 이렇게 쓴다"를 옮길 뿐이다.
//
// 실제 저장소가 이 상태였다. blog가 명령 넷(`test.unit`·`test.ui`·…)을 선언하고
// `testing.layers`는 하나도 안 적었다. **아무도 아무 말을 안 했다.**
//
// 그래서 두 곳이 곤란해진다.
//
//   - 테스트를 **쓰는** 단계(`test-design`)가 vitest인지 jest인지 모른다
//   - 브리핑이 도메인의 값을 저장소의 것처럼 보여준다 — 어느 쪽인지 구분이 없다
//
// 어느 도메인인지는 정하지 않는다. 소비 프로파일에 도메인을 가리키는 자리가 없고,
// 하네스가 "이 저장소는 프론트엔드"라고 단정하면 그것이 곧 도메인을 아는 것이다.
// **있는 도메인을 전부 출처와 함께 보여주고 고르는 것은 사람이 한다.**

/** 이 계층에 대해 프로파일이 선언한 것. 없으면 null. */
const layerOf = (profile, layer) => profile?.testing?.layers?.[layer] ?? null

/** `commands`에서 `test.<layer>` 키의 계층 이름만 뽑는다. */
export function testLayersInCommands(commands) {
  return Object.keys(commands ?? {})
    .map((key) => /^test\.([a-z][a-z0-9-]*)$/.exec(key)?.[1])
    .filter(Boolean)
}

/**
 * 명령은 선언했는데 계층 규약이 없는 자리와, 도메인이 제안하는 것.
 *
 * 도메인이 그 계층을 안 갖고 있으면 제안이 비고, 그때는 **제안 없이 빠졌다는 것만**
 * 말한다 — 지어내지 않는다.
 *
 * @param {{id?: string, kind?: string, commands?: object, testing?: object}} consumer
 * @param {Array<{id?: string, kind?: string, testing?: object}>} profiles 도메인 후보
 * @returns {Array<{layer: string, suggestions: Array<{from: string, libraries?: string[], filePatterns?: string[]}>}>}
 */
export function findLayerAdvice(consumer, profiles) {
  if (consumer?.kind !== 'repository') return []

  const advice = []
  for (const layer of testLayersInCommands(consumer.commands)) {
    if (layerOf(consumer, layer)) continue

    const suggestions = []
    for (const profile of profiles ?? []) {
      // id로 가른다. 같은 파일이어도 따로 파싱하면 다른 객체다 (#99 리뷰).
      if (profile?.kind !== 'domain' || profile?.id === consumer?.id) continue
      const found = layerOf(profile, layer)
      if (!found || found.manual) continue
      const libraries = found.libraries ?? []
      const filePatterns = found.filePatterns ?? []
      // 둘 다 비면 보여줄 것이 없다. 빈 제안은 "…은 이렇게 쓴다 — "로 끝나서
      // 무엇을 말하려는지 알 수 없다 (#99 리뷰).
      if (libraries.length === 0 && filePatterns.length === 0) continue
      suggestions.push({ from: profile.id, libraries, filePatterns })
    }
    advice.push({ layer, suggestions })
  }
  return advice
}

/**
 * 사람이 읽을 한 줄들.
 *
 * @param {ReturnType<typeof findLayerAdvice>} advice
 * @returns {string[]}
 */
export function renderLayerAdvice(advice) {
  const lines = []
  for (const { layer, suggestions } of advice ?? []) {
    if (suggestions.length === 0) {
      lines.push(`testing.layers.${layer}가 없다. 도메인 프로파일에도 그 계층이 없어 제안할 것이 없다.`)
      continue
    }
    for (const s of suggestions) {
      const parts = [
        s.libraries?.length ? `라이브러리 ${s.libraries.join(' · ')}` : null,
        s.filePatterns?.length ? `파일 ${s.filePatterns.join(' · ')}` : null,
      ].filter(Boolean)
      lines.push(`testing.layers.${layer}가 없다. ${s.from}은 이렇게 쓴다 — ${parts.join(' / ')}`)
    }
  }
  return lines
}
