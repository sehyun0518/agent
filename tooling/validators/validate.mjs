#!/usr/bin/env node
// 하네스 선언 파일 검증기.
//
// Phase 1 범위: JSON Schema 검증 + 코어 어휘 등록 검사.
// Phase 2 이후 확장 예정: 참조 무결성, 권한 대 도구 대조, 정책 우선순위 위반,
// 워크플로 선행조건 도달 가능성, 미러 드리프트.

import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js' // 스키마가 draft 2020-12를 쓴다
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'
import { librarySignature, findTestLayerConflicts } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'
import { resolveRunners, findUnresolvedRunners, findDuplicateInserts } from './profile-roster.mjs'
import { findDocumentationBypass } from './documentation-gate.mjs'
import { findReadonlyWriteTools } from './agent-readonly.mjs'
import { findEvidenceWithoutArtifact } from './evidence-artifact.mjs'
import { findMissingMootBranches } from './workflow-red-proof.mjs'
import { findMissingScaffolds } from './workflow-scaffold.mjs'
import { findUnisolatedBackgroundAgents } from './background-isolation.mjs'
import { toolRequirement } from './tools.mjs'
import { findEscalationCycles, findDanglingEscalations } from './escalation.mjs'
import {
  findUnreachablePreconditions,
  findUnusedAssumes,
} from './workflow-return-path.mjs'
import {
  findUnofferedManualResults,
  findMissingManualBranches,
} from './manual-result.mjs'
import {
  normalizeRequiredEvidence,
  findUndeclaredCompletionEvidence,
} from './completion-alternatives.mjs'
import {
  VALIDATOR_REGISTRY,
  findUnknownValidators,
  findUnreferencedValidators,
  findUnknownProjections,
  findEnforcementTableDrift,
} from './policy-enforcement.mjs'
import { findChecksMissingFromCi } from './pipeline.mjs'
import { findForeignNamespaceTokens, insertTokens } from './profile-namespace.mjs'
import { findUndeclaredNestedRepos, submodulePathsFrom } from './nested-repo.mjs'
import { findWidenedHosts, findUnfilledAllowlist } from './network-scope.mjs'
import { declaredCommandKeys, findUnusedCommandKeys } from './command-keys.mjs'
import { findAdrIndexDrift } from './adr-index.mjs'

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
    // lstat이라 심볼릭 링크로 들어가지 않는다. 링크가 조상을 가리키면 무한히 돈다 —
    // profiles/ 아래에 그런 링크를 두니 ELOOP로 죽었다.
    if (lstatSync(path).isDirectory()) walk(path, match, found)
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
      // 원소는 kind 하나이거나 대안 묶음이다. 묶음 안의 하나만 빠져도 그 경로는
      // 실제로는 없는 것이라 completion이 실제보다 느슨해 보인다 (ADR-0013).
      const groups = normalizeRequiredEvidence(completion.requiresEvidence)
      for (const { kind } of findUndeclaredCompletionEvidence(groups, declaredEvidence)) {
        fail(file, `${label}.completion: "${kind}"를 요구하지만 evidence에 선언되지 않았다.`)
      }
      for (const [kind, status] of Object.entries(completion.expectedStatus ?? {})) {
        if (!declaredEvidence.has(kind)) {
          fail(file, `${label}.completion.expectedStatus: 선언되지 않은 증거 "${kind}".`)
        }
        checkEvidenceStatus(file, kind, status, `${label}.completion.expectedStatus`)
      }
    }
  }

  // 외부기억: 코어 증거는 원본 경로를 요구해야 한다.
  checkEvidenceArtifacts(file, scopes)

  // 어휘가 연 수동 검증 경로를 선언이 실제로 내놓는지 (ADR-0013).
  const evidenceScopes = scopes.map(({ label, node }) => ({ label, evidence: node.evidence }))
  for (const { scope, kind } of findUnofferedManualResults(evidenceScopes, vocabulary.evidence)) {
    fail(
      file,
      `${scope}.evidence: 어휘에 "${kind}"가 있는데 내놓지 않는다. ` +
        `러너를 둘 수 없는 저장소가 승인된 생략 말고는 이 계층을 만족시킬 방법이 없어진다. (ADR-0013)`,
    )
  }

  // 참조 무결성: manifest가 가리키는 파일이 실재하는지.
  checkReferences(file, doc)

  // 레이어 독립성: 이웃 이름을 알고 있지 않은지.
  checkLayerIndependence(file, doc)

  // 2계층 권한: 도구가 의미 권한을 넘지 않는지.
  checkAgentPermissions(file, doc.entrypoints?.agents, doc.permissions, 'capability')
  checkReadonlyAgents(file, doc.entrypoints?.agents, 'capability')
  for (const [name, variant] of Object.entries(doc.variants ?? {})) {
    const permissions = variant.permissions ?? doc.permissions
    checkAgentPermissions(file, variant.entrypoints?.agents, permissions, `variant:${name}`)
    checkReadonlyAgents(file, variant.entrypoints?.agents, `variant:${name}`)
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

/**
 * readonly로 선언한 역할이 쓰기 도구를 들지 않았는지 본다 (ADR-0007).
 * 판정은 agent-readonly.mjs의 순수 함수가 하고 여기서는 보고만 한다.
 */
function checkReadonlyAgents(file, agents, label) {
  for (const { agent, tool } of findReadonlyWriteTools(agents)) {
    fail(
      file,
      `${label} 에이전트 "${agent}": readonly인데 쓰기 도구 "${tool}"을 들고 있다. (ADR-0007)`,
    )
  }
}

/**
 * 코어 증거가 원본 경로를 요구하는지 본다.
 * 판정은 evidence-artifact.mjs의 순수 함수가 하고 여기서는 보고만 한다.
 */
function checkEvidenceArtifacts(file, scopes) {
  const declarations = scopes.map(({ label, node }) => ({ label, evidence: node.evidence }))
  for (const { scope, kind } of findEvidenceWithoutArtifact(declarations)) {
    fail(
      file,
      `${scope}.evidence "${kind}": artifactRequired가 없다. status와 summary만 남는 증거는 ` +
        `세션과 함께 사라진다. 경로가 필요 없다면 그것은 증거가 아니라 신호다. (#45)`,
    )
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

// 코어가 정한 네트워크 범위의 합집합. 프로파일은 이 안에서만 좁힌다.
// 비어 있으면 아직 정해지지 않은 것이고, 그때는 프로파일이 처음 정한다 (ADR-0024).
const CORE_NETWORK_ALLOWLIST = [
  ...new Set(
    [...CAPABILITIES.values()].flatMap((capability) => [
      ...(capability.permissions?.networkAllowlist ?? []),
      ...Object.values(capability.variants ?? {}).flatMap(
        (variant) => variant.permissions?.networkAllowlist ?? [],
      ),
    ]),
  ),
]

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

  // 되돌림이 갈 곳: requires 토큰의 생산자가 흐름 안에 있는지 (ADR-0014).
  for (const { step, token } of findUnreachablePreconditions(steps, CAPABILITIES, doc.assumes)) {
    fail(
      file,
      `step:${step}: 선행 토큰 "${token}"을 이 흐름의 어느 단계도 생산하지 않는다. ` +
        `되돌려도 갈 곳이 없다. 흐름 밖에서 충족되는 것이면 assumes에 선언해라. (ADR-0014)`,
    )
  }

  const ASSUMES_MESSAGE = {
    unrequired: (t) => `assumes "${t}": 이 흐름의 어느 단계도 요구하지 않는다. 지워라.`,
    'produced-in-flow': (t) =>
      `assumes "${t}": 이 흐름이 스스로 생산한다. 되돌림이 흐름 안으로 갈 수 있는데 밖으로 나간다고 적혀 있다.`,
  }
  for (const { token, reason } of findUnusedAssumes(steps, CAPABILITIES, doc.assumes)) {
    fail(file, ASSUMES_MESSAGE[reason](token))
  }

  // 스캐폴드 변형이 선언된 계층은 그 단계를 red 앞에 두고 있어야 한다 (ADR-0011).
  for (const { step, scaffold } of findMissingScaffolds(steps, graph, CAPABILITIES)) {
    fail(
      file,
      `step:${step}: 변형 "${scaffold}"가 선언돼 있는데 그것을 쓰는 조상 단계가 없다. ` +
        `계약이 신규 모듈을 도입하면 red를 만들 수 없는 순환에 갇힌다. (ADR-0011)`,
    )
  }

  // 어휘가 수동 검증 경로를 연 계층은 워크플로도 그 분기를 둬야 한다 (ADR-0013).
  for (const { step, kind } of findMissingManualBranches(steps, vocabulary.evidence)) {
    fail(
      file,
      `step:${step}: "${kind}"를 받을 분기가 없다. ` +
        `러너를 둘 수 없는 저장소가 승인된 생략 말고는 이 계층을 통과할 방법이 없어진다. (ADR-0013)`,
    )
  }

  // moot을 허용하는 계층은 그 분기를 갖고 있어야 한다 (ADR-0012). 허용되지 않는
  // 계층에 moot을 쓰는 것은 위 checkExpectation이 어휘와 대조해 이미 잡는다.
  for (const { step, evidence } of findMissingMootBranches(steps, vocabulary.evidence)) {
    fail(
      file,
      `step:${step}: "${evidence}"가 moot을 허용하는데 그 분기가 없다. ` +
        `red가 관찰되지 않는 실행이 승인이 필요한 생략으로 몰린다. (ADR-0012)`,
    )
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
/**
 * 워크플로를 id로 찾을 수 있게 미리 읽어 둔다.
 *
 * 이 맵은 **스키마 검증 전**에 만들어진다. 프로파일 검사가 워크플로를 가로질러 봐야
 * 하는데, 그 시점에 워크플로 파일은 아직 자기 차례를 받지 못했기 때문이다. 그래서
 * 여기 들어오는 step은 object라는 보장이 없다 — 빈 원소 하나가 profile.yaml 검사를
 * TypeError로 죽였다.
 *
 * 깨진 step을 걸러내고 나머지로 진행한다. 원인은 그 워크플로 파일 차례에 "스키마 위반
 * /steps/N: must be object"로 정확히 보고되므로 여기서 다시 말하지 않는다. 다른 파일의
 * 검사가 남의 파일 문법 오류로 멈추지 않게 하는 것이 목적이다.
 */
/**
 * 저장소 안의 다른 git 저장소. `node_modules`와 생성 미러는 보지 않는다 — 전자는
 * 의존성이고 후자는 실행 산물이라 중첩이 정상이다.
 */
function nestedRepos() {
  const skip = new Set(['node_modules', '.git', '.claude', '.codex'])
  const found = []
  const walkDirs = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue
      const path = join(dir, name)
      // lstat이라 심볼릭 링크로 들어가지 않는다. 링크가 조상을 가리키면 무한히 돈다.
      if (!lstatSync(path).isDirectory()) continue
      const relative = rel ? `${rel}/${name}` : name
      if (existsSync(join(path, '.git'))) found.push(relative)
      else walkDirs(path, relative)
    }
  }
  walkDirs(ROOT, '')
  return found
}

function loadWorkflows() {
  const map = new Map()
  for (const path of walk(join(ROOT, 'workflows'), (p) => p.endsWith('.yaml'))) {
    const doc = readYaml(path)
    if (!doc?.id) continue
    const steps = (doc.steps ?? []).filter((step) => step !== null && typeof step === 'object')
    map.set(doc.id, { ...doc, steps })
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

  // 삽입 단계도 증거로 완료를 판정한다 (ADR-0017). 핵심 단계에 걸던 검사를 같은
  // 순수 함수로 여기에도 건다 — 도메인 축만 다른 규칙을 쓰면 그것이 곧 구멍이다.
  const producibleTokens = new Set([...CORE_SIGNALS, ...CORE_ARTIFACTS])
  for (const extension of doc.workflowExtensions ?? []) {
    for (const insert of extension.insert ?? []) {
      const label = `workflowExtensions/${insert.id}`

      // 프로파일은 자기 네임스페이스 아래에서만 토큰을 만든다 (ADR-0001). 남의 것을
      // 쓰면 그 프로파일을 떼어냈을 때 없는 것을 가리키게 된다.
      for (const { token, namespace } of findForeignNamespaceTokens(insertTokens(insert), doc.namespace)) {
        fail(
          file,
          `${label}: 토큰 "${token}"의 네임스페이스 "${namespace}"는 이 프로파일의 ` +
            `namespace "${doc.namespace}"가 아니다.`,
        )
      }

      for (const token of insert.produces ?? []) {
        checkToken(file, token, producibleTokens, `${label}.produces`)
      }

      const declared = new Set()
      for (const item of insert.evidence ?? []) {
        checkToken(file, item.kind, CORE_EVIDENCE, `${label}.evidence`)
        declared.add(item.kind)
      }

      for (const { kind } of findEvidenceWithoutArtifact([{ label, evidence: insert.evidence }])) {
        fail(
          file,
          `${label}.evidence "${kind}": artifactRequired가 없다. status와 summary만 남는 증거는 ` +
            `세션과 함께 사라진다. (#45)`,
        )
      }

      const groups = normalizeRequiredEvidence(insert.completion?.requiresEvidence)
      for (const { kind } of findUndeclaredCompletionEvidence(groups, declared)) {
        fail(file, `${label}.completion: "${kind}"를 요구하지만 evidence에 선언되지 않았다.`)
      }

      if (insert.skippable) {
        checkToken(file, insert.skippable.evidenceOnSkip, CORE_EVIDENCE, `${label}.skippable`)
      }
    }
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
    // manual 계층에는 라이브러리가 없다. 서명 대조에서 빼지 않으면 manual 계층 둘이
    // 서로 "같은 라이브러리 집합"으로 걸린다 — 둘 다 비어 있기 때문이다.
    if (!config.manual) {
      const signature = librarySignature(config)
      if (signatures.has(signature)) {
        fail(file, `testing.layers.${layer}: ${signatures.get(signature)}와 같은 라이브러리 집합이다. 계층을 도구로 구분할 수 없다.`)
      }
      signatures.set(signature, layer)
    }

  }

  // 선언했는데 아무도 부르지 않는 명령 키. 오타가 나면 양쪽이 조용하다 (ADR-0026).
  for (const key of findUnusedCommandKeys(doc.commands, declaredCommandKeys(CAPABILITIES))) {
    fail(
      file,
      `commands "${key}": 어느 변형의 commandKey도 아니고 규약 키도 아니다. ` +
        `오타이거나 아무도 부르지 않는 명령이다. (ADR-0026)`,
    )
  }

  // 네트워크 범위 선언이 실제로 범위인지 (ADR-0024). 정책이 두 문장을 적어 뒀는데
  // 둘 다 아무도 읽지 않고 있었다.
  const profilePermissions = doc.permissions ?? {}
  for (const host of findWidenedHosts(CORE_NETWORK_ALLOWLIST, profilePermissions.networkAllowlist)) {
    fail(
      file,
      `permissions.networkAllowlist "${host}": 코어에 없는 호스트다. 프로파일은 범위를 ` +
        `좁힐 수만 있고 넓힐 수 없다. (policy: network-access)`,
    )
  }
  if (findUnfilledAllowlist(profilePermissions, doc.kind)) {
    fail(
      file,
      `permissions.network가 allowlist인데 networkAllowlist가 비었다. repository 프로파일은 ` +
        `나갈 호스트를 정해야 한다 — 빈 목록은 "아직 안 정했다"는 뜻이다. (ADR-0024)`,
    )
  }

  // 러너와 수동 절차는 택일이다 (ADR-0013). 판정은 profile-testing.mjs가 한다.
  const TEST_LAYER_MESSAGE = {
    'both-runner-and-manual': (l) => `testing.layers.${l}: libraries와 manual이 함께 있다. 러너가 있으면 그것을 쓴다.`,
    'manual-with-command': (l) => `testing.layers.${l}: manual인데 commands.test.${l}가 있다. 러너가 있으면 그것을 쓴다.`,
    'missing-command': (l) => `testing.layers.${l}: repository override에는 commands.test.${l} 또는 manual이 필요하다.`,
  }
  for (const { layer, problem } of findTestLayerConflicts(testLayers, doc.commands, doc.kind)) {
    fail(file, TEST_LAYER_MESSAGE[problem](layer))
  }

  checkAgentPermissions(file, doc.agents, doc.permissions ?? { filesystem: 'write', network: 'allowlist' }, 'profile')
  checkReadonlyAgents(file, doc.agents, 'profile')

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

// ---------------------------------------------------------------- 정책 강제 수단 대조
// policies/*.yaml의 enforcement.validator가 실재하는 검사를 가리키는지 본다.
// 판정은 policy-enforcement.mjs의 순수 함수가 하고 여기서는 수집과 보고만 한다.

const declaredEnforcement = []

function checkPolicyEnforcement(file, doc) {
  declaredEnforcement.push({ id: doc.id, validator: doc.enforcement?.validator, file })
  for (const { validator } of findUnknownValidators([
    { id: doc.id, validator: doc.enforcement?.validator },
  ])) {
    fail(
      file,
      `enforcement.validator "${validator}"가 어떤 검사도 가리키지 않는다. ` +
        `구현했으면 tooling/validators/policy-enforcement.mjs의 레지스트리에 등록해라.`,
    )
  }
}

const POLICY_PATHS = walk(join(ROOT, 'policies'), (p) => p.endsWith('.yaml'))

const targets = [
  ...walk(join(ROOT, 'capabilities'), (p) => basename(p) === 'capability.yaml')
    .map((p) => [p, 'capability', checkCapabilityTokens]),
  ...PROFILE_PATHS.map((p) => [p, 'profile', checkProfilePermissions]),
  ...walk(join(ROOT, 'workflows'), (p) => p.endsWith('.yaml'))
    .map((p) => [p, 'workflow', checkWorkflowTokens]),
  ...POLICY_PATHS.map((p) => [p, 'policy', checkPolicyEnforcement]),
  ...walk(join(ROOT, 'packages', 'orchestrator'), (p) => basename(p) === 'orchestrator.yaml')
    .map((p) => [p, 'orchestrator', checkOrchestratorPurity]),
]

for (const [path, kind, extra] of targets) validateFile(path, kind, extra)

// 아래 셋은 정책 수집에 기대지 않는다. 파일시스템·package.json·레지스트리 상수만
// 보므로 고아 검증기 게이트 밖에 둔다.
//
// 전에는 그 게이트 안에 있었다. 무관한 정책 하나가 스키마에서 걸리면 이 셋이 조용히
// 꺼졌고, skip 메시지는 고아 검증기만 말해서 나머지가 사라진 것을 아무도 몰랐다 —
// 그 게이트의 주석이 경계하던 상태를 그 게이트 안에서 만든 셈이었다.

// 소비 저장소를 하네스 안에 중첩하면 isolation: worktree가 아무것도 격리하지 못한다
// (ADR-0020). submodule은 선언된 중첩이라 대상이 아니다.
const gitmodules = existsSync(join(ROOT, '.gitmodules'))
  ? readFileSync(join(ROOT, '.gitmodules'), 'utf8')
  : ''
// 에스컬레이션은 끝나야 한다. 재시도와 달리 상한이 없어 사슬이 돌면 무한하다.
for (const { capability, escalateTo } of findDanglingEscalations(CAPABILITIES)) {
  fail(
    join(ROOT, 'capabilities', capability, 'capability.yaml'),
    `escalateTo가 '${escalateTo}'를 가리키는데 그런 Capability가 없다. ` +
      `Capability id 또는 'orchestrator'여야 한다. (ADR-0029)`,
  )
}

for (const { cycle } of findEscalationCycles(CAPABILITIES)) {
  fail(
    join(ROOT, 'capabilities', cycle[0], 'capability.yaml'),
    `에스컬레이션이 돈다 — ${cycle.join(' → ')} → ${cycle[0]}. ` +
      `재시도와 달리 에스컬레이션에는 상한이 없어 사슬이 끝나지 않는다. (ADR-0029)`,
  )
}

// 백그라운드로 도는 쓰기 역할은 격리를 선언해야 한다. 부른 쪽과 같은 트리를 고친다.
for (const { capability, agent } of findUnisolatedBackgroundAgents(CAPABILITIES)) {
  fail(
    join(ROOT, 'capabilities', capability, 'capability.yaml'),
    `역할 '${agent}'이 background: true인데 isolation이 없다. 쓰기 도구를 가진 역할이 ` +
      `부른 쪽과 같은 작업 트리에서 동시에 돈다 — isolation: worktree를 선언하라. (ADR-0028)`,
  )
}

for (const path of findUndeclaredNestedRepos(nestedRepos(), submodulePathsFrom(gitmodules))) {
  fail(
    join(ROOT, path),
    `중첩된 git 저장소다. 소비 저장소는 하네스 안에 두지 않는다 — ` +
      `worktree에 존재하지 않아 isolation이 아무것도 격리하지 못한다. (ADR-0020)`,
  )
}

// check에 넣고 CI에 안 넣으면 그 검사는 로컬에서만 돌고 병합을 막지 못한다.
const WORKFLOW = join(ROOT, '.github', 'workflows', 'harness.yml')
const ciSteps = parseYaml(readFileSync(WORKFLOW, 'utf8'))?.jobs?.check?.steps ?? []
const ciCommands = ciSteps.filter((step) => step?.run).map((step) => step.run.trim())
const checkScript = readJson(join(ROOT, 'package.json')).scripts?.check
for (const command of findChecksMissingFromCi(checkScript, ciCommands)) {
  fail(WORKFLOW, `"${command}"이 npm run check에는 있는데 CI에 없다. 로컬에서만 돌고 병합을 막지 못한다.`)
}

// README의 결정 기록도 손으로 옮겨 적는 목록이라 갈라진다. ADR이 스물다섯인데 표는
// 열을 적고 있었다.
const ADR_DIR = join(ROOT, 'docs', 'adr')
const ROOT_README = join(ROOT, 'README.md')
const ADR_MESSAGE = {
  'not-in-index': (n) => `ADR-${n}이 결정 기록 표에 없다. 결정을 냈으면 표에도 적어라.`,
  'no-file': (n) => `결정 기록 표의 ADR-${n}에 해당하는 파일이 없다. 죽은 링크다.`,
}
for (const { number, problem } of findAdrIndexDrift(readFileSync(ROOT_README, 'utf8'), readdirSync(ADR_DIR))) {
  fail(ROOT_README, ADR_MESSAGE[problem](number))
}

// 표를 손으로 옮겨 적는 한 레지스트리와 갈라진다. 세 번 났다.
const README = join(ROOT, 'policies', 'README.md')
const TABLE_MESSAGE = {
  'not-in-registry': (n) => `표가 검증기 "${n}"을 이름으로 적었는데 레지스트리에 없다.`,
  'not-in-table': (n) => `레지스트리의 "${n}"이 표에 안 적혀 있다. 강제되는데 안 보인다.`,
}
for (const { name, problem } of findEnforcementTableDrift(readFileSync(README, 'utf8'))) {
  fail(README, TABLE_MESSAGE[problem](name))
}

// 아래 둘은 수집된 정책과 레지스트리를 대조한다. 강제 수단만 남고 근거가 사라진
// 상태를 보는 것이라 개별 정책이 아닌 여기서 본다.
//
// 정책이 하나라도 스키마에서 걸리면 checkPolicyEnforcement가 그 파일에 닿지 못해
// 수집이 비고, 멀쩡한 검증기가 고아로 보인다. 수집이 완전할 때만 판정한다.
//
// "problems가 하나라도 있으면 건너뛴다"로 하지 않는 이유는, 무관한 파일의 문제 하나로
// 이 검사가 조용히 꺼지기 때문이다. 꺼질 때는 꺼졌다고 출력한다.
if (declaredEnforcement.length === POLICY_PATHS.length) {
  for (const id of findUnknownProjections(declaredEnforcement)) {
    fail(
      join(ROOT, 'tooling', 'validators', 'policy-enforcement.mjs'),
      `투영 레지스트리의 "${id}": 그런 정책이 없다. 정책을 지웠으면 여기서도 지워라.`,
    )
  }
  for (const name of findUnreferencedValidators(declaredEnforcement)) {
    fail(
      join(ROOT, 'tooling', 'validators', 'policy-enforcement.mjs'),
      `검증기 "${name}"을 가리키는 정책이 없다. 정책을 지웠으면 레지스트리에서도 지워라.`,
    )
  }
} else {
  checked.push(
    `skip 레지스트리 고아 검사: 정책 ${POLICY_PATHS.length}개 중 ` +
      `${declaredEnforcement.length}개만 읽혔다 (위 오류를 먼저 고쳐라)`,
  )
}

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
