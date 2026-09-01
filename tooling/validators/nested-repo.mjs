// 저장소 안에 추적되지 않는 다른 git 저장소가 있는지 본다.
//
// `docs/consumer-profile.md`의 §위치가 그린 그림은 **소비 저장소 안에 `.agent-harness/`가
// 있는 것**이다. 반대로 소비 저장소를 하네스 안에 중첩하면 그 저장소는 하네스 쪽에서
// untracked가 되고, 그 순간 `isolation: worktree`가 아무것도 격리하지 못한다 — worktree에
// 그 디렉터리 자체가 존재하지 않기 때문이다.
//
// FE 실행에서 세 역할이 각각 다르게 터졌다. 하나는 `cp`로 복사해 우회했고, 하나는
// 도구 호출 132회로 파일을 조각내 썼고, 하나는 전부 거부당해 되돌렸다. **경계를 뚫지
// 않은 마지막 것이 옳은 행동이었지만, 그 결과 역할 경계가 흐려졌다** — 내용의 소유자와
// 적용한 주체가 달라졌다 (#55).
//
// submodule은 대상이 아니다. 그건 선언된 중첩이라 하네스가 아는 상태다.

/**
 * 중첩된 git 저장소 중 submodule로 선언되지 않은 것.
 *
 * @param {string[]} nestedRepoPaths `.git`을 가진 하위 디렉터리 경로 (저장소 루트 기준)
 * @param {string[]} submodulePaths `.gitmodules`가 선언한 경로
 * @returns {string[]} 선언되지 않은 중첩 저장소
 */
export function findUndeclaredNestedRepos(nestedRepoPaths, submodulePaths) {
  const declared = new Set(submodulePaths ?? [])
  return (nestedRepoPaths ?? []).filter((path) => !declared.has(path)).sort()
}

/** `.gitmodules` 본문에서 path 목록을 뽑는다. */
export function submodulePathsFrom(gitmodules) {
  return [...(gitmodules ?? '').matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map((m) => m[1])
}
