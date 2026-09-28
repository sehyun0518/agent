import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCodexAgentConfig } from '../generators/codex-agent.mjs'

const implementation = {
  id: 'implementation', description: '구현 역할',
  skills: ['frontend:lynx-api-docs'],
  mcpServers: [
    { supabase: { type: 'http', url: 'https://mcp.supabase.com/mcp' } },
    { posthog: { type: 'http', url: 'https://mcp.posthog.com/mcp' } },
  ],
}
const paths = {
  source: 'capabilities/implementation/agents/implementation.md',
  manifest: 'capabilities/implementation/capability.yaml',
  serverNames: ['playwright', 'supabase', 'posthog'],
}

test('Codex 네이티브 역할에 필수 필드와 구현 MCP 전송 설정을 생성한다', () => {
  const result = renderCodexAgentConfig(implementation, paths)
  assert.match(result, /^name = "implementation"/m)
  assert.match(result, /^description = "구현 역할"/m)
  assert.match(result, /^developer_instructions = /m)
  assert.match(result, /\[mcp_servers\."supabase"\]\nurl = "https:\/\/mcp.supabase.com\/mcp"/)
  assert.match(result, /\[mcp_servers\."posthog"\]\nurl = "https:\/\/mcp.posthog.com\/mcp"/)
  assert.match(result, /\[mcp_servers\."playwright"\]\nenabled = false/)
  assert.doesNotMatch(result, /^model\s*=|approval_policy|sandbox_mode/m)
})

test('MCP 미배정 역할은 부모에게서 하네스 MCP를 상속하지 않는다', () => {
  const result = renderCodexAgentConfig({ id: 'discussion', description: '논의', readonly: true }, paths)
  for (const name of paths.serverNames) {
    assert.ok(result.includes(`[mcp_servers."${name}"]\nenabled = false`))
  }
  assert.match(result, /^sandbox_mode = "read-only"/m)
})

test('소비 저장소용 역할은 하네스 소스 경로와 미러 스킬을 가리킨다', () => {
  const result = renderCodexAgentConfig(implementation, { ...paths, harnessPath: 'vendor/agent harness' })
  const line = result.split('\n').find((line) => line.startsWith('developer_instructions = '))
  assert.ok(line, '역할 지침이 생성돼야 한다')
  const instructions = JSON.parse(line.slice('developer_instructions = '.length))
  assert.ok(instructions.includes('vendor/agent harness/' + paths.source))
  assert.ok(instructions.includes('vendor/agent harness/' + paths.manifest))
  assert.ok(instructions.includes('.codex/skills/lynx-api-docs/SKILL.md'))
})
