// 계층 단계가 "해당 없음"으로 넘어갈 근거를 갖는지 본다.
//
// 계층은 전부 필수다. 건너뛰는 것이 아니라 **그 계층이 이 변경에 해당되지 않을 때**
// 넘어간다. 그리고 그 판정은 실행자가 아니라 계약 고정 단계가 한다 — 실행자가 자기
// 일의 유무를 스스로 선언하면 **그 판정을 검증할 근거가 사라진다** (ADR-0038).
//
// 전에는 `skippable`이 단계마다 붙어 있었다. 그러면 설계가 "UI가 있다"고 판정해도
// 실행자가 사유 한 줄로 UI 계층을 통째로 건너뛸 수 있고, **둘이 어긋나도 아무도
// 모른다.** `documentation-impact`가 이미 쓰던 구조를 테스트 계층에 옮긴 것이다.
//
// unit은 대상이 아니다. 동작 변경이면 항상 해당된다 (ADR-0004).

const JUDGED_LAYERS = ['ui', 'integration', 'e2e']

/**
 * 이 단계가 속한 계층. 판정 대상이 아니면 null.
 *
 * `ui-scaffold`처럼 접두사인 것과 `review.yaml`의 `ui`처럼 **이름 그 자체**인 것을 둘 다
 * 받는다. 접두사만 봤더니 `review.yaml`의 세 단계가 통째로 검사에서 빠졌다 — 실패가
 * 아니라 검사가 조용히 꺼진 것이다 (#100 리뷰).
 */
export function layerOfStep(stepId) {
  const id = String(stepId ?? '')
  return JUDGED_LAYERS.find((layer) => id === layer || id.startsWith(`${layer}-`)) ?? null
}

/**
 * 해당 없음으로 넘어갈 근거가 없는 계층 단계.
 *
 * 근거는 `expectAnyOf`의 묶음 중 하나가 `test.<layer>.applicability = not-applicable`을
 * 조건으로 갖는 것이다. `expect`만 있으면 대안이 없다는 뜻이라 그 계층을 영영 못
 * 넘어간다 — 계층이 해당 없는 작업에서 흐름이 막힌다.
 *
 * @param {Array<{id?: string, expectAnyOf?: Array<{conditions?: Array<object>}>}>} steps
 * @returns {Array<{step: string, layer: string}>}
 */
export function findLayerStepsWithoutEscape(steps) {
  const missing = []
  for (const step of steps ?? []) {
    const layer = layerOfStep(step?.id)
    if (!layer) continue

    const kind = `test.${layer}.applicability`
    const hasEscape = (step.expectAnyOf ?? []).some((group) =>
      (group?.conditions ?? []).some(
        (c) => c?.evidence === kind && c?.status === 'not-applicable',
      ),
    )
    if (!hasEscape) missing.push({ step: step.id, layer })
  }
  return missing
}

/**
 * 판정을 내는 단계가 흐름 안에 있는지.
 *
 * 없으면 `not-applicable` 조건이 영영 채워지지 않는다. `review`처럼 흐름 밖에서 받는
 * 경우는 `from`이 없으므로 여기서 보지 않는다 — 그건 그 워크플로의 정의다 (ADR-0014).
 *
 * @param {Array<object>} steps
 * @param {Map<string, {evidence?: Array<{kind?: string}>}>} capabilities
 * @returns {string[]} 생산자가 없는 판정 kind
 */
export function findUnproducedVerdicts(steps, capabilities) {
  const needed = new Set()
  for (const step of steps ?? []) {
    for (const group of step?.expectAnyOf ?? []) {
      for (const c of group?.conditions ?? []) {
        if (c?.from && /^test\.[a-z0-9]+\.applicability$/.test(c?.evidence ?? '')) {
          needed.add(`${c.evidence}|${c.from}`)
        }
      }
    }
  }

  const missing = []
  for (const entry of needed) {
    const [kind, from] = entry.split('|')
    const producer = (steps ?? []).find((s) => s?.id === from)
    const capability = capabilities?.get(producer?.capability)
    const declares = (capability?.evidence ?? []).some((e) => e?.kind === kind)
    if (!declares) missing.push(`${kind} (from ${from})`)
  }
  return missing
}
