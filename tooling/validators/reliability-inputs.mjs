// 신뢰성을 집계할 입력이 이벤트 계약에 있는지 본다.
//
// #47이 물은 것은 "이 모델이 얼마나 똑똑한가"가 아니라 "이 시스템이 이 종류의 일을
// 얼마나 신뢰성 있게 끝내나"였다. 집계는 텔레메트리를 읽는 쪽이 만들지만(ADR-0023
// 결정 2), 읽는 쪽이 만들 수 있으려면 필요한 사실이 기록에 있어야 한다.
//
// 여기 적힌 것은 지표가 아니라 그 지표를 만들 수 있는지의 조건이다. 지표 자체는
// 어휘에 넣지 않는다 — 증거는 실행 하나의 사실이고 지표는 여러 실행의 집계라
// 층이 다르다(ADR-0023 결정 2).
//
// 필드를 지우면 그 지표를 영영 못 만든다는 것이 이 검사가 막는 것이다. 지금은
// 내보내는 코드가 없어 아무 값도 흐르지 않지만, 계약이 무엇을 약속했는지는
// 지금 고정된다 (ADR-0030).

/**
 * 집계에 필요하다고 선언했는데 이벤트 계약에 없는 필드.
 *
 * @param {{properties?: Record<string, unknown>}} eventSchema
 * @param {Array<{field: string, metric: string}>} required
 * @returns {Array<{field: string, metric: string}>}
 */
export function findMissingAggregationInputs(eventSchema, required) {
  const present = new Set(Object.keys(eventSchema?.properties ?? {}))
  return (required ?? []).filter(({ field }) => !present.has(field))
}

/**
 * 신뢰성 지표마다 무엇이 있어야 계산되는지.
 *
 * `metric`은 지표 이름이 아니라 **그 지표를 못 만들게 되는 이유**를 적는 자리다.
 * 실패 메시지에 그대로 들어간다.
 */
export const AGGREGATION_INPUTS = [
  { field: 'runId', metric: '실행 하나를 묶지 못한다' },
  { field: 'workflow', metric: '"이 종류의 일"에서 종류를 못 가른다 — 단계 집합으로는 추론되지 않는다' },
  { field: 'outcome', metric: '완주와 실패를 못 가른다' },
  { field: 'attempt', metric: '재시도로 통과한 것과 한 번에 통과한 것을 못 가른다 (ADR-0023)' },
  { field: 'failureClass', metric: '어떤 성질의 실패였는지 못 가른다' },
  { field: 'evidence', metric: '어느 게이트에서 멈췄는지 못 가른다' },
  { field: 'durationMs', metric: '어디서 오래 걸렸는지 못 가른다' },
]
