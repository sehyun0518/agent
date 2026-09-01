// 훅 문서가 선언한 이벤트가 실재하는 지점인지 본다.
//
// 훅은 마크다운이고 이벤트를 산문으로 적는다 — `- 이벤트: \`before-tool\``. 그 이름이
// 어디에도 대조되지 않아서, `before-없는것`이라고 적어도 검증이 통과했다.
//
// 이름이 틀리면 실행 주체가 생겼을 때 그 훅은 **영영 안 불린다.** 그리고 훅 문서는
// blocking이라고 적혀 있으니 읽는 사람은 막힌다고 믿는다.
//
// 이벤트 목록은 `policy.schema.json`이 갖는다. 여기 옮겨 적지 않는다 (ADR-0036).

/**
 * 훅 문서인가.
 *
 * 경로 구분자를 문자열로 가정하지 않는다. `p.includes('/hooks/')`로 썼더니 Windows의
 * `\hooks\`에서 **아무것도 안 걸렸다** — 실패가 아니라 검사가 조용히 꺼진다.
 * 이 저장소가 반복해 싸운 모양이다 (#49 · #97 리뷰).
 *
 * `README.md`는 훅이 아니다. `hooks/` 안에 설명 문서를 두면 이벤트가 없다고 걸린다.
 * 지금은 없지만 두는 것이 자연스러운 자리다.
 */
export function isHookDoc(path) {
  const text = String(path ?? '')
  if (!/\.md$/i.test(text) || /(^|[/\\])readme\.md$/i.test(text)) return false
  // 맨 앞에 오는 상대 경로(`hooks/x.md`)도 받는다. 구분자를 요구했더니 그것이 빠졌다.
  return /(^|[/\\])hooks[/\\]/.test(text)
}

const EVENT_LINE = /^- 이벤트:\s*`([^`]+)`/m

/** 정책 스키마가 아는 훅 이벤트. */
export function knownHookEvents(policySchema) {
  const found = []
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.enum) && node.enum.includes('before-capability')) found.push(...node.enum)
    Object.values(node).forEach(walk)
  }
  walk(policySchema)
  return [...new Set(found)]
}

/** 훅 문서에서 선언한 이벤트 이름. 없으면 null. */
export function hookEventOf(markdown) {
  return EVENT_LINE.exec(markdown ?? '')?.[1] ?? null
}

/**
 * 실재하지 않는 이벤트를 선언한 훅.
 *
 * 이벤트 줄이 아예 없는 것도 낸다 — 언제 도는지 안 적힌 훅은 실행 주체가 생겨도
 * 붙일 자리가 없다.
 *
 * @param {Array<{path: string, text: string}>} hooks
 * @param {string[]} events
 * @returns {Array<{hook: string, event: string|null}>}
 */
export function findUnknownHookEvents(hooks, events) {
  const known = new Set(events ?? [])
  return (hooks ?? [])
    .map(({ path, text }) => ({ hook: path, event: hookEventOf(text) }))
    .filter(({ event }) => !event || !known.has(event))
}
