import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCodexMcp, mergeCodexMcp } from '../generators/mcp.mjs'

const servers = [
  { mcpServers: [{ supabase: { type: 'http', url: 'https://mcp.supabase.com/mcp' } }] },
  { mcpServers: [{ playwright: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] } }] },
]

test('MCP 선언을 Codex HTTP·stdio 설정으로 투영하고 공유 서버는 한 번만 낸다', () => {
  const result = renderCodexMcp([...servers, servers[0]])
  assert.equal(result.match(/\[mcp_servers\."supabase"\]/g).length, 1)
  assert.match(result, /url = "https:\/\/mcp.supabase.com\/mcp"/)
  assert.match(result, /command = "npx"/)
  assert.match(result, /args = \["-y","@playwright\/mcp@latest"\]/)
  assert.doesNotMatch(result, /type =/)
})

test('같은 서버 이름의 충돌과 지원하지 않는 전송 설정을 조용히 버리지 않는다', () => {
  assert.throws(() => renderCodexMcp([...servers, {
    mcpServers: [{ supabase: { type: 'http', url: 'https://other.example/mcp' } }],
  }]), /supabase/)
  assert.throws(() => renderCodexMcp([{ mcpServers: [{ legacy: { type: 'sse', url: 'https://example.com' } }] }]), /sse/)
})

test('소비 저장소의 개인 설정을 보존하며 관리 블록만 갱신하고 멱등이다', () => {
  const original = 'model = "custom"\n\n[mcp_servers.personal]\nurl = "https://example.com/mcp"\n'
  const once = mergeCodexMcp(original, renderCodexMcp(servers))
  assert.ok(once.startsWith(original))
  assert.equal(mergeCodexMcp(once, renderCodexMcp(servers)), once)
  const updated = mergeCodexMcp(once, renderCodexMcp([servers[0]]))
  assert.ok(updated.startsWith(original))
  assert.doesNotMatch(updated, /playwright/)
})

test('개인 MCP와 이름 충돌 또는 깨진 관리 블록이면 덮어쓰지 않는다', () => {
  assert.throws(() => mergeCodexMcp('[mcp_servers.supabase]\nurl = "custom"\n', renderCodexMcp(servers)), /supabase/)
  assert.throws(() => mergeCodexMcp('# BEGIN agent-harness MCP\n', renderCodexMcp(servers)), /블록/)
})
