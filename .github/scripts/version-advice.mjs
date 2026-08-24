// PR이 공개 표면을 건드렸는지와 package.json version이 움직였는지를 대조해
// 추천 한 덩어리를 만든다. 판정하지 않고 추천만 한다 — 등급을 기계가 정할 수
// 없기 때문이다. 무엇이 바뀌었고 버전이 어떤 상태인지까지만 확실히 적고,
// 등급 판단은 Copilot과 사람에게 넘긴다.
//
// 이 검사는 절대 실패하지 않는다. 막는 것은 harness.yml이 소유한다.

import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE_SHA
const HEAD = process.env.HEAD_SHA

// 소비 저장소가 의존하는 것만 공개 표면이다. README·docs·산문은 아니다.
// .github/copilot-instructions.md의 목록과 같은 것을 본다. 한쪽만 고치면 어긋난다.
//
// 깊이는 두 갈래로 다르게 잡는다.
//
// 선언 파일은 최상위 한 겹만 본다(`[^/]+`). 이 저장소는 evals/·tests/ 아래에
// yaml을 두는 관례가 있는데, 그것들은 선언을 검증하는 쪽이지 소비 저장소가
// 의존하는 계약이 아니다. 넓게 잡으면 테스트 케이스를 고친 PR이 공개 표면
// 변경으로 잡힌다.
//
// 스키마는 반대로 넓게 둔다(`.*`). 이 검사는 막지 않고 조언만 하므로 과탐지는
// "확인하세요" 한 줄로 끝나지만, 계약 디렉터리에 스키마가 하나 더 생겼을 때
// 파일명을 못 박아 뒀으면 신호가 통째로 사라진다. 미탐지가 더 비싸다.
const SURFACE = [
  [/^packages\/manifest-contracts\/.*\.schema\.json$/, '선언 스키마'],
  [/^packages\/policy-contracts\/.*\.schema\.json$/, '정책 계약'],
  [/^packages\/telemetry-contracts\/.*\.schema\.json$/, '텔레메트리 계약'],
  [/^tooling\/generators\/platforms\.json$/, '생성 산출물 레이아웃'],
  [/^profiles\/[^/]+\/profile\.yaml$/, '프로파일 계약'],
  [/^capabilities\/[^/]+\/capability\.yaml$/, 'Capability 선언'],
  [/^workflows\/[^/]+\.ya?ml$/, '워크플로 선언'],
]

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

const versionAt = (ref) => {
  try {
    return JSON.parse(git('show', `${ref}:package.json`)).version
  } catch {
    return null
  }
}

const changed = git('diff', '--name-only', `${BASE}...${HEAD}`).split('\n').filter(Boolean)

const hits = []
for (const file of changed) {
  const match = SURFACE.find(([re]) => re.test(file))
  if (match) hits.push({ file, kind: match[1] })
}

const before = versionAt(BASE)
const after = versionAt(HEAD)
const moved = before !== after
const preRelease = after?.startsWith('0.')

const out = ['<!-- version-advice -->', '### 버전 관리 추천', '']

if (hits.length === 0 && !moved) {
  out.push(`공개 표면 변경 없음. \`${after}\` 유지가 맞습니다.`)
} else if (hits.length === 0 && moved) {
  out.push(`공개 표면 변경이 없는데 버전이 \`${before}\` → \`${after}\`로 움직였습니다.`,
    '', '의도한 릴리스인지 확인하세요. 문서·산문만 바뀐 PR이라면 버전은 그대로 두는 편이 낫습니다.')
} else {
  const grouped = new Map()
  for (const { file, kind } of hits) grouped.set(kind, [...(grouped.get(kind) ?? []), file])

  out.push('공개 표면이 바뀌었습니다.', '')
  for (const [kind, files] of grouped) {
    out.push(`- **${kind}** — ${files.map((f) => `\`${f}\``).join(', ')}`)
  }
  out.push('')

  if (moved) {
    out.push(`버전은 \`${before}\` → \`${after}\`로 올라와 있습니다. 등급이 변경 범위에 맞는지만 확인하세요.`)
  } else {
    out.push(`버전은 \`${after}\` 그대로입니다. 올릴지 판단이 필요합니다.`)
  }
  if (preRelease) {
    out.push('', '`0.x`이므로 파괴적 변경도 **minor**로 올립니다. `1.0.0`은 실행 엔진과 증거 저장소가 붙은 뒤입니다.')
  }
}

out.push('', '<sub>등급 판단은 하지 않습니다 — 무엇이 바뀌었는지만 확실히 하고 나머지는 리뷰에 맡깁니다.</sub>')
console.log(out.join('\n'))
