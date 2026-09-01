// 디렉터리를 재귀로 걷는다. 검증기와 브리핑이 같은 것을 찾아야 하므로 한 곳에 둔다.
//
// 브리핑이 처음에 한 겹만 봤다. 검증기는 재귀로 걷고 워크플로 참조까지 대조하므로,
// 중첩된 capability를 워크플로가 가리키면 **검증은 통과하는데 브리핑에서만 사라진다** —
// 터지지 않고 조용히 빈 정보를 낸다 (#92 리뷰).

import { readdirSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

export /** 디렉터리를 재귀 순회하며 조건에 맞는 파일 경로를 모은다. */
function walk(dir, match, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    // lstat이라 심볼릭 링크로 들어가지 않는다. 링크가 조상을 가리키면 무한히 돈다 —
    // profiles/ 아래에 그런 링크를 두니 ELOOP로 죽었다.
    if (lstatSync(path).isDirectory()) walk(path, match, found)
    else if (match(path)) found.push(path)
  }
  return found
}
