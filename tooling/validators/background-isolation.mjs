// 백그라운드로 도는 쓰기 역할이 격리를 선언했는지 본다.
//
// `background: true`는 그 역할이 부른 쪽을 막지 않고 돈다는 뜻이다. 부른 쪽은 그동안
// 계속 일하고, 둘이 같은 작업 트리를 본다. 쓰기 도구를 가진 역할이 그렇게 돌면 두
// 쪽이 같은 파일을 고칠 수 있다.
//
// `isolation: worktree`가 그 답이다. 격리된 역할은 자기 worktree에서 돌고 산출을
// 반환하며, 증거는 부른 쪽이 주 체크아웃에 남긴다 (ADR-0018 · operations.md §1.4.2).
//
// 규칙은 선언에서 나온다. 이 저장소의 역할 여덟 중 `background: true`가 둘이고
// `isolation: worktree`도 **정확히 그 둘**이다. 짝이 이미 맞춰져 있는데 그 짝을
// 강제하는 것이 없다 — 셋째를 백그라운드로 돌리면서 격리를 빠뜨려도 아무것도
// 빨개지지 않는다 (ADR-0028 · #84).
//
// 읽기만 하는 역할은 대상이 아니다. 같은 트리를 봐도 고치지 않으므로 부딪히지 않는다.
//
// 무엇이 쓰기 도구인지는 여기서 정하지 않는다. `tools.mjs`의 표가 단일 출처이고
// 권한 등급 대조도 같은 표를 읽는다. 목록을 두 곳에 적으면 한 곳은 낡는다 — 이
// 검사가 처음에 Write·Edit만 자기 목록으로 갖고 있었고 NotebookEdit이 빠져
// 있었다 (#88 리뷰).
//
// 그 표는 `Bash`를 read로 분류한다. 셸로 파일을 쓸 수 있지만 그것을 write로 세면
// 거의 모든 역할이 쓰기 역할이 되고, 이 규칙이 "백그라운드면 무조건 격리"가 된다.
// 못 잡는 것은 operations.md §2.4에 적는다.

import { writesFilesystem } from './tools.mjs'

/**
 * 백그라운드인데 격리 없이 쓰는 역할.
 *
 * @param {Map<string, {entrypoints?: {agents?: Array<object>}}>} capabilities
 * @returns {Array<{capability: string, agent: string}>}
 */
export function findUnisolatedBackgroundAgents(capabilities) {
  const found = []
  for (const [id, capability] of capabilities ?? []) {
    for (const agent of capability?.entrypoints?.agents ?? []) {
      if (!agent?.background) continue
      if ((agent.isolation ?? 'none') !== 'none') continue
      if (!(agent.tools ?? []).some(writesFilesystem)) continue
      found.push({ capability: id, agent: agent.id })
    }
  }
  return found
}
