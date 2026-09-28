import { isDeepStrictEqual } from 'node:util'

const BEGIN = '# BEGIN agent-harness MCP'
const END = '# END agent-harness MCP'

// Claude 에이전트와 동일한 선언에서 Codex 프로젝트 서버 설정을 유도한다.
// 모르는 필드는 버리지 않는다. 인증 설정이 빠진 채 생성되는 일을 막는다.
export function renderCodexMcp(agents) {
  const servers = new Map()
  for (const agent of agents) {
    for (const entry of agent.mcpServers ?? []) {
      for (const [name, config] of Object.entries(entry)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`MCP 서버 이름 오류: ${name}`)
        if (servers.has(name) && !isDeepStrictEqual(servers.get(name), config)) {
          throw new Error(`MCP 서버 ${name}의 설정이 서로 다르다.`)
        }
        servers.set(name, config)
      }
    }
  }
  return [...servers].sort(([a], [b]) => a.localeCompare(b)).map(([name, config]) => {
    const type = config.type ?? 'stdio'
    const fields = type === 'http'
      ? { url: 'url', headers: 'http_headers' }
      : type === 'stdio' ? { command: 'command', args: 'args', env: 'env', cwd: 'cwd' } : null
    if (!fields) throw new Error(`MCP ${name}: 지원하지 않는 전송 ${type}`)
    const required = type === 'http' ? 'url' : 'command'
    if (typeof config[required] !== 'string' || !config[required]) {
      throw new Error(`MCP ${name}: ${required}가 필요하다.`)
    }
    const lines = [`[mcp_servers.${JSON.stringify(name)}]`]
    for (const [key, value] of Object.entries(config)) {
      if (key === 'type') continue
      if (!fields[key]) throw new Error(`MCP ${name}: 지원하지 않는 필드 ${key}`)
      if (key === 'env' || key === 'headers') {
        const pairs = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
        lines.push(`${fields[key]} = { ${pairs.join(', ')} }`)
      } else {
        lines.push(`${fields[key]} = ${JSON.stringify(value)}`)
      }
    }
    return lines.join('\n') + '\n'
  }).join('\n')
}

// 소비 저장소의 모델·개인 MCP 설정은 보존하고 우리가 만든 블록만 바꾼다.
export function mergeCodexMcp(current, generated) {
  const starts = [...current.matchAll(/^# BEGIN agent-harness MCP\r?$/gm)]
  const ends = [...current.matchAll(/^# END agent-harness MCP\r?$/gm)]
  if (starts.length !== ends.length || starts.length > 1 ||
      (starts.length && starts[0].index >= ends[0].index)) {
    throw new Error('Codex MCP 관리 블록이 깨졌다. BEGIN/END를 확인한다.')
  }
  const start = starts[0]?.index
  const end = ends.length ? ends[0].index + ends[0][0].length : undefined
  const outside = starts.length ? current.slice(0, start) + current.slice(end) : current
  const names = [...generated.matchAll(/^\[mcp_servers\."([\w-]+)"\]/gm)].map((m) => m[1])
  for (const name of names) {
    // TOML의 bare/quoted table key와 하위 테이블을 모두 잡는다.
    const table = new RegExp(`^\\s*\\[\\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\\s*\\.\\s*(?:${name}|"${name}"|'${name}')\\s*(?:\\.|\\])`, 'm')
    // inline table로 선언한 개인 MCP도 덮어쓰지 않는다.
    if (table.test(outside) || /^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*(?:=|\.)/m.test(outside) ||
        /^\s*\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\]/m.test(outside)) {
      throw new Error(`Codex MCP ${name}: 개인 설정과 충돌한다. 서버 선언을 소스로 옮긴다.`)
    }
  }
  const block = generated ? `${BEGIN}\n# 생성물: profiles/ · capabilities/를 고치고 npm run generate를 실행한다.\n${generated}${END}` : ''
  if (starts.length) return current.slice(0, start) + block + current.slice(end)
  if (!block) return current
  return current + (current && !current.endsWith('\n') ? '\n' : '') + (current ? '\n' : '') + block + '\n'
}
