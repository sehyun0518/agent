// 문서의 절을 가리키는 참조가 실재하는지 본다.
//
// `docs/operations.md §2.8`이라고 적었는데 그런 절이 없었다 (#94 리뷰). 그 절은
// `§2.6.1`이다. 참조가 틀리면 읽는 사람은 문서를 뒤지다 없다는 것을 알게 되고,
// 그때 문서가 낡은 것인지 참조가 틀린 것인지 모른다.
//
// **파일을 명시한 참조만 본다.** `어휘 §5`처럼 산문으로 가리키는 것은 어느 문서인지
// 기계가 모른다 — 문서 이름을 백틱 경로로 적은 것만 대조한다. 좁게 잡는 이유는
// 넓게 잡으면 정상 참조를 틀렸다고 말하기 때문이다. 실제로 넷이 그랬다.

const REFERENCE = /`(docs\/[A-Za-z0-9._/-]+\.md)`\s*(?:의\s*)?§(\d+(?:\.\d+)*)/g
const HEADING = /^#{1,6}\s+(\d+(?:\.\d+)*)[.\s]/gm

/**
 * 문서가 가진 절 번호.
 *
 * `## 2. 관리` · `### 2.6.1 머지하기 전에` 둘 다 받는다.
 *
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function sectionNumbers(markdown) {
  return new Set([...(markdown ?? '').matchAll(HEADING)].map((m) => m[1]))
}

/**
 * 없는 절을 가리키는 참조.
 *
 * @param {Array<{path: string, text: string}>} sources 참조를 담은 파일들
 * @param {Map<string, string>} documents 문서 경로 → 본문
 * @returns {Array<{source: string, target: string, section: string}>}
 */
export function findBrokenSectionRefs(sources, documents) {
  const sections = new Map()
  const broken = []

  for (const { path, text } of sources ?? []) {
    for (const [, target, section] of (text ?? '').matchAll(REFERENCE)) {
      const body = documents?.get(target)
      // 없는 문서를 가리키는 것은 이 검사가 보지 않는다. 경로 오타는 다른 축이고,
      // 여기서 함께 보면 "문서가 아직 없다"와 "절이 없다"가 같은 메시지로 나온다.
      if (body === undefined) continue
      if (!sections.has(target)) sections.set(target, sectionNumbers(body))
      if (!sections.get(target).has(section)) broken.push({ source: path, target, section })
    }
  }
  return broken
}
