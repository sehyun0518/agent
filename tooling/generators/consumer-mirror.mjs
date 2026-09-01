// 생성물을 소비 저장소에 낼 때 무엇이 하네스 것인지 기록한다.
//
// 하네스의 `.claude/`는 통째로 하네스 것이라 생성 집합에 없는 파일을 지워도 된다.
// **소비 저장소는 다르다.** 그쪽에도 자기 역할·스킬이 있을 수 있고, 지우면 남의 것을
// 지우는 것이다.
//
// 실제로 그 상태를 봤다. `blog`의 `.claude/agents/`에 열한 개가 있는데 전부 하네스가
// 낸 이름이었고, **아홉이 내용이 달랐으며 넷은 아예 없었다.** 손으로 복사한 뒤 아무도
// 갱신하지 않았고 대조하는 것도 없었다 (ADR-0040).
//
// 벤더링이 같은 문제를 이미 풀었다(ADR-0016) — **무엇을 우리가 놓았는지 적어 두고 그것만
// 본다.** 여기서는 방향이 반대일 뿐이다.

/** 소비 저장소에 두는 매니페스트 경로. 프로파일 옆이다. */
export const MANIFEST_PATH = '.agent-harness/generated.json'

/**
 * 이번에 낸 것과 지난번 매니페스트를 비교해 지울 것을 고른다.
 *
 * **지난번에 우리가 놓은 것 중 이번에 안 낸 것**만 지운다. 매니페스트에 없는 파일은
 * 손대지 않는다 — 저장소가 자기 것으로 둔 파일이다.
 *
 * @param {string[]} emitted 이번에 낸 상대 경로
 * @param {{files?: string[]}} previous 지난번 매니페스트
 * @returns {string[]} 지울 상대 경로
 */
export function findStaleMirrorFiles(emitted, previous) {
  const now = new Set(emitted ?? [])
  return (previous?.files ?? []).filter((path) => !now.has(path)).sort()
}

/**
 * 소비 저장소에 이미 있는데 매니페스트에 없는 파일.
 *
 * 손으로 복사한 것이 여기 걸린다. 지우지 않고 **말만 한다** — 저장소가 일부러 둔
 * 것일 수도 있고, 그 판단은 저장소가 한다.
 *
 * @param {string[]} present 소비 저장소의 관리 디렉터리에 있는 상대 경로
 * @param {string[]} emitted 이번에 낸 상대 경로
 * @param {{files?: string[]}} previous
 * @returns {string[]}
 */
export function findUnmanagedFiles(present, emitted, previous) {
  const known = new Set([...(emitted ?? []), ...(previous?.files ?? [])])
  return (present ?? []).filter((path) => !known.has(path)).sort()
}

/**
 * 매니페스트 본문.
 *
 * `harness`는 어느 판이 냈는지다. 소비 저장소가 낡은 채로 두는 것이 실제로 났으므로
 * (`0.0.0`에 멈춰 있었다) 무엇이 놓았는지 남긴다.
 *
 * @param {{version: string, files: string[]}} input
 */
export function buildManifest({ version, files }) {
  return {
    $comment:
      '하네스가 이 저장소에 놓은 생성물. 직접 고치지 않는다 — 하네스에서 다시 낸다. ' +
      '여기 없는 파일은 하네스가 손대지 않는다 (ADR-0040).',
    harness: version,
    files: [...(files ?? [])].sort(),
  }
}
