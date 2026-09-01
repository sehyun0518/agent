// 도구가 무슨 권한을 요구하는지의 단일 출처.
//
// 두 곳이 이 표를 읽는다 — 역할의 도구가 선언한 권한 등급을 넘지 않는지 보는 쪽
// (checkAgentPermissions)과, 백그라운드 역할이 쓰는지 보는 쪽
// (findUnisolatedBackgroundAgents · ADR-0028).
//
// 목록을 두 곳에 적으면 한 곳은 낡는다. 실제로 그럴 뻔했다 — ADR-0028의 검사가
// Write·Edit만 자기 목록으로 갖고 있었고 NotebookEdit이 빠져 있었다 (#88 리뷰).
//
// `Bash`가 read인 것도 여기 있다. 셸로 파일을 쓸 수 있지만 그것을 write로 세면
// 거의 모든 역할이 쓰기 역할이 되고, 등급 대조가 아무것도 가르지 못한다. 못 잡는
// 것은 `operations.md` §2.4에 적는다.

export const TOOL_REQUIREMENTS = {
  Read: { filesystem: 'read' },
  Grep: { filesystem: 'read' },
  Glob: { filesystem: 'read' },
  Bash: { filesystem: 'read' },
  Task: {},
  Write: { filesystem: 'write' },
  Edit: { filesystem: 'write' },
  NotebookEdit: { filesystem: 'write' },
  WebFetch: { network: 'allowlist' },
  WebSearch: { network: 'allowlist' },
}

/**
 * 도구가 요구하는 권한. 모르는 도구는 null — 부르는 쪽이 보고한다.
 *
 * @param {string} tool
 * @returns {{filesystem?: string, network?: string} | null}
 */
export function toolRequirement(tool) {
  if (TOOL_REQUIREMENTS[tool]) return TOOL_REQUIREMENTS[tool]
  if (tool.startsWith('mcp__')) return { filesystem: 'read' }
  return null
}

/**
 * 파일시스템에 쓰는 도구인가. 모르는 도구는 아니라고 본다 —
 * 여기서 참으로 보면 알 수 없는 도구 하나가 역할 전체를 쓰기로 만든다.
 *
 * @param {string} tool
 * @returns {boolean}
 */
export function writesFilesystem(tool) {
  return toolRequirement(tool)?.filesystem === 'write'
}
