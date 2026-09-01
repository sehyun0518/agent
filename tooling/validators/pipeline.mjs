// `npm run check`와 CI 워크플로가 같은 검사를 도는지 본다.
//
// 둘은 서로 다른 파일에 있는 같은 목록이다. 벤더링 드리프트 검사를 만들면서 check에는
// 넣고 CI에는 안 넣었다 — 손으로 찾았고, 못 찾았으면 그 검사는 로컬에서만 돌고 병합을
// 막지 못했을 것이다 (#33 · ADR-0016).
//
// 표 드리프트와 같은 모양이지만 양쪽이 구조화된 데이터(JSON·YAML)라 정규식보다 덜
// 깨진다. check는 `&&` 사슬이고 CI는 step의 run 목록이다.

/** `a && b && c` → ['a', 'b', 'c'] */
export function commandsInScript(script) {
  return (script ?? '')
    .split('&&')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * `check`에 있는데 CI에 없는 명령.
 *
 * **한 방향만 본다.** CI에 더 있는 것은 정상이다 — `npm ci` 같은 준비 단계도,
 * 로컬에서 돌릴 일이 없는 전체 재생성 대조도 CI에만 있어야 한다. 위험한 쪽은
 * 반대다. `check`에 넣고 CI에 안 넣으면 그 검사는 로컬에서만 돌고 병합을 막지 못한다.
 *
 * 문자열을 그대로 대조한다. 양쪽이 같게 쓰기를 요구하는 것이 목적이라 정규화하지
 * 않는다 — 다르게 쓸 이유가 생기면 그때 이 검사를 함께 고친다.
 *
 * @returns {string[]} CI에 없는 명령
 */
export function findChecksMissingFromCi(checkScript, ciCommands) {
  // CI 쪽도 같은 방식으로 가른다. step 하나가 `run: |`로 여러 줄이거나 `&&`로 이어질
  // 수 있는데, 통째로 대조하면 그때 오탐이 난다.
  const inCi = new Set(
    (ciCommands ?? []).flatMap((command) => (command ?? '').split('\n').flatMap(commandsInScript)),
  )
  return commandsInScript(checkScript).filter((command) => !inCi.has(command))
}
