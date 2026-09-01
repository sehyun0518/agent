// moot 분기가 있어야 할 자리에 있는지 본다.
//
// ADR-0012가 `integration`·`e2e`의 red-proof에 `moot`을 열었다. 그 계층들은 보려는
// 협력을 선행 계층이 이미 만들어놔서 red가 관찰되지 않을 수 있고, 그때 confirmed도
// rejected도 사실이 아니기 때문이다.
//
// 그런데 워크플로에서 그 분기를 지워도 아무것도 빨개지지 않았다 (#51). 지우면 워크플로가
// 다시 ADR-0012 이전 상태로 돌아간다 — 정직한 "구현할 것이 없다"가 승인이 필요한 생략으로
// 몰린다. 결정은 있는데 그 결정을 지키는 것이 없었다.
//
// 반대 방향은 이 검사가 보지 않는다. `test.ui.red-proof: moot`처럼 허용되지 않는
// 계층에 moot을 쓰는 것은 validate.mjs의 checkExpectation이 어휘와 대조해 이미 잡는다.
// 없는 쪽만 비어 있었다.
//
// 계층 목록을 여기 박아두지 않는다. 어느 계층이 moot을 허용하는지는 vocabulary.json이
// 소유하고, 거기서 moot을 빼면 이 검사도 그 계층을 요구하지 않게 된다.

const RED_PROOF = /^test\.[a-z][a-z0-9-]*\.red-proof$/

/**
 * moot을 허용하는 red-proof를 보면서 moot 분기가 없는 step.
 *
 * `expect`와 `expectAnyOf`를 함께 본다 — expectAnyOf를 통째로 expect로 바꿔 분기를
 * 없애는 것도 같은 우회다.
 *
 * @param {Array} steps 워크플로의 steps
 * @param {Record<string, {statuses: string[]}>} evidence vocabulary.json의 evidence 맵
 * @returns {Array<{step: string, evidence: string}>}
 */
export function findMissingMootBranches(steps, evidence) {
  const missing = []
  for (const step of steps ?? []) {
    const conditions = [
      ...(step.expect ?? []),
      ...(step.expectAnyOf ?? []).flatMap((group) => group.conditions ?? []),
    ]

    const statusesByKind = new Map()
    for (const condition of conditions) {
      if (!RED_PROOF.test(condition.evidence ?? '')) continue
      if (!statusesByKind.has(condition.evidence)) statusesByKind.set(condition.evidence, new Set())
      statusesByKind.get(condition.evidence).add(condition.status)
    }

    for (const [kind, statuses] of statusesByKind) {
      if (!(evidence?.[kind]?.statuses ?? []).includes('moot')) continue
      if (statuses.has('moot')) continue
      missing.push({ step: step.id, evidence: kind })
    }
  }
  return missing
}
