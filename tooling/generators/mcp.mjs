import { isDeepStrictEqual } from 'node:util'
import { parse as parseToml } from 'smol-toml'

const BEGIN = '# BEGIN agent-harness MCP'
const END = '# END agent-harness MCP'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readToml(text) {
  try {
    return parseToml(text, { integersAsBigInt: 'asNeeded' })
  } catch {
    // 파서의 오류 본문에는 개인 설정의 토큰이 담길 수 있다.
    throw new Error('Codex MCP: TOML 문법 오류 또는 확장할 수 없는 inline 테이블이다. 개인 MCP를 [mcp_servers.<name>] 형식으로 확인한다.')
  }
}

// Claude 에이전트와 동일한 선언에서 Codex 프로젝트 서버 설정을 유도한다.
// 모르는 필드는 버리지 않는다. 인증 설정이 빠진 채 생성되는 일을 막는다.
export function renderCodexMcp(agents) {
  const servers = new Map()
  for (const agent of agents) {
    for (const entry of agent.mcpServers ?? []) {
      if (!isObject(entry)) throw new Error('MCP 서버 선언은 객체여야 한다.')
      for (const [name, config] of Object.entries(entry)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`MCP 서버 이름 오류: ${name}`)
        if (!isObject(config)) throw new Error(`MCP ${name}: 설정은 객체여야 한다.`)
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
        if (!isObject(value) || Object.values(value).some((v) => typeof v !== 'string')) {
          throw new Error(`MCP ${name}: ${key}는 문자열 값의 객체여야 한다.`)
        }
        const pairs = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
        lines.push(`${fields[key]} = { ${pairs.join(', ')} }`)
      } else {
        if (key === 'args' ? !Array.isArray(value) || value.some((v) => typeof v !== 'string') : typeof value !== 'string') {
          throw new Error(`MCP ${name}: ${key}의 형식이 올바르지 않다.`)
        }
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
  if (ends.length) {
    const first = current.slice(end).split(/\r?\n/).map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))
    if (first && !first.startsWith('[')) {
      throw new Error('Codex MCP: 관리 블록 END 뒤의 키는 마지막 서버에 속한다. 최상위 개인 설정은 BEGIN 위로 옮기고, 하위 설정은 명시적인 테이블로 시작한다.')
    }
  }
  const outside = starts.length ? current.slice(0, start) + current.slice(end) : current
  const personal = readToml(outside)
  const managed = readToml(generated).mcp_servers ?? {}
  if (personal.mcp_servers !== undefined && !isObject(personal.mcp_servers)) {
    throw new Error('Codex MCP: TOML mcp_servers는 테이블이어야 한다.')
  }
  for (const name of Object.keys(managed)) {
    if (Object.hasOwn(personal.mcp_servers ?? {}, name)) {
      throw new Error(`Codex MCP ${name}: 개인 설정과 충돌한다. 서버 선언을 소스로 옮긴다.`)
    }
  }
  const block = generated ? `${BEGIN}\n# 생성물: profiles/ · capabilities/를 고치고 npm run generate를 실행한다.\n${generated}${END}` : ''
  const result = starts.length ? current.slice(0, start) + block + current.slice(end)
    : !block ? current : current + (current && !current.endsWith('\n') ? '\n' : '') + (current ? '\n' : '') + block + '\n'
  const expected = personal
  if (Object.keys(managed).length) {
    expected.mcp_servers = Object.assign(Object.create(null), personal.mcp_servers, managed)
  }
  // 문자열 속 가짜 마커, inline 테이블 재확장, 테이블 범위 이동도 쓰기 전에 잡는다.
  if (!isDeepStrictEqual(readToml(result), expected)) {
    throw new Error('Codex MCP: 관리 블록이 TOML 설정의 의미를 바꾼다. 블록 위치를 확인한다.')
  }
  return result
}
