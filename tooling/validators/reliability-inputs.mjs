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
  { field: 'event', metric: '시작과 완료를 못 가른다 — 완주율의 분모와 분자다' },
  { field: 'runId', metric: '실행 하나를 묶지 못한다' },
  { field: 'workflow', metric: '"이 종류의 일"에서 종류를 못 가른다 — 단계 집합으로는 추론되지 않는다' },
  { field: 'capability', metric: '어느 단계에서 난 일인지 못 가른다' },
  { field: 'variant', metric: '같은 Capability의 어느 변형인지 못 가른다' },
  { field: 'outcome', metric: '완주와 실패를 못 가른다' },
  { field: 'attempt', metric: '재시도로 통과한 것과 한 번에 통과한 것을 못 가른다 (ADR-0023)' },
  { field: 'failureClass', metric: '어떤 성질의 실패였는지 못 가른다' },
  { field: 'evidence', metric: '어느 게이트에서 멈췄는지 못 가른다' },
  { field: 'durationMs', metric: '어디서 오래 걸렸는지 못 가른다' },
]

// ADR-0030의 대조표와 위 목록이 같은지 본다.
//
// 두 곳에 적힌 목록이고, 실제로 갈렸다 — 이 PR을 여는 시점에 표에는 event·capability·
// variant가 있는데 목록에는 없었다(#90 리뷰). 표를 만든 사람과 목록을 만든 사람이 같은
// 커밋 안에서도 그랬다.
//
// 이 저장소가 같은 부류를 여러 번 고쳤다 — README의 결정 기록(adr-index.mjs), 정책 강제
// 현황(#66), 요구사항 슬롯(ADR-0021), 플랫폼 투영(#69). 목록을 두 곳에 적으면 한 곳은 낡는다.
//
// 표에서 백틱 안의 이름만 뽑는다. `event`의 값(`run.started` 등)은 필드가 아니라 값이라
// 표에 적지 않기로 했다 — 그래야 대조가 이름 비교로 끝난다.

const TABLE_HEADING = '## 조사'
const BACKTICKED = /`([A-Za-z][A-Za-z0-9]*)`/g

/**
 * 대조표 절만 떼어낸다. 문서 전체를 보면 본문이 표의 누락을 가린다 —
 * ADR 본문은 같은 필드 이름을 산문에서도 쓴다 (adr-index.mjs와 같은 이유).
 */
function tableSection(markdown) {
  const text = markdown ?? ''
  const start = text.indexOf(TABLE_HEADING)
  if (start === -1) return ''
  const rest = text.slice(start + TABLE_HEADING.length)
  const end = rest.indexOf('\n## ')
  return (end === -1 ? rest : rest.slice(0, end))
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('|--'))
    .join('\n')
}

/**
 * 표에만 있는 필드와 목록에만 있는 필드.
 *
 * 양방향으로 본다. 표에 지표를 더하고 목록을 안 고치면 검사가 안 걸리고, 목록에서
 * 지우고 표를 안 고치면 왜 있었는지가 사라진다.
 *
 * @param {string} adrMarkdown ADR-0030 본문
 * @param {Array<{field: string}>} inputs
 * @returns {{onlyInTable: string[], onlyInList: string[]}}
 */
export function findAggregationTableDrift(adrMarkdown, inputs = AGGREGATION_INPUTS) {
  const inTable = new Set(
    [...tableSection(adrMarkdown).matchAll(BACKTICKED)].map((match) => match[1]),
  )
  const inList = new Set((inputs ?? []).map(({ field }) => field))
  return {
    onlyInTable: [...inTable].filter((field) => !inList.has(field)).sort(),
    onlyInList: [...inList].filter((field) => !inTable.has(field)).sort(),
  }
}
