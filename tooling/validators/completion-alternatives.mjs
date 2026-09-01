// completion.requiresEvidence의 대안 묶음을 다룬다.
//
// 이 목록은 AND였다. 그런데 같은 것을 다른 방법으로 증명하는 증거가 생겼다 — 러너가
// 낸 `test.e2e.result`와 문서화된 수동 절차가 낸 `test.e2e.manual-result`는 둘 다
// "이 계층이 검증됐다"를 말하고, 저장소에 따라 둘 중 하나만 존재한다 (ADR-0013).
//
// 그래서 원소 하나가 문자열이거나 문자열 배열이다. 배열은 "이 중 하나가 있으면 충족"이다.
//
// 남용을 막는 것은 스키마가 아니라 용례다. 묶음은 **같은 것을 다른 방법으로 증명할 때만**
// 쓴다. 서로 다른 것을 묶으면 completion이 무엇을 요구하는지가 흐려진다 — 그 판단은
// 사람이 하고, 이 파일은 묶음이 형식적으로 성립하는지만 본다.

/** 문자열과 배열이 섞인 목록을 대안 묶음의 목록으로 고른다. */
export function normalizeRequiredEvidence(requiresEvidence) {
  return (requiresEvidence ?? []).map((entry) => (Array.isArray(entry) ? entry : [entry]))
}

/**
 * 묶음 안에 evidence로 선언되지 않은 kind.
 *
 * 하나만 빠져도 그 경로는 실제로 없는 것이다. 있는 것처럼 읽히면 completion이 실제보다
 * 느슨해 보인다.
 */
export function findUndeclaredCompletionEvidence(groups, declaredEvidence) {
  const undeclared = []
  for (const group of groups ?? []) {
    for (const kind of group) {
      if (!declaredEvidence.has(kind)) undeclared.push({ kind })
    }
  }
  return undeclared
}
