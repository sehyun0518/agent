// 어휘가 연 수동 검증 경로를 선언이 실제로 내놓는지 본다.
//
// ADR-0013이 `test.<layer>.manual-result`를 어휘에 넣었다. 러너가 저장소 밖 환경을
// 요구해 둘 수 없는 저장소가, 문서화된 절차로 검증한 결과를 승인 없이 남길 수 있게
// 하려는 것이다.
//
// 그런데 그 kind를 `test-execution` 변형의 evidence에서 지우면 경로가 조용히 닫힌다.
// 어휘에는 남아 있으니 열려 있는 것처럼 읽히는데, 실제로는 그 계층을 만족시킬 방법이
// 다시 러너와 승인된 생략 둘뿐이 된다. #51이 moot에서 겪은 것과 같은 모양이다.
//
// 계층 목록을 여기 박지 않는다. `test.<layer>.result`를 선언한 스코프를 보고 어휘에
// 짝이 되는 `manual-result`가 있는지 묻는다 — capability id도 계층 이름도 하드코딩하지
// 않으므로, 어휘에서 빼면 이 검사도 그 계층을 요구하지 않게 된다.

const RESULT = /^(test\.[a-z][a-z0-9-]*)\.result$/

/**
 * 어휘에 `<prefix>.manual-result`가 있는데 그것을 evidence에 내놓지 않은 스코프.
 *
 * @param {Array<{label: string, evidence?: Array<{kind: string}>}>} scopes
 * @param {Record<string, unknown>} evidenceVocabulary vocabulary.json의 evidence 맵
 * @returns {Array<{scope: string, kind: string}>}
 */
export function findUnofferedManualResults(scopes, evidenceVocabulary) {
  const unoffered = []
  for (const { label, evidence } of scopes ?? []) {
    const declared = new Set((evidence ?? []).map((item) => item.kind))
    for (const kind of declared) {
      const match = RESULT.exec(kind)
      if (!match) continue
      const manual = `${match[1]}.manual-result`
      if (!Object.hasOwn(evidenceVocabulary ?? {}, manual)) continue
      if (declared.has(manual)) continue
      unoffered.push({ scope: label, kind: manual })
    }
  }
  return unoffered
}

/**
 * `test.<layer>.result`를 조건으로 보면서 수동 검증 분기를 두지 않은 step.
 *
 * 선언이 경로를 내놓아도(위 검사) 워크플로가 그 분기를 두지 않으면 결과는 같다 — 그
 * 계층을 만족시킬 방법이 다시 러너와 승인된 생략 둘뿐이 된다. `review.yaml`이 실제로
 * 그 상태였다.
 *
 * `expect`와 `expectAnyOf`를 함께 본다. `expect`는 AND라 대안이 아예 없으므로,
 * 그쪽에만 있으면 분기가 없는 것과 같다.
 *
 * @param {Array} steps
 * @param {Record<string, unknown>} evidenceVocabulary
 * @returns {Array<{step: string, kind: string}>}
 */
export function findMissingManualBranches(steps, evidenceVocabulary) {
  const missing = []
  for (const step of steps ?? []) {
    const kinds = new Set(
      [
        ...(step.expect ?? []),
        ...(step.expectAnyOf ?? []).flatMap((group) => group.conditions ?? []),
      ].map((condition) => condition.evidence),
    )

    for (const kind of kinds) {
      const match = RESULT.exec(kind ?? '')
      if (!match) continue
      const manual = `${match[1]}.manual-result`
      if (!Object.hasOwn(evidenceVocabulary ?? {}, manual)) continue
      if (kinds.has(manual)) continue
      missing.push({ step: step.id, kind: manual })
    }
  }
  return missing
}
