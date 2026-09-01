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

function loadCapabilities() {
  const dir = join(ROOT, 'capabilities')
  const map = new Map()
  if (!existsSync(dir)) return map
  for (const name of readdirSync(dir)) {
    const path = join(dir, name, 'capability.yaml')
    if (!existsSync(path)) continue
    const doc = readYaml(path)
    if (doc?.id) map.set(doc.id, doc)
  }
  return map
}

function loadProfiles() {
  const dir = join(ROOT, 'profiles')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => join(dir, name, 'profile.yaml'))
    .filter((path) => existsSync(path))
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

const [workflowId, stepId] = process.argv.slice(2)

if (!workflowId || !stepId) {
  console.error('사용법: npm run step <workflow> <step>')
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
const briefing = buildStepBriefing({
  workflow,
  stepId,
  capabilities: loadCapabilities(),
  profiles: loadProfiles(),
  gates: loadGates(),
})

if (!briefing) {
  console.error(`'${workflowId}'에 단계 '${stepId}'가 없다.\n`)
  console.error(`단계 ${stepIds(workflow).length}개:`)
  console.error(stepIds(workflow).map((id) => `  ${id}`).join('\n'))
  process.exit(2)
}

console.log(renderStepBriefing(briefing))
