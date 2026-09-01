// 네트워크 범위 선언이 실제로 범위인지 본다.
//
// `policies/permissions/network-access.yaml`이 두 문장을 적었다.
//
//   allowlist면 networkAllowlist에 등재된 호스트로만 나갈 수 있다.
//   프로파일은 이 범위를 좁힐 수만 있고 넓힐 수 없다.
//
// **둘 다 아무도 읽지 않았다.** `networkAllowlist`는 두 스키마에 선언돼 있는데 검증기가
// 그 값을 한 번도 보지 않는다 — 등급(none·allowlist·any)만 대조한다. 선언이 아무 일도
// 하지 않으면 선언이 아니라 주석이다 (#46 · #49).
//
// 빈 목록의 뜻은 하나로 고정한다. **"아직 안 정했다"이지 "아무 데도 못 나간다"가 아니다.**
// 호스트는 저장소마다 다르므로(github·gitlab·사내 호스트) 공용 하네스가 이름을 담지
// 않는다 — 명령을 담지 않는 것과 같은 이유다(`AGENT.md`). 소비 저장소가 채운다.

/**
 * 프로파일이 코어 범위를 넓힌 호스트.
 *
 * 코어 목록이 비어 있으면 아직 정해지지 않은 것이므로 넓힘을 판정하지 않는다 —
 * 그 경우 프로파일이 처음 정하는 것이다.
 *
 * @returns {string[]} 코어에 없는데 프로파일이 더한 호스트
 */
export function findWidenedHosts(coreAllowlist, profileAllowlist) {
  const core = coreAllowlist ?? []
  if (core.length === 0) return []
  const allowed = new Set(core)
  return (profileAllowlist ?? []).filter((host) => !allowed.has(host)).sort()
}

/**
 * 소비 저장소가 채워야 하는데 비어 있는 곳.
 *
 * `kind: repository`는 실제로 도는 저장소다. 거기서 `network: allowlist`인데 목록이
 * 비면 나갈 곳이 정해지지 않은 채 나가게 된다. `commands.test.<layer>`를 같은 이유로
 * 요구하는 것과 짝이다.
 *
 * domain 프로파일과 코어는 비어 있는 것이 정상이다 — 호스트는 저장소의 사실이다.
 */
export function findUnfilledAllowlist(permissions, kind) {
  if (kind !== 'repository') return false
  return permissions?.network === 'allowlist' && (permissions.networkAllowlist ?? []).length === 0
}
