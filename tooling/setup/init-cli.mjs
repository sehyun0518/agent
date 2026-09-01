#!/usr/bin/env node
// `npm run init -- <소비저장소 경로>` — 프로파일 뼈대를 놓고 채울 것을 말한다.
//
// 파일을 읽고 쓰는 것까지가 이 파일의 일이다. 판단은 init.mjs에 있고 회귀 케이스가
// 거기 붙는다.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { walk } from '../walk.mjs'
import { declaredCommandKeys, CONVENTION_KEYS } from '../validators/command-keys.mjs'
import { skeleton, submoduleProblem, whatIsLeft } from './init.mjs'

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const target = process.argv[2]
if (!target) {
  console.error('사용법: npm run init -- <소비저장소 경로>')
  process.exit(2)
}

const repo = resolve(target)
if (!existsSync(repo)) {
  console.error(`${target} 가 없다.`)
  process.exit(2)
}

// 코어가 무엇을 찾는지는 선언에서 유도한다. 여기 옮겨 적지 않는다.
const capabilities = new Map()
for (const path of walk(join(HARNESS, 'capabilities'), (p) => basename(p) === 'capability.yaml')) {
  const doc = parseYaml(readFileSync(path, 'utf8'))
  if (doc?.id) capabilities.set(doc.id, doc)
}
const commandKeys = declaredCommandKeys(capabilities)

const dir = join(repo, '.agent-harness')
const profilePath = join(dir, 'profile.yaml')
const name = basename(repo)
const namespace = name.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'repo'

console.log(`저장소  ${repo}`)

// ── 뼈대 ────────────────────────────────────────────────────────────────
if (existsSync(profilePath)) {
  console.log(`프로파일  이미 있다 — 손대지 않는다`)
} else {
  mkdirSync(dir, { recursive: true })
  writeFileSync(profilePath, skeleton({ id: name, namespace, commandKeys, conventionKeys: CONVENTION_KEYS }))
  console.log(`프로파일  ${join('.agent-harness', 'profile.yaml')} 을 만들었다`)
}

// ── 서브모듈 ────────────────────────────────────────────────────────────
const harnessDir = join(dir, 'harness')
if (existsSync(harnessDir)) {
  const dotGit = existsSync(join(harnessDir, '.git'))
  const gitlink = existsSync(join(repo, '.gitmodules')) &&
    readFileSync(join(repo, '.gitmodules'), 'utf8').includes('.agent-harness/harness')
  const problem = submoduleProblem({ gitlink, dotGit })
  console.log(`하네스    ${problem ? `⚠ ${problem}` : '서브모듈로 붙어 있다'}`)
} else {
  console.log('하네스    이 저장소 안에 없다 — 나란히 두는 배치라면 정상이다 (ADR-0020)')
}

// ── 남은 것 ─────────────────────────────────────────────────────────────
const profile = parseYaml(readFileSync(profilePath, 'utf8'))
const { missing, conventionsMissing } = whatIsLeft(profile, commandKeys, CONVENTION_KEYS)

if (missing.length) {
  console.log('\n코어가 찾는데 아직 없는 명령 키')
  for (const key of missing) console.log(`  ${key}`)
  console.log('  이름이 다르면 양쪽 다 조용히 안 맞는다 (ADR-0026)')
}
if (conventionsMissing.length) {
  console.log('\n규약 키 (선택)')
  for (const key of conventionsMissing) console.log(`  ${key}   흐름 시작 전 툴체인 확인 (ADR-0026)`)
}

console.log('\n다음')
console.log(`  node ${join('<하네스>', 'tooling', 'validators', 'validate.mjs')} --profile ${join('.agent-harness', 'profile.yaml')}`)
console.log('  채우지 않은 계층 규약은 도메인 것을 제안받는다 (ADR-0037)')
