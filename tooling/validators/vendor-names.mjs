// 리뷰 봇의 상표명이 저장소에 들어오지 않게 한다.
//
// 열여섯 곳에 들어와 있었다. 주석·회귀 케이스·ADR 예시에 하나씩 붙었고 **쓰면서
// 한 번도 걸리지 않았다** — 그때그때는 "지금 쓰는 봇"을 적는 것이 자연스러웠다.
//
// 문제는 셋이다.
//
//   · 하네스는 특정 벤더의 것이 아니다. 저장소마다 붙는 봇이 다르다.
//   · 상표명은 낡는다. 서비스가 사라지거나 이름을 바꾸면 주석이 거짓이 된다.
//   · 판정을 그 이름에 맞추고 싶어진다 — 실제로 "문구로 가르자"는 유혹이 있었다.
//
// **이 파일에만 이름이 있다.** 막으려면 무엇을 막는지 적어야 하고, 한 곳에 모으는
// 것이 열여섯 곳에 흩어지는 것보다 낫다. `no-auto-attribution` 훅이 자동화 도구
// 출처 문구를 막는 것과 같은 모양이다.

/** 적지 않는 이름. 소문자로 비교한다. */
export const VENDOR_NAMES = ['coderabbit', 'coderabbitai', 'gemini-code-assist', 'llamapreview']

/**
 * 상표명이 들어간 곳.
 *
 * **이 파일 자신은 세지 않는다.** 목록이 여기 있고, 그것을 자기가 걸면 늘 실패한다.
 *
 * @param {Array<{path: string, text: string}>} files
 * @returns {Array<{path: string, name: string, line: number}>}
 */
export function findVendorNames(files) {
  const found = []
  for (const { path, text } of files ?? []) {
    if (path.endsWith('vendor-names.mjs')) continue
    const lines = String(text ?? '').split('\n')
    for (const [index, line] of lines.entries()) {
      const lower = line.toLowerCase()
      for (const name of VENDOR_NAMES) {
        if (lower.includes(name)) found.push({ path, name, line: index + 1 })
      }
    }
  }
  return found
}
