// 소비 저장소에 프로파일 뼈대를 놓고 무엇을 채워야 하는지 말한다.
//
// **탐지하지 않는다.** `package.json`을 읽어 `vitest`를 알아내면 그 순간 하네스가 Node
// 생태계를 아는 것이고, ADR-0026이 그은 선을 넘는다 — "하네스는 Node도 pnpm도 모른다".
// 채울 것을 **선언에서 유도해 목록으로 보여줄 뿐**이고, 무엇을 쓸지는 저장소가 정한다.
//
// 그래서 이 명령이 하는 일은 셋이다.
//
//   1. 없으면 최소 유효 프로파일을 쓴다 (있으면 손대지 않는다)
//   2. 코어가 찾는 명령 키를 선언에서 유도해 보여준다
//   3. 서브모듈이 제대로 붙었는지 본다 — 실제로 파일 복사본이던 저장소가 있었다
//
// 검증은 하지 않는다. `validate --profile`이 그 일을 하고, 여기서 다시 하면 같은
// 판정이 두 곳에 생긴다 (ADR-0039).

/** 최소 유효 프로파일. 스키마의 required 넷만 채우고 나머지는 주석으로 남긴다. */
export function skeleton({ id, namespace, commandKeys, conventionKeys }) {
  const keys = (commandKeys ?? []).map((k) => `  #   ${k}`).join('\n')
  const conventions = (conventionKeys ?? []).map((k) => `  #   ${k}`).join('\n')
  return `# ${id} 로컬 profile
#
# 이 저장소가 소유하는 것: 실행 명령 · 컨벤션 · 권한 축소.
# 순서와 게이트는 하네스의 workflows/ 가 소유한다.

schemaVersion: 1
id: ${id}
kind: repository
namespace: ${namespace}

# ---------------------------------------------------------------- 실행 명령
# 코어 변형의 commandKey가 여기를 찾는다. 이름이 아래와 다르면 **양쪽 다 조용히**
# 안 맞는다 — 선언한 명령은 아무도 안 부르고 코어는 없는 키를 찾는다 (ADR-0026).
#
# 코어가 찾는 키
${keys}
#
# 규약 키 (없어도 되지만, 없으면 툴체인 실패가 첫 명령에서야 드러난다 — ADR-0026)
${conventions}
commands: {}

# ---------------------------------------------------------------- 테스트 계층
# 안 적으면 도메인 프로파일이 쓰는 것을 제안받는다. 막지 않는다 (ADR-0037).
#
# testing:
#   layers:
#     unit: { libraries: [], filePatterns: [] }

# ---------------------------------------------------------------- 권한 축소
# 좁힐 수만 있다. Capability보다 넓게 선언하면 검증기가 거부한다.
permissions:
  network: none
  destructive: false
`
}

/**
 * 서브모듈이 제대로 붙었는지.
 *
 * **디렉터리가 있다는 전제로 부른다.** 없으면 부르지 않는다 — 나란히 두는 배치가
 * 정당하기 때문이다(ADR-0020).
 *
 * 실제 저장소가 **파일 복사본**이었다 — git 인덱스는 gitlink인데 디렉터리에 `.git`이
 * 없고 `node_modules`까지 들어 있었다. 그 상태로는 버전을 올릴 수 없다.
 *
 * 제대로 붙은 것은 **둘 다 참일 때뿐**이다. 처음에 `!gitlink && !dotGit`을 정상으로
 * 뒀는데, 그것도 파일 복사본이다 — 인덱스에도 없고 저장소도 아닌 디렉터리가 거기
 * 있다는 뜻이다 (#101 리뷰).
 *
 * @param {{gitlink: boolean, dotGit: boolean}} state
 * @returns {string|null} 문제 설명. 정상이면 null
 */
export function submoduleProblem({ gitlink, dotGit }) {
  if (gitlink && dotGit) return null
  if (!gitlink && dotGit) {
    return '디렉터리는 git 저장소인데 인덱스에 서브모듈로 기록되지 않았다 — 중첩 저장소다 (ADR-0020).'
  }
  return '파일 복사본이다 — 서브모듈로 동작하지 않아 버전을 올릴 수 없다. git submodule add로 다시 붙인다.'
}

/**
 * 프로파일이 아직 안 채운 것.
 *
 * @param {{commands?: object}} profile
 * @param {string[]} commandKeys 코어가 찾는 키
 * @param {string[]} conventionKeys
 * @returns {{missing: string[], conventionsMissing: string[]}}
 */
export function whatIsLeft(profile, commandKeys, conventionKeys) {
  const declared = new Set(Object.keys(profile?.commands ?? {}))
  return {
    missing: (commandKeys ?? []).filter((k) => !declared.has(k)),
    conventionsMissing: (conventionKeys ?? []).filter((k) => !declared.has(k)),
  }
}
