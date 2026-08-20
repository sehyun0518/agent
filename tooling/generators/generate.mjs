#!/usr/bin/env node
// capabilities/ + profiles/ + packages/orchestrator/ 를 단일 출처로 플랫폼 미러를 생성한다.
//
//   node tooling/generators/generate.mjs           미러를 쓴다
//   node tooling/generators/generate.mjs --check   쓰지 않고 드리프트만 보고한다 (CI 게이트)
//
// 생성 대상(.claude · .cursor · .codex)은 직접 편집하지 않는다. 소스를 고치고 다시 생성한다.
// 생성 집합에 없는데 관리 디렉터리에 남아 있는 파일은 고아로 보고하고 제거한다.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CHECK_ONLY = process.argv.includes('--check')

const platforms = JSON.parse(readFileSync(join(ROOT, 'tooling', 'generators', 'platforms.json'), 'utf8'))

const written = []
const drifted = []
const orphans = []
const errors = []
const expected = new Set()

function listDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((e) => !e.startsWith('.') && statSync(join(dir, e)).isDirectory())
}

function listFiles(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) listFiles(path, found)
    else found.push(path)
  }
  return found
}

/** 소스 md에는 frontmatter가 없다(manifest로 단일화). 실수로 남아 있으면 잡아낸다. */
function readBody(path, owner) {
  const text = readFileSync(path, 'utf8')
  if (text.startsWith('---\n')) {
    errors.push(`${relative(ROOT, path)}: 소스 본문에 frontmatter가 남아 있다. 메타데이터는 ${owner}가 소유한다.`)
  }
  return text.endsWith('\n') ? text : text + '\n'
}

/** 스킬 참조에서 표시 이름만 뽑는다. requirements/foo, frontend:foo → foo */
function skillName(ref) {
  return ref.split(/[:/]/).pop()
}

/** 스킬 디렉터리 안의 모든 파일. 규칙 팩의 rules/ 하위까지 포함한다. */
function skillFiles(dir, prefix = '', found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const path = join(dir, entry)
    const rel = prefix ? `${prefix}/${entry}` : entry
    if (statSync(path).isDirectory()) skillFiles(path, rel, found)
    else found.push({ rel, path })
  }
  return found
}

// ------------------------------------------------------------------ 소스 수집

function collectSources() {
  const agents = []
  const skills = new Map() // name → 소스 디렉터리
  const capabilities = []
  const profiles = []
  const workflows = []

  for (const id of listDirs(join(ROOT, 'capabilities'))) {
    const dir = join(ROOT, 'capabilities', id)
    const manifestPath = join(dir, 'capability.yaml')
    if (!existsSync(manifestPath)) continue
    const manifest = parseYaml(readFileSync(manifestPath, 'utf8'))
    capabilities.push(manifest)

    for (const agent of manifest.entrypoints?.agents ?? []) {
      agents.push({
        ...agent,
        owner: `capability:${id}`,
        capability: id,
        dir,
        skills: [...(manifest.entrypoints?.skills ?? [])],
        readonly: agent.readonly ?? manifest.permissions?.filesystem !== 'write',
      })
    }

    for (const name of listDirs(join(dir, 'skills'))) {
      const skillDir = join(dir, 'skills', name)
      if (existsSync(join(skillDir, 'SKILL.md'))) skills.set(name, skillDir)
    }
  }

  // 하네스가 소유하는 경계 계약 스킬. 어느 레이어에도 속하지 않는다.
  for (const name of listDirs(join(ROOT, 'packages', 'boundary-contracts'))) {
    const dir = join(ROOT, 'packages', 'boundary-contracts', name)
    if (existsSync(join(dir, 'SKILL.md'))) skills.set(name, dir)
  }

  const orchestratorPath = join(ROOT, 'packages', 'orchestrator', 'orchestrator.yaml')
  if (existsSync(orchestratorPath)) {
    const doc = parseYaml(readFileSync(orchestratorPath, 'utf8'))
    agents.push({
      ...doc.agent,
      owner: 'orchestrator',
      capability: null,
      dir: dirname(orchestratorPath),
      skills: [...(doc.skills ?? [])],
      readonly: true,
    })
  }

  for (const id of listDirs(join(ROOT, 'profiles'))) {
    const dir = join(ROOT, 'profiles', id)
    const profilePath = join(dir, 'profile.yaml')
    if (!existsSync(profilePath)) continue
    const profile = parseYaml(readFileSync(profilePath, 'utf8'))
    profiles.push(profile)

    for (const agent of profile.agents ?? []) {
      agents.push({
        ...agent,
        owner: `profile:${id}`,
        capability: null,
        profile: id,
        dir,
        skills: agent.skills ?? [],
      })
    }

    for (const skill of profile.skills ?? []) {
      const path = join(dir, skill.path)
      if (!existsSync(path) || !statSync(path).isDirectory() || !existsSync(join(path, 'SKILL.md'))) {
        errors.push(`profiles/${id}: 스킬 "${skill.id}"는 SKILL.md를 가진 디렉터리여야 한다.`)
        continue
      }
      skills.set(skill.id, path)
    }

    // 프로파일이 Capability 에이전트에 스킬·도구·MCP를 주입한다.
    for (const binding of profile.bindings ?? []) {
      const targets = agents.filter((a) => a.owner === `capability:${binding.capability}`)
      if (targets.length === 0) {
        errors.push(`profiles/${id}: 바인딩 대상 capability "${binding.capability}"를 찾을 수 없다.`)
        continue
      }
      for (const target of targets) {
        // skillsOneOf는 실행 시 택일이다. 혼용 금지는 본문 규칙이 맡는다.
        target.skills.push(...(binding.skills ?? []), ...(binding.skillsOneOf ?? []))
        if (binding.tools?.length) target.tools = [...new Set([...(target.tools ?? []), ...binding.tools])]
        if (binding.mcpServers?.length) target.mcpServers = [...(target.mcpServers ?? []), ...binding.mcpServers]
      }
    }
  }

  for (const path of listFiles(join(ROOT, 'workflows'))) {
    if (path.endsWith('.yaml')) workflows.push(parseYaml(readFileSync(path, 'utf8')))
  }

  return { agents, skills, capabilities, profiles, workflows }
}

// ------------------------------------------------------------------ Claude

function renderClaudeAgent(agent, config) {
  const front = { name: agent.id, description: agent.description }

  const model = config.modelMap[agent.modelTier ?? 'inherit']
  if (model) front.model = model

  // 비어 있지 않은 도구 목록은 기존 관행대로 쉼표 구분으로 낸다.
  // 빈 목록은 `tools: []`로 낸다 — 빈 스칼라(`tools:`)는 플랫폼이 "모든 도구"로
  // 해석하므로 도구를 주지 않으려는 의도와 정반대가 된다.
  const tools = agent.tools ?? []
  front.tools = tools.length > 0 ? tools.join(', ') : []

  const skills = [...new Set((agent.skills ?? []).map(skillName))]
  if (skills.length > 0) front.skills = skills

  if (agent.memory) front.memory = agent.memory
  if (agent.background) front.background = true
  if (agent.isolation && agent.isolation !== 'none') front.isolation = agent.isolation
  if (agent.color) front.color = agent.color
  if (agent.mcpServers?.length) front.mcpServers = agent.mcpServers

  const body = readBody(join(agent.dir, agent.file), agent.owner)
  // lineWidth: 0 — 긴 description이 접히면 사람이 읽기 어렵고 diff가 흔들린다.
  return `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n${body}`
}

// ------------------------------------------------------------------ Cursor

function sourcePathOf(agent) {
  return relative(ROOT, join(agent.dir, agent.file))
}

function ownerLabel(agent) {
  if (agent.owner === 'orchestrator') return '조정자 (Capability 아님)'
  if (agent.profile) return `프로파일 \`${agent.profile}\``
  return `Capability \`${agent.capability}\``
}

function renderCursorAgent(agent, config) {
  const front = {
    name: agent.id,
    description: agent.description,
    model: config.modelMap[agent.modelTier ?? 'inherit'],
    readonly: agent.readonly === true,
  }
  if (agent.background) front.is_background = true

  const skills = [...new Set((agent.skills ?? []).map(skillName))]
  const skillLine =
    skills.length > 0
      ? `\n\n스킬: ${skills.map((s) => `\`${s}\``).join(' · ')} (색인은 \`.cursor/rules/10-skills-index.mdc\`)`
      : ''

  return (
    `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
    `${ownerLabel(agent)}의 역할이다. 전체 정의는 저장소 \`${sourcePathOf(agent)}\`를 읽고\n` +
    `따른다(단일 출처, 복제 금지).${skillLine}\n`
  )
}

function renderCursorPipeline({ capabilities, profiles, workflows }) {
  const front = {
    description: '작업 Capability 기반 하네스 개요 — 흐름, 증거 기반 전이, 프로파일 바인딩, Git 작업 비연쇄 규칙.',
    alwaysApply: true,
  }

  const capTable = capabilities
    .map((c) => `| \`${c.id}\` | ${(c.requires ?? []).join(' · ') || '—'} | ${(c.produces ?? []).join(' · ') || '변형이 소유'} |`)
    .join('\n')

  const flowLines = workflows
    .map((w) => {
      const auto = (w.steps ?? []).filter((s) => s.trigger === 'automatic')
      const manual = (w.steps ?? []).filter((s) => s.trigger === 'manual')
      return (
        `### \`${w.id}\` — ${w.title}\n\n` +
        `자동 진행: ${auto.map((s) => s.id).join(' → ') || '없음'}\n\n` +
        `사람이 호출: ${manual.map((s) => s.id).join(' · ') || '없음'}`
      )
    })
    .join('\n\n')

  const profileLines = profiles
    .map((p) => {
      const inserts = (p.workflowExtensions ?? []).flatMap((e) =>
        (e.insert ?? []).map((i) => `\`${i.runner}\` → ${i.mode} \`${i.anchorCapability}\``),
      )
      return (
        `- \`${p.id}\` (namespace \`${p.namespace}\`) — 역할 ${(p.agents ?? []).length}, ` +
        `스킬 ${(p.skills ?? []).length}, 바인딩 ${(p.bindings ?? []).length}` +
        (inserts.length > 0 ? `\n  - 워크플로 확장: ${inserts.join(' · ')}` : '')
      )
    })
    .join('\n')

  return (
    `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
    `# 작업 Capability 하네스 (Cursor)\n\n` +
    `이 규칙은 생성물이다. 고치려면 \`capabilities/\`·\`profiles/\`·\`workflows/\`를 고치고\n` +
    `\`npm run generate\`를 돌린다.\n\n` +
    `## Capability\n\n` +
    `| id | requires | produces |\n|---|---|---|\n${capTable}\n\n` +
    `## 워크플로\n\n${flowLines}\n\n` +
    `## 전이 규칙\n\n` +
    `- 상태가 아니라 **증거**로 다음 단계로 간다. 증거가 없으면 진행하지 않고 되돌린다.\n` +
    `- 동작 구현은 같은 계층의 \`test.<layer>.red-confirmed\` 없이 시작할 수 없다. 컴파일·import 실패는 red가 아니다.\n` +
    `- \`unit\`·\`ui\`·\`integration\`·\`e2e\`를 하나의 \`test\` 단계로 합치지 않는다. 생략하려면 사유와\n` +
    `  승인을 증거로 남긴다.\n` +
    `- Git 작업(\`commit\`·\`push\`·\`pr-preview\`·\`pr-create\`·\`pr-update\`)은 서로를 자동 호출하지\n` +
    `  않고, 워크플로가 자동 단계로 두지도 않는다. 각각 사람이 명시적으로 부른다.\n` +
    `- 커밋·PR에 자동화 도구 출처 문구를 자동으로 넣지 않는다.\n\n` +
    `## 프로파일\n\n${profileLines}\n\n` +
    `도메인 지식(토큰·규칙 팩·컨벤션)은 Capability가 아니라 프로파일이 소유한다.\n`
  )
}

function renderCursorSkillsIndex({ skills, profiles }) {
  const front = {
    description: '스킬 색인. 스킬 본문은 저장소 소스에 있고 여기서 복제하지 않는다.',
    alwaysApply: false,
  }

  const rows = [...skills.entries()].map(([name, dir]) => `- \`${name}\` → \`${relative(ROOT, dir)}/SKILL.md\``).join('\n')

  const oneOf = profiles
    .flatMap((p) => (p.bindings ?? []).filter((b) => b.skillsOneOf?.length).map((b) => ({ p, b })))
    .map(
      ({ p, b }) =>
        `- \`${b.capability}\`: ${b.skillsOneOf.map((s) => `\`${skillName(s)}\``).join(' 또는 ')} ` +
        `— **택일. 섞지 않는다.** (프로파일 \`${p.id}\`)`,
    )
    .join('\n')

  return (
    `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
    `# 스킬 색인 (참조)\n\n` +
    `필요할 때 해당 파일을 연다. 복제하지 않는다.\n\n${rows}\n\n` +
    `## 택일 주입\n\n${oneOf || '없음'}\n`
  )
}

function renderCursorReadme({ agents, capabilities }, config) {
  const rows = agents
    .map(
      (a) =>
        `| \`${a.id}\` | ${ownerLabel(a).replace(/`/g, '')} | ${config.modelMap[a.modelTier ?? 'inherit']} | ` +
        `${a.readonly ? '읽기 전용' : '쓰기'} |`,
    )
    .join('\n')

  return (
    `# .cursor — 생성된 미러\n\n` +
    `**이 디렉터리는 생성물이다. 직접 편집하지 않는다.** 소스는 \`capabilities/\`·\`profiles/\`·\n` +
    `\`packages/orchestrator/\`이고, \`npm run generate\`가 여기를 만든다. CI가 재생성 결과와\n` +
    `커밋 상태를 대조하므로 손으로 고친 내용은 되돌아간다.\n\n` +
    `## 구성\n\n` +
    '```text\n.cursor/\n  README.md\n  agents/     역할 래퍼 (본문은 소스를 참조)\n' +
    '  rules/\n    00-pipeline.mdc      항상 로드 — Capability 흐름과 전이 규칙\n' +
    '    10-skills-index.mdc  스킬 색인\n```\n\n' +
    `## 로스터\n\n| 에이전트 | 소유 | 모델 | 권한 |\n|---|---|---|---|\n${rows}\n\n` +
    `## 매핑 메모\n\n` +
    `- Cursor는 frontmatter \`tools\`를 쓰지 않는다. 권한 경계는 소스의 \`permissions\`가 선언하고\n` +
    `  검증기가 검사한다.\n` +
    `- \`background: true\` → \`is_background: true\`.\n` +
    `- 모델 이름은 티어(\`cheap\`/\`strong\`)를 이 플랫폼 값으로 옮긴 것이다. 바꾸려면\n` +
    `  \`tooling/generators/platforms.json\`을 고친다.\n\n` +
    `Capability ${capabilities.length}종의 계약은 각 \`capabilities/<id>/capability.yaml\`이 단일 출처다.\n`
  )
}

// ------------------------------------------------------------------ Codex

function renderCodexAgent(agent) {
  const front = { name: agent.id, source: sourcePathOf(agent) }
  if (agent.capability) front.capability = agent.capability
  if (agent.profile) front.profile = agent.profile

  const skills = [...new Set((agent.skills ?? []).map(skillName))]
  if (skills.length > 0) front.skills = skills

  return (
    `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
    `# ${agent.id} (Codex 래퍼)\n\n` +
    `${ownerLabel(agent)}의 역할이다. 원본은 \`${sourcePathOf(agent)}\`.\n\n` +
    `## 사용\n\n` +
    `1. \`${sourcePathOf(agent)}\`를 읽고 따른다.\n` +
    `2. 필요한 스킬은 \`.codex/skills/<skill>/SKILL.md\`에서 읽는다. 대형 규칙 팩은 필요한\n` +
    `   rule 파일만 추가로 연다.\n` +
    `3. 이 래퍼는 원본을 복제하지 않는다. 역할을 바꾸려면 원본을 고친다.\n`
  )
}

function renderCodexEntry({ capabilities, workflows, profiles }) {
  const capList = capabilities.map((c) => `- \`${c.id}\` — ${c.title}`).join('\n')
  const wfList = workflows.map((w) => `- \`${w.id}\` — ${w.title}`).join('\n')
  const prList = profiles.map((p) => `- \`${p.id}\` — ${p.title ?? p.id}`).join('\n')

  return (
    `# Codex Agent Harness\n\n` +
    `**이 파일은 생성물이다. 직접 편집하지 않는다.** 소스를 고치고 \`npm run generate\`를 돌린다.\n\n` +
    `## 단일 출처\n\n` +
    `| 영역 | 위치 |\n|---|---|\n` +
    `| 작업 계약 | \`capabilities/<id>/capability.yaml\` |\n` +
    `| 역할 본문 | \`capabilities/<id>/agents/\` · \`profiles/<id>/agents/\` |\n` +
    `| 도메인 바인딩 | \`profiles/<id>/profile.yaml\` |\n` +
    `| 조정자 | \`packages/orchestrator/\` |\n` +
    `| 워크플로 | \`workflows/\` |\n` +
    `| 정책 | \`policies/\` |\n` +
    `| 어휘 | \`docs/vocabulary.md\` |\n\n` +
    `\`.codex/\`는 Codex 운용을 위한 얇은 래퍼와 \`SKILL.md\` 미러만 둔다.\n\n` +
    `## Capability\n\n${capList}\n\n` +
    `## 워크플로\n\n${wfList}\n\n` +
    `## 프로파일\n\n${prList}\n\n` +
    `## 운용 원칙\n\n` +
    `1. 요구사항이 모호하면 \`requirements\`부터 시작해 스펙을 완결한다.\n` +
    `2. 스펙이 충분하면 \`packages/orchestrator/orchestrator.md\`를 기준으로 분해한다.\n` +
    `3. 역할 실행은 \`.codex/agents/<id>.md\`를 열고 그 \`source\` 원본을 함께 따른다.\n` +
    `4. **증거 없이 다음 단계로 가지 않는다.** 상태 플래그가 아니라 증거가 전이 근거다.\n` +
    `5. 동작 구현은 같은 계층의 \`test.<layer>.red-confirmed\` 없이 시작하지 않는다.\n` +
    `6. Git 작업은 서로 연쇄하지 않는다. 커밋·푸시·PR을 각각 명시적으로 호출한다.\n` +
    `7. 커밋·PR에 자동화 도구 출처 문구를 자동으로 넣지 않는다.\n\n` +
    `## 드리프트 방지\n\n` +
    `\`.codex/agents/*\`는 원본을 복제하지 않는다. 역할을 바꾸려면 소스를 고치고 재생성한다.\n` +
    `CI가 재생성 결과와 커밋 상태를 대조한다.\n`
  )
}

// ------------------------------------------------------------------ 출력

function emit(path, content) {
  const rel = relative(ROOT, path)
  expected.add(rel)

  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current === content) return

  if (CHECK_ONLY) {
    drifted.push(rel)
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  written.push(rel)
}

const sources = collectSources()
const { agents, skills } = sources

for (const [platform, config] of Object.entries(platforms)) {
  if (platform.startsWith('$') || !config.enabled) continue
  const out = (...parts) => join(ROOT, config.outputDir, ...parts)

  if (platform === 'claude') {
    for (const agent of agents) emit(out(config.agentDir, `${agent.id}.md`), renderClaudeAgent(agent, config))
    for (const [name, dir] of skills) {
      for (const { rel, path } of skillFiles(dir)) emit(out(config.skillDir, name, rel), readFileSync(path, 'utf8'))
    }
  } else if (platform === 'cursor') {
    for (const agent of agents) emit(out(config.agentDir, `${agent.id}.md`), renderCursorAgent(agent, config))
    emit(out('rules', '00-pipeline.mdc'), renderCursorPipeline(sources))
    emit(out('rules', '10-skills-index.mdc'), renderCursorSkillsIndex(sources))
    emit(out('README.md'), renderCursorReadme(sources, config))
  } else if (platform === 'codex') {
    for (const agent of agents) emit(out(config.agentDir, `${agent.id}.md`), renderCodexAgent(agent))
    for (const [name, dir] of skills) {
      for (const { rel, path } of skillFiles(dir)) emit(out(config.skillDir, name, rel), readFileSync(path, 'utf8'))
    }
    emit(out('AGENTS.md'), renderCodexEntry(sources))
    emit(
      out('README.md'),
      `# .codex — 생성된 미러\n\n` +
        `**이 디렉터리는 생성물이다. 직접 편집하지 않는다.** 진입점은 \`.codex/AGENTS.md\`.\n\n` +
        `- \`agents/\` — 역할 래퍼. 본문은 각 \`source\`가 가리키는 소스가 단일 출처다.\n` +
        `- \`skills/\` — \`SKILL.md\` 미러. 규칙 팩은 \`rules/\` 하위까지 그대로 옮긴다.\n\n` +
        `수정은 \`capabilities/\`·\`profiles/\`·\`packages/orchestrator/\`에서 하고\n` +
        `\`npm run generate\`를 돌린다. CI가 재생성 결과와 커밋 상태를 대조한다.\n`,
    )
  } else {
    errors.push(`플랫폼 "${platform}"이 켜져 있지만 렌더러가 없다.`)
  }
}

// ------------------------------------------------- 고아 정리
// 생성 집합에 없는데 관리 디렉터리에 남아 있는 파일. 이름이 바뀐 역할의 옛 파일이
// 그대로 남으면 플랫폼이 그걸 계속 읽는다.

for (const [platform, config] of Object.entries(platforms)) {
  if (platform.startsWith('$') || !config.enabled) continue
  for (const sub of [config.agentDir, config.skillDir, 'rules'].filter(Boolean)) {
    for (const path of listFiles(join(ROOT, config.outputDir, sub))) {
      const rel = relative(ROOT, path)
      if (expected.has(rel)) continue
      orphans.push(rel)
      if (!CHECK_ONLY) rmSync(path)
    }
  }
}

// ------------------------------------------------------------------ 보고

console.log(
  `소스: 에이전트 ${agents.length}, 스킬 ${skills.size}, ` +
    `Capability ${sources.capabilities.length}, 워크플로 ${sources.workflows.length}`,
)

if (errors.length > 0) {
  console.error('\n오류:')
  for (const message of errors) console.error(`  ✗ ${message}`)
  process.exit(1)
}

if (CHECK_ONLY) {
  if (drifted.length + orphans.length > 0) {
    if (drifted.length > 0) {
      console.error(`\n드리프트 ${drifted.length}건 — 생성 결과가 커밋 상태와 다르다:`)
      for (const path of drifted) console.error(`  ✗ ${path}`)
    }
    if (orphans.length > 0) {
      console.error(`\n고아 ${orphans.length}건 — 소스에 대응이 없는 생성물:`)
      for (const path of orphans) console.error(`  ✗ ${path}`)
    }
    console.error('\n`npm run generate`로 다시 생성하고 커밋해라. 미러를 직접 편집하지 않는다.')
    process.exit(1)
  }
  console.log('드리프트 없음.')
} else {
  if (written.length === 0 && orphans.length === 0) console.log('변경 없음.')
  for (const path of written) console.log(`  wrote   ${path}`)
  for (const path of orphans) console.log(`  removed ${path}`)
}
