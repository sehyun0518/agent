// 붙여 넣어 쓰라고 찍는 명령줄의 인자.
//
// `init`이 찍는 경로에서 처음 났고(#102 리뷰), 도구 커맨드의 `cd` 줄에서 **똑같이
// 다시 났다**(#106). 처음에 `init-cli.mjs` 안에만 두었기 때문이다.
//
// 이 저장소에서 여러 번 겪은 모양이다 — 이미 풀린 것을 다시 쓰면 부분집합이 된다.
// 그래서 여기 한 곳에 둔다.

/**
 * 셸에 그대로 붙여 넣어도 한 인자로 남게 감싼다.
 *
 * 대부분의 경로는 감싸지 않는다 — 따옴표가 붙으면 읽기 나빠지고, 읽으라고 찍는
 * 줄이다. 공백·따옴표 같은 것이 있을 때만 감싼다.
 *
 * @param {string} value
 * @returns {string}
 */
export function shellArg(value) {
  const text = String(value ?? '')
  if (text === '') return "''"
  return /^[\w./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`
}
