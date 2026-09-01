// 스캐폴드 단계가 red 게이트 앞에 있는지 본다.
//
// ADR-0011이 `logic-scaffold`를 만들었다. 계약이 신규 모듈을 도입하면 그 파일이 있기
// 전에는 테스트가 import를 해석하지 못하고, 모듈 해석 실패는 red가 아니다. 그러면 red
// 없이 파일을 못 만들고 파일 없이 red를 못 만드는 순환에 갇힌다. UI 계층은 `ui-scaffold`로
// 이미 풀려 있던 것을 unit 계층에도 놓은 결정이다.
//
// 그런데 그 단계를 워크플로에서 지워도 아무것도 빨개지지 않았다 (#51). 결정은 있고 그
// 결정을 지키는 것이 없었다.
//
// 규칙은 변형 이름에서 나온다. `logic` ↔ `logic-scaffold`, `ui` ↔ `ui-scaffold` —
// capability가 `<variant>-scaffold`를 선언해 뒀으면, 그 변형을 쓰는 step은 스캐폴드
// 변형을 쓰는 step을 그래프 조상으로 가져야 한다.
//
// 존재만으로는 부족하다. 조상이 아니면 red 앞에 온다는 보장이 없고, 스캐폴드의 존재
// 이유가 "red보다 먼저"이기 때문이다.
//
// 선언되지 않은 계층은 대상이 아니다. `integration`·`e2e`에는 비울 스캐폴드가 없고,
// 그 자리를 `moot`이 대신한다 (ADR-0012 · workflow-red-proof.mjs). 두 검사가 계층을
// 나눠 가지며 겹치지 않는다.

const SUFFIX = '-scaffold'

/**
 * 스캐폴드 변형이 선언돼 있는데 그것을 쓰는 조상 step이 없는 step.
 *
 * @param {Array} steps 워크플로의 steps
 * @param {{hasAncestorProducer(stepId: string, token: string): boolean}} graph
 * @param {Map<string, {variants?: Record<string, {produces?: string[]}>}>} capabilities
 * @returns {Array<{step: string, scaffold: string}>}
 */
export function findMissingScaffolds(steps, graph, capabilities) {
  const missing = []
  for (const step of steps ?? []) {
    if (!step.variant || step.variant.endsWith(SUFFIX)) continue

    const scaffoldName = `${step.variant}${SUFFIX}`
    const scaffold = capabilities?.get(step.capability)?.variants?.[scaffoldName]
    if (!scaffold) continue

    const tokens = scaffold.produces ?? []
    if (tokens.some((token) => graph.hasAncestorProducer(step.id, token))) continue
    missing.push({ step: step.id, scaffold: scaffoldName })
  }
  return missing
}
