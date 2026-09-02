#!/usr/bin/env node
// `npm run init -- <소비저장소 경로>` — 프로파일 뼈대를 놓고 채울 것을 말한다.
//
// 파일을 읽고 쓰는 것까지가 이 파일의 일이다. 판단은 init.mjs에 있고 회귀 케이스가
// 거기 붙는다.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { walk } from '../walk.mjs'
import { shellArg } from '../shell.mjs'
import { declaredCommandKeys, CONVENTION_KEYS } from '../validators/command-keys.mjs'
import { skeleton, slug, submoduleProblem, whatIsLeft } from './init.mjs'

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
if (!statSync(repo).isDirectory()) {
  console.error(`${target} 은 디렉터리가 아니다.`)
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
// id 와 namespace 가 같은 패턴을 요구한다. 한쪽만 정리하면 나머지가 검증에서 걸린다.
const name = slug(basename(repo))

console.log(`저장소  ${repo}`)

// ── 뼈대 ────────────────────────────────────────────────────────────────
if (existsSync(profilePath)) {
  console.log(`프로파일  이미 있다 — 손대지 않는다`)
} else {
  mkdirSync(dir, { recursive: true })
  writeFileSync(profilePath, skeleton({ id: name, namespace: name, commandKeys, conventionKeys: CONVENTION_KEYS }))
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
// 이미 있는 프로파일이 깨져 있을 수 있다. 여기서 죽으면 무엇이 남았는지도 못 본다.
let profile
try {
  profile = parseYaml(readFileSync(profilePath, 'utf8'))
} catch (error) {
  console.error(`\n${profilePath} 을 읽지 못했다.`)
  console.error(`  ${String(error.message).split('\n')[0]}`)
  process.exit(1)
}
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

// 프로파일만 있으면 이 저장소에서 흐름을 시작할 수 없다 — 역할·스킬·커맨드가
// 하네스 안에만 있기 때문이다. 실제로 `commands`가 0인 저장소를 봤다 (ADR-0040).
const mirrored = existsSync(join(dir, 'generated.json'))
console.log(`\n생성물  ${mirrored ? '이 저장소에 있다 — 하네스를 올렸으면 다시 낸다' : '아직 없다 — /step 같은 커맨드를 칠 수 없다'}`)
console.log(`  npm run generate -- --check --into ${shellArg(repo)}   먼저 무엇이 바뀌는지 본다`)
console.log(`  npm run generate -- --into ${shellArg(repo)}`)
