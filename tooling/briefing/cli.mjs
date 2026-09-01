#!/usr/bin/env node
// `npm run step <workflow> <step>` — 단계 브리핑을 인쇄한다.
//
// 파일을 읽어 순수 함수에 넘기는 것까지가 이 파일의 일이다. 판단은 step.mjs에 있고
// 회귀 케이스가 거기 붙는다.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { buildStepBriefing, renderStepBriefing, stepIds } from './step.mjs'
import { readEvidenceRecords } from './evidence.mjs'
import { walk } from '../walk.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// 이 도구는 검증 안 된 선언을 읽는다 — 고치는 중에 부르는 것이 정상 사용이다.
// 그래서 스키마가 보장한다고 가정하지 않고, 깨진 파일에는 스택 대신 어디가 깨졌는지 낸다.
const readYaml = (path) => {
  try {
    return parseYaml(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`YAML을 읽지 못했다: ${relative(ROOT, path)}`)
    console.error(`  ${error.message.split('\n')[0]}`)
    process.exit(1)
  }
}

// 검증기와 같은 재귀 탐색을 쓴다. 한 겹만 보면 중첩된 capability를 못 찾고, 워크플로가
// 그것을 가리키면 검증은 통과하는데 브리핑에서만 조용히 사라진다 (#92 리뷰).
function loadCapabilities() {
  const map = new Map()
  for (const path of walk(join(ROOT, 'capabilities'), (p) => basename(p) === 'capability.yaml')) {
    const doc = readYaml(path)
    if (doc?.id) map.set(doc.id, doc)
  }
  return map
}

function loadProfiles() {
  return walk(join(ROOT, 'profiles'), (p) => basename(p) === 'profile.yaml')
    .map(readYaml)
    .filter(Boolean)
}

function loadGates() {
  const dir = join(ROOT, 'workflows', 'gates')
  const map = new Map()
  if (!existsSync(dir)) return map
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    map.set(basename(name, '.md'), readFileSync(join(dir, name), 'utf8'))
  }
  return map
}

function workflowIds() {
  return readdirSync(join(ROOT, 'workflows'))
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .map((n) => basename(n).replace(/\.ya?ml$/, ''))
}

// 발급은 정하지 않는다(execution-state). 읽는 쪽이 찾는 방법만 정한다 — ADR-0033 결정 3.
function resolveRun(requested) {
  const dir = join(ROOT, '.harness', 'runs')
  if (requested) return { runId: requested }
  if (!existsSync(dir)) return { runId: null }
  const runs = readdirSync(dir).filter((n) => !n.startsWith('.'))
  if (runs.length === 1) return { runId: runs[0] }
  if (runs.length === 0) return { runId: null }
  // "가장 최근"을 고르지 않는다. 틀리면 다른 흐름의 증거로 통과했다고 말하게 된다.
  return { runId: null, ambiguous: runs }
}

// 증거는 실행 산출물이라 손으로도 쓴다. 깨졌다고 브리핑 전체를 막지 않는다 —
// ADR-0033이 "읽는 쪽이 건너뛰고 그 사실을 말한다"고 적었다. 선언과 다른 자리다:
// 선언이 깨지면 브리핑을 만들 수 없지만, 증거가 깨져도 단계 설명은 나온다.
function loadEvidence(runId) {
  if (!runId) return null
  const path = join(ROOT, '.harness', 'runs', runId, 'evidence.yaml')
  if (!existsSync(path)) return { records: [], malformed: 0, path, missing: true }
  try {
    return { ...readEvidenceRecords(parseYaml(readFileSync(path, 'utf8'))), path }
  } catch (error) {
    return { records: [], malformed: 0, path, broken: error.message.split('\n')[0] }
  }
}

const args = process.argv.slice(2)
const runFlag = args.indexOf('--run')
const requestedRun = runFlag === -1 ? null : args[runFlag + 1]
if (runFlag !== -1 && (!requestedRun || requestedRun.startsWith('-'))) {
  console.error('--run 뒤에 runId가 없다. 값 없이 주면 조용히 자동 탐색으로 넘어간다.')
  process.exit(2)
}
// --run과 그 값만 걷어낸다. 없을 때 runFlag가 -1이라 인덱스로 거르면 첫 인자가 사라진다.
const positional = runFlag === -1 ? args : args.filter((_, i) => i !== runFlag && i !== runFlag + 1)
const [workflowId, stepId] = positional

if (!workflowId || !stepId) {
  console.error('사용법: npm run step <workflow> <step> [--run <runId>]')
  console.error(`워크플로: ${workflowIds().join(' · ')}`)
  process.exit(2)
}

const workflowPath = ['yaml', 'yml']
  .map((ext) => join(ROOT, 'workflows', `${workflowId}.${ext}`))
  .find(existsSync)

if (!workflowPath) {
  console.error(`워크플로 '${workflowId}'가 없다. 있는 것: ${workflowIds().join(' · ')}`)
  process.exit(2)
}

const workflow = readYaml(workflowPath)
const run = resolveRun(requestedRun)
const evidence = loadEvidence(run.runId)

const briefing = buildStepBriefing({
  workflow,
  stepId,
  capabilities: loadCapabilities(),
  profiles: loadProfiles(),
  gates: loadGates(),
  evidence: evidence?.records,
})

if (!briefing) {
  console.error(`'${workflowId}'에 단계 '${stepId}'가 없다.\n`)
  console.error(`단계 ${stepIds(workflow).length}개:`)
  console.error(stepIds(workflow).map((id) => `  ${id}`).join('\n'))
  process.exit(2)
}

console.log(renderStepBriefing(briefing))

if (run.ambiguous) {
  console.log(`\n흐름이 여럿이라 증거를 대조하지 않았다. --run으로 고른다:`)
  console.log(run.ambiguous.map((r) => `  ${r}`).join('\n'))
} else if (!run.runId) {
  console.log('\n증거를 대조하지 않았다 — .harness/runs/에 흐름이 없다 (ADR-0033).')
} else if (evidence?.missing) {
  console.log(`\n증거를 대조하지 않았다 — ${relative(ROOT, evidence.path)}이 없다.`)
} else if (evidence?.broken) {
  console.log(`\n증거를 대조하지 않았다 — ${relative(ROOT, evidence.path)}을 읽지 못했다.`)
  console.log(`  ${evidence.broken}`)
} else {
  const note = evidence.malformed ? `  (모양이 틀린 레코드 ${evidence.malformed}건은 건너뜀)` : ''
  console.log(`\n흐름 ${run.runId} · 증거 ${evidence.records.length}건과 대조했다.${note}`)
}
