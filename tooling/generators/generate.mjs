#!/usr/bin/env node
// capabilities/ + profiles/ + packages/orchestrator/ 를 단일 출처로 플랫폼 미러를 생성한다.
//
//   node tooling/generators/generate.mjs           미러를 쓴다
//   node tooling/generators/generate.mjs --check   쓰지 않고 드리프트만 보고한다 (CI 게이트)
//
// 생성 대상(.claude · .codex)은 직접 편집하지 않는다. 소스를 고치고 다시 생성한다.
// 생성 집합에 없는데 관리 디렉터리에 남아 있는 파일은 고아로 보고하고 제거한다.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { buildSettings, findPermissionMismatches } from './permissions.mjs'
import {
  commandsFromCapabilities,
  commandsFromProfile,
  commandsFromWorkflows,
  findDuplicateCommands,
} from './commands.mjs'

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
    if (!isDocument(profile)) {
      errors.push(`profiles/${id}/profile.yaml: 파싱 결과가 객체가 아니다. 빈 파일이거나 문법이 깨졌다.`)
      continue
    }
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
    if (!path.endsWith('.yaml')) continue
    const workflow = parseYaml(readFileSync(path, 'utf8'))
    if (!isDocument(workflow)) {
      errors.push(`${relative(ROOT, path)}: 파싱 결과가 객체가 아니다. 빈 파일이거나 문법이 깨졌다.`)
      continue
    }
    workflows.push(workflow)
  }

  // 수동 실행 대상은 계약에서 유도한다. 중앙 목록을 두면 새 변형을 넣으면서
  // 목록을 안 고쳤을 때 조용히 빠진다.
  const capabilityMap = new Map(capabilities.map((c) => [c.id, c]))
  const commands = [
    ...commandsFromWorkflows(workflows, profiles),
    ...commandsFromCapabilities(capabilityMap),
    ...profiles.flatMap((profile) => commandsFromProfile(profile)),
  ]
  for (const { name, sources: from } of findDuplicateCommands(commands)) {
    errors.push(`커맨드 이름 "${name}"이 중복됐다: ${from.join(' · ')}`)
  }

  return { agents, skills, capabilities, profiles, workflows, commands }
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

// ------------------------------------------------------------------ 공통

/**
 * 빈 파일이나 깨진 YAML은 `null`로 파싱된다.
 *
 * 걸러내지 않고 오류로 세운다. 조용히 버리면 워크플로 하나가 통째로 빠진 미러가
 * 정상처럼 생성되고, 그것이 이 PR이 고치는 바로 그 실패다 (#52). 스키마 위반은
 * `npm run validate`가 잡지만 `npm run generate`는 단독으로도 돈다.
 */
function isDocument(doc) {
  return doc !== null && typeof doc === 'object' && !Array.isArray(doc)
}

function sourcePathOf(agent) {
  return relative(ROOT, join(agent.dir, agent.file))
}

function ownerLabel(agent) {
  if (agent.owner === 'orchestrator') return '조정자 (Capability 아님)'
  if (agent.profile) return `프로파일 \`${agent.profile}\``
  return `Capability \`${agent.capability}\``
}

// ------------------------------------------------------------------ 커맨드

/**
 * 수동 실행 대상의 진입점. 본문은 얇은 래퍼다 — 절차를 여기 요약하면 소스가 바뀔 때
 * 함께 안 바뀌어 조용히 틀린 문서가 된다(ADR-0006).
 */
/**
 * 워크플로 파일에 없는 단계가 있다는 사실을 알린다.
 *
 * 삽입 지점은 프로파일이 소유하므로 여기에 옮겨 적지 않는다. 무엇이 붙는지와 어디를
 * 읽어야 하는지까지만 낸다 — 그것이 없으면 워크플로 파일을 충실히 따를수록 도메인
 * 단계가 조용히 빠진다 (#52).
 */
function renderInsertions(insertions) {
  if (!insertions || insertions.length === 0) return ''
  const byProfile = new Map()
  for (const { profile, id } of insertions) {
    if (!byProfile.has(profile)) byProfile.set(profile, [])
    byProfile.get(profile).push(id)
  }
  const lines = [...byProfile].map(
    ([profile, ids]) =>
      `- \`profiles/${profile}/profile.yaml\`의 \`workflowExtensions\` — ` +
      ids.map((id) => `\`${id}\``).join(' · '),
  )
  return (
    `**워크플로 파일에 없는 단계가 ${insertions.length}개 더 있다.**\n\n` +
    `${lines.join('\n')}\n\n` +
    `삽입 지점은 프로파일이 소유하므로 그 파일에서 읽는다. 워크플로 파일만 따르면\n` +
    `도메인 단계가 통째로 빠지고, 아무것도 그것을 지적하지 않는다.\n\n`
  )
}

function renderCommand(command) {
  const front = { description: command.description.replace(/\s+/g, ' ').slice(0, 200) }
  // 워크플로는 흐름 전체를 건네므로 본문이 다르다. 다만 순서를 여기 옮겨 적지
  // 않는 원칙은 같다 — 워크플로 파일이 바뀌면 이 파일은 그대로여야 한다.
  if (command.kind === 'workflow') {
    const source = `workflows/${command.workflow}.yaml`
    return (
      `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
      `\`${source}\`를 읽고 그 순서대로 진행한다. 단계 ${command.stepCount}개다.\n\n` +
      `각 step의 \`expect\`·\`expectAnyOf\`가 전이 조건이고, \`gate\`가 가리키는\n` +
      `\`workflows/gates/*.md\`가 무엇을 봐야 하는지 정한다. \`skippable\`이 있는 단계만\n` +
      `생략할 수 있고, 생략하면 사유를 증거로 남긴다.\n\n` +
      `순서를 여기 옮겨 적지 않는다. 워크플로 파일이 단일 출처다.\n\n` +
      renderInsertions(command.insertions) +
      `**자동이 아닌 것.** 이 저장소에는 워크플로 실행 엔진도 증거 저장소도 없다\n` +
      `(ADR-0002). 단계 호출과 증거 기록은 사람 또는 메인 에이전트가 한다. 게이트가\n` +
      `증거를 본다고 돼 있으면 그 증거를 실제로 남겼는지 직접 확인해야 한다.\n\n` +
      `Git 작업은 이 흐름에 자동으로 붙지 않는다. \`/git-commit\`처럼 따로 부른다.\n`
    )
  }

  const target =
    command.kind === 'variant'
      ? `Capability \`${command.capability}\`의 \`${command.variant}\` 변형`
      : `역할 \`${command.runner}\``

  const source =
    command.kind === 'variant'
      ? `capabilities/${command.capability}/capability.yaml`
      : `profiles/*/profile.yaml`

  return (
    `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n\n` +
    `${target}을 실행한다.\n\n` +
    `계약과 절차는 \`${source}\`가 소유한다. 이 파일은 진입점일 뿐이라 내용을 복제하지 않는다.\n\n` +
    `이 커맨드는 다른 커맨드를 이어서 부르지 않는다. 다음 단계가 필요하면 사람이 다시 부른다.\n`
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

const permissionTable = JSON.parse(readFileSync(join(ROOT, 'tooling', 'generators', 'permissions.json'), 'utf8'))

const sources = collectSources()
const { agents, skills } = sources

for (const [platform, config] of Object.entries(platforms)) {
  if (platform.startsWith('$') || !config.enabled) continue
  const out = (...parts) => join(ROOT, config.outputDir, ...parts)

  if (platform === 'claude') {
    for (const agent of agents) emit(out(config.agentDir, `${agent.id}.md`), renderClaudeAgent(agent, config))
    if (config.commandDir) {
      for (const command of sources.commands) {
        emit(out(config.commandDir, `${command.name}.md`), renderCommand(command))
      }
    }
    for (const [name, dir] of skills) {
      for (const { rel, path } of skillFiles(dir)) emit(out(config.skillDir, name, rel), readFileSync(path, 'utf8'))
    }

    // 승인 선언을 플랫폼 permission 런타임으로 투영한다 (ADR-0015). 이 저장소에는
    // 런타임이 없지만 플랫폼에는 있다 — 여기가 실제 강제를 얻는 유일한 자리다.
    const capabilityMap = new Map(sources.capabilities.map((c) => [c.id, c]))
    for (const { key, problem } of findPermissionMismatches(capabilityMap, permissionTable)) {
      errors.push(
        problem === 'unprojected'
          ? `${key}: requiresApproval인데 permissions.json에 명령 패턴이 없다. 선언이 런타임에 도달하지 않는다.`
          : `permissions.json의 "${key}": 그런 변형이 없거나 승인을 요구하지 않는다. 표가 오래됐다.`,
      )
    }
    emit(out('settings.json'), `${JSON.stringify(buildSettings(capabilityMap, permissionTable), null, 2)}\n`)
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
