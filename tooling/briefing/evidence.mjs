// 흐름이 남긴 증거를 읽어 `expect`와 대조한다.
//
// **판정하지 않는다.** 있는지 없는지만 말한다. 게이트의 성립 조건은 산문이라
// (`moot`이 정당한가, red가 예상한 이유인가) 파일로 답할 수 없고, 그 판단은 여전히
// 사람이 한다 (ADR-0033 결정 4).
//
// 그래도 말과 파일이 갈리는 것은 보인다. 이 세션이 낸 실패가 그 자리에 있었다 —
// 검증이 안 돌았는데 "정상 종료한다"고 적었고, 2줄만 고쳤다고 하고 129줄을 재포맷했다.
// **대조할 대상이 없으면 자기신고가 유일한 기록이다.**

/**
 * 레코드가 이 기대를 채우는가.
 *
 * `from`이 있으면 `step`으로 가린다. `producedBy`로는 못 가린다 —
 * `test-execution#unit`이 `unit-red`와 `unit-green` 둘 다다 (ADR-0033 결정 2).
 */
const satisfies = (record, expectation) =>
  record?.kind === expectation?.evidence &&
  record?.status === expectation?.status &&
  (!expectation?.from || record?.step === expectation.from)

/**
 * 재시도하면 같은 단계의 레코드가 둘이 된다. 덮어쓰지 않고 쌓으므로 마지막을 본다.
 */
const lastMatch = (records, expectation) => {
  for (let i = (records?.length ?? 0) - 1; i >= 0; i -= 1) {
    if (satisfies(records[i], expectation)) return records[i]
  }
  return null
}

/**
 * `expect` 하나하나에 대해 증거가 있는지.
 *
 * @param {Array<object>} records `evidence.yaml`이 담은 레코드
 * @param {Array<{evidence: string, status: string, from?: string}>} expectations
 * @returns {Array<{expectation: object, found: object|null, sameKind: boolean}>}
 */
export function matchExpectations(records, expectations) {
  const list = Array.isArray(records) ? records : []
  return (expectations ?? []).filter(Boolean).map((expectation) => ({
    expectation,
    found: lastMatch(list, expectation),
    // 같은 kind가 다른 status나 다른 단계로 있으면 "아예 없다"와 다르다.
    // 무엇을 봐야 하는지가 달라지므로 갈라서 말한다.
    sameKind: list.some((r) => r?.kind === expectation.evidence),
  }))
}

/**
 * `evidence.yaml`의 본문에서 레코드 목록을 꺼낸다.
 *
 * 최상위가 `evidence:` 키인 것도, 그냥 목록인 것도 받는다 — 어휘 §5의 예시가
 * `evidence:` 아래에 적고 있고, 손으로 쓸 때 그 키를 빼는 것이 흔하다.
 *
 * 검증기가 실행 산출물을 검사하지 않으므로(ADR-0033 버린 대안 4) 모양이 틀린 것은
 * 여기서 걸러 내고 몇 건인지 돌려준다. 조용히 버리면 "증거가 없다"와 구분되지 않는다.
 *
 * @param {unknown} doc
 * @returns {{records: object[], malformed: number}}
 */
export function readEvidenceRecords(doc) {
  const raw = Array.isArray(doc) ? doc : Array.isArray(doc?.evidence) ? doc.evidence : []
  const records = raw.filter((r) => r && typeof r === 'object' && r.kind && r.status)
  return { records, malformed: raw.length - records.length }
}
