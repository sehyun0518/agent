import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../', import.meta.url))
function snapshot(dir, prefix = '') {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name
    return entry.isDirectory() ? Object.entries(snapshot(join(dir, entry.name), rel + '/'))
      : [[rel, readFileSync(join(dir, entry.name), 'utf8')]]
  }))
}

test('소비 저장소 MCP 오류는 설정·역할·고아·매니페스트를 바꾸거나 삭제하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-generation-failure-'))
  const run = (...extra) => spawnSync(process.execPath,
    ['tooling/generators/generate.mjs', '--into', dir, ...extra], { cwd: root, encoding: 'utf8' })
  try {
    assert.equal(run().status, 0)
    const configPath = join(dir, '.codex/config.toml')
    const initial = readFileSync(configPath, 'utf8')
    // 이름 충돌과 깨진 관리 마커 양쪽 모두 파일을 보존해야 한다.
    for (const invalid of [
      '[mcp_servers.supabase]\nurl = "https://personal.example/mcp"\n\n' + initial,
      initial.replace('# END agent-harness MCP', '# incomplete'),
      initial + 'model = "personal"\n',
    ]) {
      writeFileSync(configPath, invalid)
      // 오류 전에 이미 렌더되는 Claude 파일도 수정되면 안 된다.
      writeFileSync(join(dir, '.claude/agents/implementation.md'), 'previous role\n')
      const manifestPath = join(dir, '.agent-harness/generated.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const stale = '.codex/agents/retired.toml'
      manifest.files.push(stale)
      writeFileSync(join(dir, stale), 'previous managed file\n')
      writeFileSync(manifestPath, JSON.stringify(manifest))
      const before = snapshot(dir)
      for (const extra of [[], ['--check']]) {
        const result = run(...extra)
        assert.notEqual(result.status, 0)
        assert.deepEqual(snapshot(dir), before, result.stderr)
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
