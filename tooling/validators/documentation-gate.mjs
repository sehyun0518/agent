/**
 * 판정 단계가 문서 단계를 건너뛰지 못하게 한다.
 *
 * 왜 이 파일이 필요한가: `documentation.completed`를 review의 `requires`에 넣는 것으로는
 * 부족하다. 검증기의 선행 토큰 검사는 그 워크플로 안에 생산 단계가 **이미 존재할 때만**
 * 조상 여부를 본다(`candidates.length > 0`). 문서 단계가 아예 없는 워크플로는 조용히
 * 통과한다. 여기서는 "생산자가 없다"를 통과가 아니라 실패로 읽는다.
 *
 * 계약 고정 단계가 없는 흐름은 예외다. 문서 영향을 판정할 주체가 흐름 안에 존재하지
 * 않으므로 문서 단계를 요구하는 것이 의미가 없다 (ADR-0005 결정 4).
 */

const IMPACT_OWNER = 'specification'
const DOCUMENTATION = 'documentation'
const REVIEW = 'review'

/**
 * @param {Array} steps 워크플로 step 목록
 * @param {ReturnType<import('./workflow-graph.mjs').createWorkflowGraph>} graph
 * @returns {Array<{stepId: string, reason: 'missing'|'not-ancestor'}>}
 */
export function findDocumentationBypass(steps, graph) {
  const judges = steps.filter((step) => step.capability === REVIEW)
  if (judges.length === 0) return []

  // 판정 근거를 만들 주체가 없는 흐름에는 적용하지 않는다.
  if (!steps.some((step) => step.capability === IMPACT_OWNER)) return []

  const producers = steps.filter((step) => step.capability === DOCUMENTATION).map((step) => step.id)

  const problems = []
  for (const judge of judges) {
    if (producers.length === 0) {
      problems.push({ stepId: judge.id, reason: 'missing' })
      continue
    }
    if (!producers.some((producer) => graph.ancestorsOf(judge.id).has(producer))) {
      problems.push({ stepId: judge.id, reason: 'not-ancestor' })
    }
  }
  return problems
}
