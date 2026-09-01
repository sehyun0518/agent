// 되돌림이 갈 곳이 흐름 안에 있는지 본다.
//
// 모든 capability가 `failure.precondition-unmet: return-to-producer`를 선언한다.
// 그런데 그 producer가 워크플로에 아예 없으면 되돌림은 갈 곳이 없다. FE 실행에서
// 실제로 났다 — `test-execution#unit`이 되돌렸는데 producer가 선행 step이 아니라
// "저장소 온보딩"이었고, 그런 단계는 어느 워크플로에도 없다 (#51 · #54).
//
// 기존 검사는 생산자가 **있을 때** 조상인지만 본다. 아예 없는 경우는 조용히 통과했다.
// 있는데 순서가 틀린 것과 애초에 없는 것은 되돌림 관점에서 다른 사건이라 따로 본다.
//
// 루트와 변형의 requires를 합쳐서 본다. validate.mjs의 조상 검사가 이미 그렇게 하고
// 있고, 변형이 자기 계층 신호만 적는 것은 루트를 대체하겠다는 뜻이 아니다.
//
// 흐름 밖에서 이미 충족된 선행조건 위에서 시작하는 워크플로가 있다 — `review`는 앞선
// 실행이 남긴 산출을 판정만 한다. 그건 결함이 아니라 그 흐름의 정의이므로 `assumes`로
// 선언하게 하고, 선언된 토큰은 대상에서 뺀다. 선언은 면제가 아니라 **되돌림이 흐름
// 밖으로 나간다는 표시**다.

/**
 * requires 토큰을 이 워크플로의 어느 step도 생산하지 않는 경우.
 *
 * @param {Array} steps
 * @param {Map<string, {requires?: string[], variants?: Record<string, {requires?: string[]}>}>} capabilities
 * @param {string[]} assumes 흐름 밖에서 충족된다고 선언한 토큰
 * @returns {Array<{step: string, token: string}>}
 */
export function findUnreachablePreconditions(steps, capabilities, assumes = []) {
  const satisfied = new Set([
    ...(steps ?? []).flatMap((step) => step.produces ?? []),
    ...assumes,
  ])
  const unreachable = []

  for (const step of steps ?? []) {
    const capability = capabilities?.get(step.capability)
    if (!capability) continue
    const variant = step.variant ? capability.variants?.[step.variant] : undefined
    const tokens = new Set([...(capability.requires ?? []), ...(variant?.requires ?? [])])

    for (const token of tokens) {
      if (satisfied.has(token)) continue
      unreachable.push({ step: step.id, token })
    }
  }
  return unreachable
}
