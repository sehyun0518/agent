// 벤더링한 파일이 손대지지 않았는지 본다.
//
// ADR-0008은 상류와 바이트 일치를 요구하지만 대조하는 도구가 없었다. 실제로 두 번
// 어겼고 둘 다 사람이 우연히 잡았다 — `markdownlint --fix`가 파일 여섯을 고친 것은
// 한 달 뒤에, 옮겨 적다 규칙 다섯을 건드린 것은 같은 PR 안에서 (#33).
//
// 여기는 **로컬 변조**만 본다. 벤더링 시점에 기록한 해시와 지금 파일을 대조하므로
// 네트워크가 필요 없고 매 PR에서 돈다. 상류가 바뀐 것은 이 검사로 알 수 없다 —
// 그건 상류를 받아 봐야 하고 다른 주기로 돈다 (ADR-0016).
//
// 종류는 마커 유무가 아니라 **선언**으로 가른다. 마커로 가르면 마커를 지우는 것만으로
// "우리가 새로 쓴 파일"이 되어 검사를 빠져나간다.

import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'

const BEGIN = '<!-- vendored:begin -->'
const END = '<!-- vendored:end -->'

/** CRLF와 파일 끝 개행만 고른다. 그 밖에는 아무것도 하지 않는다 (ADR-0008 결정 2). */
export function normalize(text) {
  return `${(text ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`
}

export function digest(text) {
  return createHash('sha256').update(normalize(text), 'utf8').digest('hex')
}

/**
 * SKILL.md의 frontmatter.
 *
 * 개행은 `\r?\n`으로 받는다. LF만 받으면 CRLF 파일이 "frontmatter가 없다"가 되고,
 * 그러면 아래 `classifyPack`이 그 팩을 우리 것으로 분류해 **대조에서 통째로 빠진다.**
 * 기존 팩은 기록에 남아 있어 "파일이 없다"로 걸리지만, 새 팩을 CRLF로 넣으면 기록에
 * 들어가지도 않는다 — 조용한 우회다.
 *
 * 읽을 수 없으면 사유를 낸다. **없는 것으로 보지 않는다.** SKILL.md는 전부 frontmatter를
 * 갖고 있고, 없다는 것 자체가 이상한 상태다. 그것을 "우리 것"으로 흘려보내면 CRLF 말고
 * 다른 이유로 못 읽는 경우도 같은 자리로 새어 나간다.
 *
 * @returns {{raw: string, data: object} | {problem: string}}
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text ?? '')
  if (!match) return { problem: 'frontmatter가 없다' }
  try {
    return { raw: match[1], data: parseYaml(match[1]) ?? {} }
  } catch (error) {
    return { problem: error.message.split('\n')[0] }
  }
}

/**
 * 팩의 종류.
 *
 *   own            metadata.source가 없다. 우리가 쓴 것이라 대조하지 않는다
 *   body-rewritten 상류에서 왔지만 본문을 다시 썼다고 선언했다. SKILL.md 본문은 대조하지 않는다
 *   vendored       상류 본문을 그대로 담는다. SKILL.md는 마커 구간을 대조한다
 */
export function classifyPack(metadata) {
  if (!metadata?.source) return 'own'
  return metadata.vendored === 'body-rewritten' ? 'body-rewritten' : 'vendored'
}

/**
 * 마커 사이 본문. 마커가 없거나 짝이 안 맞으면 사유를 낸다.
 *
 * `vendored`로 분류된 팩의 SKILL.md에 마커가 없는 것은 드리프트다 — 본문을 다시 썼으면
 * `metadata.vendored: body-rewritten`을 선언해야 하고, 선언 없이 마커만 지우는 것은
 * 검사를 피하는 것이다.
 */
export function extractVendoredBody(text) {
  const source = (text ?? '').replace(/\r\n/g, '\n')
  const begin = source.indexOf(BEGIN)
  const end = source.indexOf(END)

  if (begin === -1 || end === -1) return { problem: 'missing-marker' }
  if (end < begin) return { problem: 'marker-out-of-order' }
  if (source.indexOf(BEGIN, begin + 1) !== -1 || source.indexOf(END, end + 1) !== -1) {
    return { problem: 'marker-repeated' }
  }
  return { body: source.slice(begin + BEGIN.length, end).replace(/^\n+/, '').replace(/\n+$/, '') }
}

/**
 * 기록된 해시와 지금 내용이 다른 곳.
 *
 * 양방향으로 본다. 파일이 사라진 것도, 기록에 없는 파일이 생긴 것도 드리프트다 —
 * 한쪽만 보면 지우거나 더해서 빠져나갈 수 있다.
 *
 * @param {Record<string, string>} current 경로 → 해시
 * @param {Record<string, string>} recorded 경로 → 해시
 * @returns {Array<{path: string, problem: 'changed'|'missing'|'unrecorded'}>}
 */
export function findDrift(current, recorded) {
  const drift = []
  for (const [path, hash] of Object.entries(recorded ?? {})) {
    if (!Object.hasOwn(current ?? {}, path)) drift.push({ path, problem: 'missing' })
    else if (current[path] !== hash) drift.push({ path, problem: 'changed' })
  }
  for (const path of Object.keys(current ?? {})) {
    if (!Object.hasOwn(recorded ?? {}, path)) drift.push({ path, problem: 'unrecorded' })
  }
  return drift.sort((a, b) => a.path.localeCompare(b.path))
}
