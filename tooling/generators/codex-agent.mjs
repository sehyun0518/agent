import { renderCodexMcp } from './mcp.mjs'

// Markdown 래퍼는 사람이 읽는 진입점이고, 이 TOML이 런타임의 서브 에이전트다.
export function renderCodexAgentConfig(agent, { source, manifest, harnessPath = '', serverNames = [] }) {
  const prefix = harnessPath && harnessPath !== '.' ? `${harnessPath}/` : ''
  const skills = [...new Set((agent.skills ?? []).map((ref) => ref.split(/[:/]/).pop()))]
  const instructions = [
    `역할 원본 ${prefix}${source}를 읽고 따른다.`,
    `작업 계약과 권한은 ${prefix}${manifest}에서 읽는다. 호출된 변형과 파일 경계를 지킨다.`,
    `프로젝트 상수는 ${prefix}AGENT.md, 도메인 바인딩과 knowledge 경로는 ${prefix}profiles/*/profile.yaml을 따른다.`,
    ...skills.map((skill) => `필요한 경우 .codex/skills/${skill}/SKILL.md를 읽는다. 택일 규칙 팩은 타깃에 맞는 것만 적용한다.`),
    'MCP가 연결되지 않았거나 인증이 필요하면 부모에게 서버 이름과 오류를 보고한다. 연결 성공을 추측하지 않는다.',
    'MCP 연결이 계약 밖 원격 변경을 허용하지 않는다. 인증 비밀은 출력하거나 저장소에 기록하지 않는다.',
  ].join('\n')
  const lines = [
    '# 생성물: capabilities/ · profiles/ · packages/orchestrator/를 고치고 npm run generate를 실행한다.',
    `name = ${JSON.stringify(agent.id)}`,
    `description = ${JSON.stringify(agent.description)}`,
    `developer_instructions = ${JSON.stringify(instructions)}`,
  ]
  // 쓰기 역할은 부모의 샌드박스를 그대로 상속한다. 읽기 역할만 범위를 좁힌다.
  if (agent.readonly) lines.push('sandbox_mode = "read-only"')
  const assigned = new Set((agent.mcpServers ?? []).flatMap(Object.keys))
  const mcp = renderCodexMcp([agent])
  if (mcp) lines.push('', mcp.trimEnd())
  // 프로젝트 설정의 MCP 합집합이 미배정 역할에 자동으로 상속되지 않게 한다.
  for (const name of [...new Set(serverNames)].sort()) {
    if (!assigned.has(name)) lines.push('', `[mcp_servers.${JSON.stringify(name)}]`, 'enabled = false')
  }
  return lines.join('\n') + '\n'
}
