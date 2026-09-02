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

import { resolve, sep } from 'node:path'

/** 소비 저장소에 두는 매니페스트 경로. 프로파일 옆이다. */
export const MANIFEST_PATH = '.agent-harness/generated.json'

/**
 * 경로를 POSIX 구분자로 맞춘다.
 *
 * **매니페스트가 저장소에 커밋되어 플랫폼을 건너다닌다.** `relative()`는 Windows에서
 * 백슬래시를 낸다 — Windows에서 낸 매니페스트를 macOS에서 읽으면 겹치는 경로가
 * 하나도 없고, **지난번에 놓은 것 전부가 지울 대상이 된다.**
 *
 * 기록하는 쪽과 읽는 쪽 **양쪽 다** 통과시켜야 한다. 한쪽만 맞추면 Windows 안에서
 * 스스로 안 맞는다.
 *
 * @param {string} path
 * @returns {string}
 */
export function toPosix(path) {
  return String(path).replace(/\\/g, '/')
}

/**
 * 매니페스트의 파일 목록.
 *
 * ADR-0040이 "직접 고치지 않는다"고 적어 둔 파일이므로 **누군가 고친다.** 배열이
 * 아니면 없는 것으로 본다 — 문자열이면 스프레드가 글자로 쪼개지고 숫자면 터진다.
 *
 * @param {unknown} previous
 * @returns {string[]}
 */
function manifestFiles(previous) {
  const files = previous?.files
  return Array.isArray(files) ? files : []
}

/**
 * 상대 경로가 기준 밖으로 나가는가.
 *
 * 매니페스트는 **소비 저장소 안의 데이터 파일**이다. 거기 `../../something`이 들어
 * 있으면 `join(INTO, rel)`이 저장소 밖을 가리키고 **`rmSync`가 남의 파일을 지운다.**
 * 지우는 경로에는 담는 것을 확인하고 들어간다 (#102 리뷰).
 *
 * @param {string} base 절대 경로
 * @param {string} rel
 * @returns {boolean}
 */
export function escapesBase(base, rel) {
  const target = resolve(base, rel)
  return target !== base && !target.startsWith(base.endsWith(sep) ? base : base + sep)
}

/**
 * 이번에 낸 것과 지난번 매니페스트를 비교해 지울 것을 고른다.
 *
 * **지난번에 우리가 놓은 것 중 이번에 안 낸 것**만 지운다. 매니페스트에 없는 파일은
 * 손대지 않는다 — 저장소가 자기 것으로 둔 파일이다.
 *
 * @param {string[]} emitted 이번에 낸 상대 경로
 * @param {{files?: string[]}} previous 지난번 매니페스트
 * @param {string} [base] 소비 저장소 절대 경로. 주면 밖으로 나가는 항목을 뺀다
 * @returns {string[]} 지울 상대 경로
 */
export function findStaleMirrorFiles(emitted, previous, base) {
  const now = new Set((emitted ?? []).map(toPosix))
  return manifestFiles(previous)
    .map(toPosix)
    .filter((path) => !now.has(path))
    .filter((path) => !base || !escapesBase(base, path))
    .sort()
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
  const known = new Set([...(emitted ?? []), ...manifestFiles(previous)].map(toPosix))
  return (present ?? []).map(toPosix).filter((path) => !known.has(path)).sort()
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
    files: [...(files ?? [])].map(toPosix).sort(),
  }
}
