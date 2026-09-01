// 프로파일이 자기 네임스페이스 밖의 토큰을 만들지 않는지 본다.
//
// ADR-0001이 프로파일마다 네임스페이스를 준 이유는 **중앙 등록 없이 자기 토큰을 만들게**
// 하기 위해서다. 그런데 `checkToken`은 선언된 네임스페이스면 아무거나 받는다 — 프로파일
// 하나가 다른 프로파일의 접두사로 토큰을 만들어도 통과한다.
//
// 프로파일은 서로 바꿔 끼우는 단위다. 남의 네임스페이스를 쓰면 그 프로파일을 떼어냈을 때
// 이쪽 선언이 존재하지 않는 것을 가리키게 되고, 도메인 단위로 갈라 둔 의미가 사라진다.
//
// 코어 토큰(접두사 없음)은 그대로 허용한다. 그건 프로파일을 떼어내도 남는 것이다.

/**
 * 자기 것이 아닌 네임스페이스를 쓴 토큰.
 *
 * @param {string[]} tokens 프로파일이 선언한 토큰
 * @param {string} ownerNamespace 그 프로파일의 namespace
 * @returns {Array<{token: string, namespace: string}>}
 */
export function findForeignNamespaceTokens(tokens, ownerNamespace) {
  const foreign = []
  for (const token of tokens ?? []) {
    const colon = (token ?? '').indexOf(':')
    if (colon === -1) continue
    const namespace = token.slice(0, colon)
    if (namespace !== ownerNamespace) foreign.push({ token, namespace })
  }
  return foreign
}

/** 삽입 단계가 선언한 토큰 전부. 계약 필드가 늘면 여기도 늘어야 한다. */
export function insertTokens(insert) {
  return [
    ...(insert?.produces ?? []),
    ...(insert?.evidence ?? []).map((item) => item.kind),
    ...(insert?.completion?.requiresEvidence ?? []),
    ...(insert?.skippable?.evidenceOnSkip ? [insert.skippable.evidenceOnSkip] : []),
  ].filter((token) => typeof token === 'string')
}
