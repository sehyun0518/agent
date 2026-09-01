// 벤더링한 파일이 기록된 해시와 같은지 대조한다. 네트워크를 쓰지 않는다.
//
//   node tooling/vendoring/check.mjs            대조한다. 어긋나면 실패
//   node tooling/vendoring/check.mjs --record   지금 상태를 기록한다 (벤더링 직후에만)
//
// --record는 무엇이든 통과시키는 문이다. 그래서 기록 파일을 커밋 대상으로 두고
// 리뷰에서 보이게 한다 — 미러 드리프트를 다루는 방식과 같다(ADR-0006).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyPack,
  digest,
  extractVendoredBody,
  findDrift,
  parseFrontmatter,
} from './vendored-files.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MANIFEST = join(ROOT, 'tooling', 'vendoring', 'manifest.json')
const RECORD = process.argv.includes('--record')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out.sort()
}

const problems = []
const current = {}

for (const profile of readdirSync(join(ROOT, 'profiles'))) {
  const skillsDir = join(ROOT, 'profiles', profile, 'skills')
  let packs
  try {
    packs = readdirSync(skillsDir)
  } catch {
    continue
  }

  for (const pack of packs) {
    const packDir = join(skillsDir, pack)
    const skillPath = join(packDir, 'SKILL.md')
    let skill
    try {
      skill = readFileSync(skillPath, 'utf8')
    } catch {
      problems.push(`profiles/${profile}/skills/${pack}: SKILL.md가 없다.`)
      continue
    }

    const front = parseFrontmatter(skill)
    if (front.problem) {
      problems.push(`profiles/${profile}/skills/${pack}/SKILL.md: frontmatter를 읽을 수 없다 — ${front.problem}`)
      continue
    }

    const kind = classifyPack(front.data?.metadata)
    if (kind === 'own') continue

    for (const path of walk(packDir)) {
      const rel = relative(ROOT, path)
      if (path !== skillPath) {
        current[rel] = digest(readFileSync(path, 'utf8'))
        continue
      }
      // 본문을 다시 쓴 팩의 SKILL.md는 대조하지 않는다 (ADR-0008 종류 C).
      if (kind === 'body-rewritten') continue

      // frontmatter도 기록한다. 마커 밖이지만 ADR-0008이 상류 키의 값까지 같기를
      // 요구하므로, 여기가 바뀌는 것도 드리프트다.
      current[`${rel}#frontmatter`] = digest(front.raw ?? '')

      const extracted = extractVendoredBody(skill)
      if (extracted.problem) {
        problems.push(
          `${rel}: 마커 문제(${extracted.problem}). 본문을 다시 썼으면 ` +
            `metadata.vendored: body-rewritten을 선언해라.`,
        )
        continue
      }
      current[rel] = digest(extracted.body)
    }
  }
}

if (RECORD) {
  const manifest = {
    $comment:
      '벤더링한 파일의 해시. 로컬 변조를 잡는 용도이고 상류 갱신은 잡지 못한다 (ADR-0016). ' +
      '벤더링 직후 `npm run vendor:record`로만 갱신하고, 그 diff가 리뷰에서 보여야 한다.',
    files: Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))),
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`기록: 파일 ${Object.keys(current).length}개`)
  process.exit(problems.length > 0 ? 1 : 0)
}

const recorded = JSON.parse(readFileSync(MANIFEST, 'utf8')).files ?? {}
const MESSAGE = {
  changed: (p) => `${p}: 내용이 기록과 다르다. 벤더링한 파일은 손대지 않는다 (ADR-0008).`,
  missing: (p) => `${p}: 기록에 있는데 파일이 없다.`,
  unrecorded: (p) => `${p}: 기록에 없는 파일이다. 벤더링했으면 npm run vendor:record를 돌려라.`,
}
for (const { path, problem } of findDrift(current, recorded)) problems.push(MESSAGE[problem](path))

if (problems.length > 0) {
  console.error('\n벤더링 드리프트:')
  for (const message of problems) console.error(`  ✗ ${message}`)
  process.exit(1)
}
console.log(`벤더링 파일 ${Object.keys(current).length}개 일치.`)
