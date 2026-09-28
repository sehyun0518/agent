import assert from 'node:assert/strict'
import test from 'node:test'
import { parse as parseToml } from 'smol-toml'
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

test('부모 테이블·dotted key·quoted key의 개인 서버를 보존한다', () => {
  for (const original of [
    '[mcp_servers]\npersonal = { url = "https://example.com/mcp" }\n',
    'mcp_servers.personal = { url = "https://example.com/mcp" }\n',
    '["mcp_servers"]\n"personal" = { url = "https://example.com/mcp" }\n',
  ]) {
    const merged = mergeCodexMcp(original, renderCodexMcp(servers))
    assert.ok(merged.startsWith(original))
    assert.equal(parseToml(merged).mcp_servers.personal.url, 'https://example.com/mcp')
    assert.equal(mergeCodexMcp(merged, renderCodexMcp(servers)), merged)
  }
})

test('실제 이름 충돌과 확장할 수 없는 inline 부모 테이블은 구분한다', () => {
  for (const original of [
    '[mcp_servers]\nsupabase = { url = "custom" }\n',
    'mcp_servers.supabase = { url = "custom" }\n',
    '[mcp_servers."supab\\u0061se"]\nurl = "custom"\n',
  ]) assert.throws(() => mergeCodexMcp(original, renderCodexMcp(servers)), /supabase.*충돌/)
  assert.throws(() => mergeCodexMcp('mcp_servers = { personal = { url = "custom" } }\n', renderCodexMcp(servers)), /TOML/)
})

test('END 뒤의 모호한 키는 거부하고 명시적인 개인 테이블은 보존한다', () => {
  const initial = mergeCodexMcp('', renderCodexMcp(servers))
  assert.throws(() => mergeCodexMcp(initial + '# 개인 설정\nmodel = "custom"\n', renderCodexMcp(servers)), /END/)
  const suffix = '\n[projects."/work"]\ntrust_level = "trusted"\n'
  const merged = mergeCodexMcp(initial + suffix, renderCodexMcp([servers[0]]))
  assert.ok(merged.endsWith(suffix))
  assert.equal(parseToml(merged).projects['/work'].trust_level, 'trusted')
})

test('잘못된 MCP 객체와 전송 필드를 명시적으로 거부한다', () => {
  for (const config of [null, false, [], { type: 'http', url: 'https://example.com', headers: null },
    { command: 'npx', env: null }, { command: 'npx', args: 'bad' },
    { type: 'http', url: 'https://example.com', headers: { Authorization: 123 } }]) {
    assert.throws(() => renderCodexMcp([{ mcpServers: [{ invalid: config }] }]), /MCP invalid:/)
  }
  assert.throws(() => renderCodexMcp([{ mcpServers: [null] }]), /MCP.*객체/)
})

test('개인 문자열의 가짜 MCP 선언이나 관리 마커는 설정으로 해석하지 않는다', () => {
  const original = 'description = """\n[mcp_servers.supabase]\n# BEGIN agent-harness MCP\nexample\n# END agent-harness MCP\n"""\n'
  // 문자열 속 마커를 찾아 파괴적으로 바꾸는 대신 명확하게 거부해야 한다.
  assert.throws(() => mergeCodexMcp(original, renderCodexMcp(servers)), /블록|TOML/)
})
