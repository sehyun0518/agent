#!/usr/bin/env node
// 하네스 선언 파일 검증기.
//
// Phase 1 범위: JSON Schema 검증 + 코어 어휘 등록 검사.
// Phase 2 이후 확장 예정: 참조 무결성, 권한 대 도구 대조, 정책 우선순위 위반,
// 워크플로 선행조건 도달 가능성, 미러 드리프트.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js' // 스키마가 draft 2020-12를 쓴다
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'
import { librarySignature } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'
import { resolveRunners, findUnresolvedRunners, findDuplicateInserts } from './profile-roster.mjs'
import { findDocumentationBypass } from './documentation-gate.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMA_DIR = join(ROOT, 'packages', 'manifest-contracts')
const POLICY_SCHEMA_DIR = join(ROOT, 'packages', 'policy-contracts')

const problems = []
const checked = []

function fail(file, message) {
  problems.push({ file: relative(ROOT, file), message })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readYaml(path) {
  try {
    return parseYaml(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(path, `YAML 파싱 실패: ${error.message}`)
    return null
  }
}

/** 디렉터리를 재귀 순회하며 조건에 맞는 파일 경로를 모은다. */
function walk(dir, match, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, match, found)
    else if (match(path)) found.push(path)
  }
  return found
}

// ---------------------------------------------------------------- 스키마 준비

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const schemas = {
  capability: ajv.compile(readJson(join(SCHEMA_DIR, 'capability.schema.json'))),
  profile: ajv.compile(readJson(join(SCHEMA_DIR, 'profile.schema.json'))),
  workflow: ajv.compile(readJson(join(SCHEMA_DIR, 'workflow.schema.json'))),
  policy: ajv.compile(readJson(join(POLICY_SCHEMA_DIR, 'policy.schema.json'))),
  orchestrator: ajv.compile(readJson(join(SCHEMA_DIR, 'orchestrator.schema.json'))),
}

const vocabulary = readJson(join(SCHEMA_DIR, 'vocabulary.json'))
const CORE_SIGNALS = new Set(Object.keys(vocabulary.signals))
const CORE_ARTIFACTS = new Set(Object.keys(vocabulary.artifacts))
const CORE_EVIDENCE = new Set(Object.keys(vocabulary.evidence))
const CORE_TOKENS = new Set([...CORE_SIGNALS, ...CORE_ARTIFACTS, ...CORE_EVIDENCE])

/**
 * 검사할 profile 경로 전체.
 * examples/ 아래 소비 저장소 예시는 `.agent-harness/`라는 dot 디렉터리에 있어
 * walk가 건너뛴다. 스키마가 실제 소비 설정을 표현할 수 있는지 확인해야 하므로
 * 명시적으로 더한다.
 */
function collectProfilePaths() {
  const paths = walk(join(ROOT, 'profiles'), (p) => basename(p) === 'profile.yaml')
  const consumer = join(ROOT, 'examples', 'consumer-repo', '.agent-harness', 'profile.yaml')
  if (existsSync(consumer)) paths.push(consumer)
  return paths
}

const PROFILE_PATHS = collectProfilePaths()

/** 프로파일이 선언한 네임스페이스. 확장 토큰의 접두사는 여기 등록돼 있어야 한다. */
function collectNamespaces() {
  const namespaces = new Set()
  for (const path of PROFILE_PATHS) {
    const doc = readYaml(path)
    if (doc?.namespace) namespaces.add(doc.namespace)
  }
  return namespaces
}

const NAMESPACES = collectNamespaces()

// ---------------------------------------------------------------- 어휘 검사

/**
 * 접두사 없는 토큰은 코어 어휘에 등록돼 있어야 한다.
 * 접두사가 있으면 그 네임스페이스를 선언한 프로파일이 존재해야 한다.
 */
function checkToken(file, token, allowed, context) {
  const colon = token.indexOf(':')
  if (colon !== -1) {
    const namespace = token.slice(0, colon)
    if (!NAMESPACES.has(namespace)) {
      fail(file, `${context}: 알 수 없는 네임스페이스 "${namespace}" (${token}). 프로파일이 선언해야 한다.`)
    }
    return
  }
  if (!allowed.has(token)) {
    fail(file, `${context}: 미등록 코어 토큰 "${token}". docs/vocabulary.md와 vocabulary.json에 추가하거나 오타를 고쳐라.`)
  }
}

function checkEvidenceStatus(file, kind, status, context) {
  if (kind.includes(':')) return // 프로파일 확장 증거는 코어가 status를 규정하지 않는다
  const spec = vocabulary.evidence[kind]
  if (!spec) return // 미등록은 checkToken이 이미 잡는다
  if (!spec.statuses.includes(status)) {
    fail(file, `${context}: "${kind}"의 status "${status}"는 허용되지 않는다. 허용: ${spec.statuses.join(', ')}`)
  }
}

/** capability.yaml 하나의 어휘·자기일관성 검사. variants도 같은 규칙을 적용한다. */
function checkCapabilityTokens(file, doc) {
  const scopes = [
    { label: 'capability', node: doc },
    ...Object.entries(doc.variants ?? {}).map(([name, node]) => ({ label: `variant:${name}`, node })),
  ]

  for (const { label, node } of scopes) {
    for (const token of node.requires ?? []) {
      checkToken(file, token, new Set([...CORE_SIGNALS, ...CORE_ARTIFACTS]), `${label}.requires`)
    }
    for (const token of node.produces ?? []) {
      checkToken(file, token, new Set([...CORE_SIGNALS, ...CORE_ARTIFACTS]), `${label}.produces`)
    }

    const declaredEvidence = new Set()
    for (const item of node.evidence ?? []) {
      checkToken(file, item.kind, CORE_EVIDENCE, `${label}.evidence`)
      declaredEvidence.add(item.kind)
    }

    // completion은 자기가 선언한 증거만 요구할 수 있다.
    // 루트 completion은 루트 evidence를, variant는 자기 evidence를 본다.
    const completion = label === 'capability' ? doc.completion : node.completion
    if (completion) {
      for (const kind of completion.requiresEvidence ?? []) {
        if (!declaredEvidence.has(kind)) {
          fail(file, `${label}.completion: "${kind}"를 요구하지만 evidence에 선언되지 않았다.`)
        }
      }
      for (const [kind, status] of Object.entries(completion.expectedStatus ?? {})) {
        if (!declaredEvidence.has(kind)) {
          fail(file, `${label}.completion.expectedStatus: 선언되지 않은 증거 "${kind}".`)
        }
        checkEvidenceStatus(file, kind, status, `${label}.completion.expectedStatus`)
      }
    }
  }

  // 참조 무결성: manifest가 가리키는 파일이 실재하는지.
  checkReferences(file, doc)

  // 레이어 독립성: 이웃 이름을 알고 있지 않은지.
  checkLayerIndependence(file, doc)

  // 2계층 권한: 도구가 의미 권한을 넘지 않는지.
  checkAgentPermissions(file, doc.entrypoints?.agents, doc.permissions, 'capability')
  for (const [name, variant] of Object.entries(doc.variants ?? {})) {
    const permissions = variant.permissions ?? doc.permissions
    checkAgentPermissions(file, variant.entrypoints?.agents, permissions, `variant:${name}`)
    checkDestructiveApproval(file, { ...variant, permissions }, `variant:${name}`)
  }
  if (!doc.variants) checkDestructiveApproval(file, doc, 'capability')

  // 디렉터리명과 id가 어긋나면 참조가 깨진다.
  const dir = basename(dirname(file))
  if (doc.id !== dir) {
    fail(file, `id "${doc.id}"가 디렉터리명 "${dir}"과 다르다.`)
  }
}

// ---------------------------------------------------------------- 2계층 권한 검사
// policies/permissions/filesystem-boundary.yaml · network-access.yaml 이 요구하는 검사.
// 의미 권한(capability.permissions)과 구체 도구 목록을 대조한다.

const FS_RANK = { none: 0, read: 1, write: 2 }
const NET_RANK = { none: 0, allowlist: 1, any: 2 }

/**
 * 도구가 요구하는 최소 권한.
 * mcp__playwright는 로컬 렌더 확인 용도라 filesystem:read로 본다 — 외부 호스트로
 * 나가는 것은 런타임의 network 정책이 따로 판정한다.
 */
const TOOL_REQUIREMENTS = {
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

function toolRequirement(tool) {
  if (TOOL_REQUIREMENTS[tool]) return TOOL_REQUIREMENTS[tool]
  if (tool.startsWith('mcp__')) return { filesystem: 'read' }
  return null // 알 수 없는 도구는 아래에서 보고한다
}

function checkAgentPermissions(file, agents, permissions, label) {
  if (!permissions) return
  for (const agent of agents ?? []) {
    for (const tool of agent.tools ?? []) {
      const need = toolRequirement(tool)
      if (need === null) {
        fail(file, `${label} 에이전트 "${agent.id}": 알 수 없는 도구 "${tool}". 권한 매핑에 추가해라.`)
        continue
      }
      if (need.filesystem && FS_RANK[need.filesystem] > FS_RANK[permissions.filesystem]) {
        fail(
          file,
          `${label} 에이전트 "${agent.id}": 도구 "${tool}"은 filesystem:${need.filesystem}가 ` +
            `필요한데 선언은 ${permissions.filesystem}이다. (policy: filesystem-boundary)`,
        )
      }
      if (need.network && NET_RANK[need.network] > NET_RANK[permissions.network]) {
        fail(
          file,
          `${label} 에이전트 "${agent.id}": 도구 "${tool}"은 network:${need.network}가 ` +
            `필요한데 선언은 ${permissions.network}이다. (policy: network-access)`,
        )
      }
    }
  }
}

/** policies/destructive-actions/destructive-approval.yaml 이 요구하는 검사. */
function checkDestructiveApproval(file, scope, label) {
  if (scope.permissions?.destructive !== true) return
  if (scope.requiresApproval !== true) {
    fail(file, `${label}: 파괴적 작업인데 requiresApproval이 없다. (policy: destructive-approval)`)
  }
  const kinds = new Set((scope.evidence ?? []).map((e) => e.kind))
  if (!kinds.has('approval-record')) {
    fail(file, `${label}: 파괴적 작업은 approval-record 증거를 선언해야 한다. (policy: destructive-approval)`)
  }
}

/**
 * manifest의 entrypoints가 가리키는 파일이 실재하는지 본다.
 * 없는 파일을 가리키는 진입점은 실행 시점에야 드러나므로 여기서 잡는다.
 */
function checkReferences(file, doc) {
  const dir = dirname(file)
  const scopes = [
    { label: 'capability', node: doc },
    ...Object.entries(doc.variants ?? {}).map(([name, node]) => ({ label: `variant:${name}`, node })),
  ]

  for (const { label, node } of scopes) {
    for (const agent of node.entrypoints?.agents ?? []) {
      if (!existsSync(join(dir, agent.file))) {
        fail(file, `${label} 에이전트 "${agent.id}": 파일 "${agent.file}"가 없다.`)
      }
    }
    for (const hook of node.entrypoints?.hooks ?? []) {
      if (!existsSync(join(dir, hook.file))) {
        fail(file, `${label} 훅 "${hook.event}": 파일 "${hook.file}"가 없다.`)
      }
    }
    for (const tool of node.entrypoints?.tools ?? []) {
      if (!existsSync(join(dir, tool.file))) {
        fail(file, `${label} 도구 "${tool.id}": 파일 "${tool.file}"가 없다.`)
      }
    }
    for (const ref of node.entrypoints?.skills ?? []) {
      if (!resolveSkill(ref)) {
        fail(file, `${label}: 스킬 참조 "${ref}"를 찾을 수 없다.`)
      }
    }
  }
}

/**
 * 스킬 참조를 실제 경로로 푼다.
 *   foo                  자기 Capability 안
 *   <capability>/foo     교차 참조
 *   <namespace>:foo      프로파일 스킬
 */
function resolveSkill(ref) {
  // contracts/<name> — 하네스가 소유하는 경계 계약.
  // 경계마다 검사되는 불변식은 한 레이어의 소유물이 될 수 없다.
  if (ref.startsWith('contracts/')) {
    return existsSync(join(ROOT, 'packages', 'boundary-contracts', ref.slice('contracts/'.length), 'SKILL.md'))
  }
  if (ref.includes(':')) {
    const [namespace, name] = ref.split(':')
    for (const path of PROFILE_PATHS) {
      const profile = readYaml(path)
      if (profile?.namespace !== namespace) continue
      const entry = (profile.skills ?? []).find((s) => s.id === name)
      if (entry && existsSync(join(dirname(path), entry.path, 'SKILL.md'))) return true
    }
    return false
  }
  const [capability, name] = ref.includes('/') ? ref.split('/') : [null, ref]
  if (capability) return existsSync(join(ROOT, 'capabilities', capability, 'skills', name, 'SKILL.md'))
  // 접두사 없는 참조는 어느 Capability에든 있으면 통과한다.
  return walk(join(ROOT, 'capabilities'), (p) => basename(p) === 'SKILL.md').some(
    (p) => basename(dirname(p)) === name,
  )
}

/** capability.yaml 전체를 id → 문서로 읽는다. 워크플로 교차 검증에 쓴다. */
function loadCapabilities() {
  const map = new Map()
  for (const path of walk(join(ROOT, 'capabilities'), (p) => basename(p) === 'capability.yaml')) {
    const doc = readYaml(path)
    if (doc?.id) map.set(doc.id, doc)
  }
  return map
}

const CAPABILITIES = loadCapabilities()

/** step.gate는 문자열 하나 또는 배열이다. 둘을 같은 목록으로 다룬다. */
function gateNames(gate) {
  if (!gate) return []
  return Array.isArray(gate) ? gate : [gate]
}

/**
 * 워크플로 단계가 실제 Capability 계약과 맞는지 본다.
 * 여기가 없으면 manifest는 통과하는데 워크플로가 계약을 어기는 상태가 가능해진다.
 */
function checkWorkflowSteps(file, doc) {
  for (const step of doc.steps ?? []) {
    const capability = CAPABILITIES.get(step.capability)
    if (!capability) {
      fail(file, `step:${step.id}: 알 수 없는 capability "${step.capability}".`)
      continue
    }

    const variants = capability.variants ?? null
    let scope = capability

    if (variants) {
      if (!step.variant) {
        fail(
          file,
          `step:${step.id}: "${step.capability}"는 변형을 가지므로 variant를 지정해야 한다. ` +
            `허용: ${Object.keys(variants).join(', ')}. 여러 층을 한 단계로 합치지 않는다.`,
        )
        continue
      }
      if (!variants[step.variant]) {
        fail(file, `step:${step.id}: "${step.capability}"에 변형 "${step.variant}"가 없다.`)
        continue
      }
      scope = variants[step.variant]
    } else if (step.variant) {
      fail(file, `step:${step.id}: "${step.capability}"는 변형이 없는데 variant를 지정했다.`)
    }

    // 자동 진행 금지 판정. 셋 중 하나라도 걸리면 사람이 명시적으로 불러야 한다.
    if (step.trigger === 'automatic') {
      const destructive = (scope.permissions ?? capability.permissions)?.destructive === true
      if (capability.chaining?.autoTriggerable === false) {
        fail(
          file,
          `step:${step.id}: "${step.capability}"는 chaining.autoTriggerable이 false라서 ` +
            `automatic 트리거로 둘 수 없다. trigger를 manual로 바꿔라.`,
        )
      } else if (destructive) {
        fail(
          file,
          `step:${step.id}: 파괴적 작업(permissions.destructive)은 자동 진행할 수 없다. ` +
            `trigger를 manual로 바꿔라.`,
        )
      } else if (scope.requiresApproval === true) {
        fail(file, `step:${step.id}: 승인이 필요한 작업은 자동 진행할 수 없다.`)
      }
    }

    // 워크플로가 Capability의 산출을 넓힐 수는 없다.
    const declared = new Set([...(capability.produces ?? []), ...(scope.produces ?? [])])
    for (const token of step.produces ?? []) {
      if (!declared.has(token)) {
        fail(
          file,
          `step:${step.id}: "${token}"은 "${step.capability}"${step.variant ? `#${step.variant}` : ''}의 ` +
            `produces에 없다. 워크플로는 산출을 좁힐 수만 있다.`,
        )
      }
    }

    // 이관 게이트는 하네스가 소유한다. 파일이 실재해야 한다.
    // 판정 축이 둘 이상이면 배열로 나열한다. 어느 표기든 각 게이트의 파일이 실재해야 한다.
    for (const gate of gateNames(step.gate)) {
      if (!existsSync(join(ROOT, 'workflows', 'gates', `${gate}.md`))) {
        fail(file, `step:${step.id}: 게이트 "workflows/gates/${gate}.md"가 없다.`)
      }
    }

    // 승인이 필요한 생략은 승인 증거를 남길 수 있어야 한다.
    if (step.skippable?.approvalRequired && !CORE_EVIDENCE.has('approval-record')) {
      fail(file, `step:${step.id}: approval-record 증거가 어휘에 없다.`)
    }
  }
}

function checkWorkflowTokens(file, doc) {
  checkWorkflowSteps(file, doc)
  const steps = doc.steps ?? []
  const stepIds = new Set(steps.map((step) => step.id))
  const graph = createWorkflowGraph(steps)
  for (const id of graph.duplicates) fail(file, `step id "${id}"가 중복됐다.`)
  for (const { step, dependency } of graph.unknownDependencies) {
    fail(file, `step:${step}.dependsOn: 알 수 없는 step "${dependency}".`)
  }
  for (const cycle of graph.cycles) fail(file, `dependsOn 순환이 있다: ${cycle.join(' → ')}`)

  function checkExpectation(step, item, context) {
    checkToken(file, item.evidence, CORE_EVIDENCE, context)
    checkEvidenceStatus(file, item.evidence, item.status, context)
    if (item.from && !stepIds.has(item.from)) {
      fail(file, `${context}.from: 알 수 없는 step "${item.from}".`)
    } else if (item.from && !graph.ancestorsOf(step.id).has(item.from)) {
      fail(file, `${context}.from: step "${item.from}"은 "${step.id}"의 선행 단계가 아니다.`)
    }
  }

  for (const step of steps) {
    for (const token of step.produces ?? []) {
      checkToken(file, token, new Set([...CORE_SIGNALS, ...CORE_ARTIFACTS]), `step:${step.id}.produces`)
    }
    for (const item of step.expect ?? []) {
      checkExpectation(step, item, `step:${step.id}.expect`)
    }
    for (const [groupIndex, group] of (step.expectAnyOf ?? []).entries()) {
      for (const item of group.conditions ?? []) {
        checkExpectation(step, item, `step:${step.id}.expectAnyOf[${groupIndex}]`)
      }
    }
    if (step.skippable) {
      checkToken(file, step.skippable.evidenceOnSkip, CORE_EVIDENCE, `step:${step.id}.skippable`)
    }

    const capability = CAPABILITIES.get(step.capability)
    const scope = capability?.variants?.[step.variant] ?? capability
    const requiredTokens = [...(capability?.requires ?? []), ...(scope?.requires ?? [])]
    for (const token of new Set(requiredTokens)) {
      const candidates = graph.producerIds(token)
      if (candidates.length > 0 && !graph.hasAncestorProducer(step.id, token)) {
        fail(
          file,
          `step:${step.id}: 선행 토큰 "${token}"의 생산 단계(${candidates.join(', ')})가 의존 그래프 조상이 아니다.`,
        )
      }
    }
  }

  // 위 검사는 생산 단계가 이미 있을 때만 조상 여부를 본다. 단계를 통째로 뺀 우회는
  // 그 검사에 걸리지 않으므로 따로 본다.
  for (const { stepId, reason } of findDocumentationBypass(steps, graph)) {
    fail(
      file,
      reason === 'missing'
        ? `step:${stepId}: 판정 단계가 있는데 documentation 단계가 없다. 문서 결과 없이 판정으로 갈 수 없다.`
        : `step:${stepId}: documentation 단계가 판정 단계의 의존 그래프 조상이 아니다.`,
    )
  }
}

/**
 * 레이어가 이웃 레이어의 이름을 알면 단독으로 쓸 수 없다.
 * 레이어는 requires/produces 토큰으로만 말하고, 누가 그 토큰을 만드는지는
 * 하네스(워크플로·프로파일 routing)가 안다.
 */
function checkLayerIndependence(file, doc) {
  const dir = dirname(file)
  const neighbours = [...CAPABILITIES.keys()].filter((id) => id !== doc.id)
  if (neighbours.length === 0) return

  const bodies = [
    ...(doc.entrypoints?.agents ?? []),
    ...Object.values(doc.variants ?? {}).flatMap((v) => v.entrypoints?.agents ?? []),
  ].map((a) => join(dir, a.file))

  for (const path of bodies) {
    if (!existsSync(path)) continue
    const body = readFileSync(path, 'utf8')
    for (const id of neighbours) {
      const hits = body.match(new RegExp(`\\\`${id}\\\``, 'g'))
      if (hits) {
        fail(
          path,
          `이웃 레이어 "${id}"를 ${hits.length}회 이름으로 참조한다. ` +
            `토큰(requires/produces)으로 말하고 누가 만드는지는 하네스가 알게 해라.`,
        )
      }
    }
  }
}

/**
 * 조정자 본체가 도메인 무지 상태로 남아 있는지 검사한다.
 * 여기가 뚫리면 Capability를 추가할 때마다 중앙 문서를 고쳐야 하는 구조로 되돌아간다.
 */
function checkOrchestratorPurity(file, doc) {
  const bodyPath = join(dirname(file), doc.agent.file)
  if (!existsSync(bodyPath)) {
    fail(file, `agent.file이 가리키는 "${doc.agent.file}"가 없다.`)
    return
  }
  const body = readFileSync(bodyPath, 'utf8')
  for (const term of doc.forbiddenReferences ?? []) {
    if (body.includes(term)) {
      fail(bodyPath, `조정자 본체에 도메인 참조 "${term}"이 있다. 프로파일로 옮겨라.`)
    }
  }
}

/** workflows/*.yaml 전체. 프로파일의 워크플로 확장 검증에 쓴다. */
function loadWorkflows() {
  const map = new Map()
  for (const path of walk(join(ROOT, 'workflows'), (p) => p.endsWith('.yaml'))) {
    const doc = readYaml(path)
    if (doc?.id) map.set(doc.id, doc)
  }
  return map
}

const WORKFLOWS = loadWorkflows()

/**
 * 프로파일이 워크플로에 끼워 넣는 도메인 단계를 검사한다.
 * 순서의 단일 출처는 워크플로이고 프로파일은 삽입 지점만 선언한다 — 두 곳에서
 * 경쟁하는 순서 정의를 두지 않기 위해서다.
 */
function checkWorkflowExtensions(file, doc) {
  const runners = resolveRunners(CAPABILITIES, doc.agents ?? [])

  // roster는 오케스트레이터가 실행자 이름을 아는 유일한 통로이고, routing은 판정 결과가
  // 되돌아갈 소유자를 정한다. 둘 중 하나라도 실재하지 않는 이름을 담으면 그 경로는
  // 런타임에 끊긴다 — 삽입 지점과 같은 규칙으로 선언 시점에 잡는다.
  for (const { field, index, name, label } of findUnresolvedRunners(doc, runners)) {
    fail(file, `${field}[${index}] "${label}": 실행자 "${name}"가 없다.`)
  }

  // 삽입 하나씩 보는 아래 검사는 겹침을 놓친다. workflow "*"가 특정 워크플로 블록과
  // 겹치면 같은 단계가 두 번 들어가는데, 각각은 모든 조건을 만족하기 때문이다.
  for (const { workflowId, insertId, count } of findDuplicateInserts(doc, WORKFLOWS)) {
    fail(file, `workflowExtensions/${insertId}: 워크플로 "${workflowId}"에 ${count}번 삽입된다. step id는 하나여야 한다.`)
  }

  for (const extension of doc.workflowExtensions ?? []) {
    const targets =
      extension.workflow === '*' ? [...WORKFLOWS.values()] : [WORKFLOWS.get(extension.workflow)].filter(Boolean)

    if (targets.length === 0) {
      fail(file, `workflowExtensions: 알 수 없는 워크플로 "${extension.workflow}".`)
      continue
    }

    for (const insert of extension.insert ?? []) {
      if (!runners.has(insert.runner)) {
        fail(file, `workflowExtensions/${insert.id}: 실행자 "${insert.runner}"가 없다.`)
      }

      // 대상 워크플로에 앵커 Capability가 없으면 그 흐름에는 해당 단계가 없다는 뜻이다.
      // 건너뛰는 것이 정상이므로 실패로 보지 않는다. 다만 어디에도 없으면 오타다.
      let anchoredAnywhere = false
      for (const workflow of targets) {
        const matches = (workflow.steps ?? []).filter((s) => s.capability === insert.anchorCapability)
        if (matches.length === 0) continue
        anchoredAnywhere = true
        if (matches.length > 1 && !insert.anchorStep) {
          fail(
            file,
            `workflowExtensions/${insert.id}: 워크플로 "${workflow.id}"에 ` +
              `"${insert.anchorCapability}" step이 ${matches.length}개다. anchorStep으로 지정해라.`,
          )
        }
        if (insert.anchorStep && !matches.some((s) => s.id === insert.anchorStep)) {
          fail(file, `workflowExtensions/${insert.id}: "${workflow.id}"에 step "${insert.anchorStep}"가 없다.`)
        }
      }
      if (!anchoredAnywhere) {
        fail(
          file,
          `workflowExtensions/${insert.id}: 앵커 Capability "${insert.anchorCapability}"를 ` +
            `쓰는 step이 어떤 대상 워크플로에도 없다.`,
        )
      }
    }
  }
}

/**
 * 프로파일 권한은 좁힐 수만 있다. 넓히면 저장소 설정으로 정책을 우회할 수 있게 된다.
 */
function checkProfilePermissions(file, doc) {
  checkWorkflowExtensions(file, doc)

  const testLayers = doc.testing?.layers ?? {}
  const layerNames = ['unit', 'ui', 'integration', 'e2e']
  if (doc.kind === 'domain' && doc.testing) {
    for (const layer of layerNames) {
      if (!testLayers[layer]) fail(file, `testing.layers.${layer}: domain 기본값이 없다.`)
    }
  }
  const signatures = new Map()
  for (const [layer, config] of Object.entries(testLayers)) {
    const signature = librarySignature(config)
    if (signatures.has(signature)) {
      fail(file, `testing.layers.${layer}: ${signatures.get(signature)}와 같은 라이브러리 집합이다. 계층을 도구로 구분할 수 없다.`)
    }
    signatures.set(signature, layer)
    if (doc.kind === 'repository' && !doc.commands?.[`test.${layer}`]) {
      fail(file, `testing.layers.${layer}: repository override에는 commands.test.${layer}가 필요하다.`)
    }
  }

  checkAgentPermissions(file, doc.agents, doc.permissions ?? { filesystem: 'write', network: 'allowlist' }, 'profile')

  for (const binding of doc.bindings ?? []) {
    const capability = CAPABILITIES.get(binding.capability)
    if (!capability) {
      fail(file, `binding "${binding.capability}": 알 수 없는 capability.`)
      continue
    }
    const extensible = capability.profileExtensible ?? {}
    const variant = binding.variant ? capability.variants?.[binding.variant] : null
    if (binding.variant && !variant) {
      fail(file, `binding "${binding.capability}#${binding.variant}": 알 수 없는 variant.`)
      continue
    }
    if ((binding.skills?.length || binding.skillsOneOf?.length) && extensible.skills === false) {
      fail(file, `binding "${binding.capability}": 스킬 주입이 허용되지 않았다.`)
    }
    if ((binding.tools?.length || binding.mcpServers?.length) && extensible.tools !== true) {
      fail(file, `binding "${binding.capability}": 도구 주입이 허용되지 않았다 (profileExtensible.tools).`)
    }
    if (binding.hooks?.length && extensible.hooks === false) {
      fail(file, `binding "${binding.capability}": 훅 주입이 허용되지 않았다.`)
    }

    // 프로파일은 훅을 더할 수만 있다. 기존 blocking 훅을 같은 파일로 다시 선언하면서
    // blocking:false로 낮추는 것은 게이트를 끄는 것과 같다. (policy: required-verification-hooks)
    const blocking = new Set(
      (capability.entrypoints?.hooks ?? []).filter((h) => h.blocking !== false).map((h) => h.file),
    )
    for (const hook of binding.hooks ?? []) {
      if (blocking.has(hook.file) && hook.blocking === false) {
        fail(
          file,
          `binding "${binding.capability}": blocking 훅 "${hook.file}"을 blocking:false로 낮출 수 없다. ` +
            `(policy: required-verification-hooks)`,
        )
      }
    }
    // 주입한 도구도 대상 Capability의 의미 권한을 넘을 수 없다.
    checkAgentPermissions(
      file,
      [{ id: `${binding.capability}(주입)`, tools: binding.tools }],
      variant?.permissions ?? capability.permissions,
      'binding',
    )
  }
}

// ---------------------------------------------------------------- 실행

function validateFile(path, kind, extraChecks) {
  const before = problems.length
  const doc = readYaml(path)

  if (doc !== null) {
    const validate = schemas[kind]
    if (validate(doc)) {
      extraChecks?.(path, doc)
    } else {
      // 스키마가 깨진 문서에 의미 검사를 돌리면 노이즈만 는다
      for (const error of validate.errors) {
        fail(path, `스키마 위반 ${error.instancePath || '/'}: ${error.message}`)
      }
    }
  }

  const mark = problems.length === before ? 'ok  ' : 'FAIL'
  checked.push(`${mark} ${kind}: ${relative(ROOT, path)}`)
}

const targets = [
  ...walk(join(ROOT, 'capabilities'), (p) => basename(p) === 'capability.yaml')
    .map((p) => [p, 'capability', checkCapabilityTokens]),
  ...PROFILE_PATHS.map((p) => [p, 'profile', checkProfilePermissions]),
  ...walk(join(ROOT, 'workflows'), (p) => p.endsWith('.yaml'))
    .map((p) => [p, 'workflow', checkWorkflowTokens]),
  ...walk(join(ROOT, 'policies'), (p) => p.endsWith('.yaml'))
    .map((p) => [p, 'policy', null]),
  ...walk(join(ROOT, 'packages', 'orchestrator'), (p) => basename(p) === 'orchestrator.yaml')
    .map((p) => [p, 'orchestrator', checkOrchestratorPurity]),
]

for (const [path, kind, extra] of targets) validateFile(path, kind, extra)

// ---------------------------------------------------------------- 보고

if (checked.length === 0) {
  console.log('검사할 선언 파일이 없다.')
}
for (const line of checked) console.log(`  ${line}`)

if (problems.length > 0) {
  console.error(`\n${problems.length}건의 문제:`)
  for (const { file, message } of problems) console.error(`  ✗ ${file}\n      ${message}`)
  process.exit(1)
}

console.log(`\n${checked.length}개 선언 파일 검증 통과.`)
