// 하네스의 승인 선언을 플랫폼 permission 런타임으로 투영한다.
//
// 지금까지 런타임에 전달되는 안전 정보는 "도구 목록" 하나뿐이었고, 그 목록의 가장 넓은
// 항목이 `Bash`였다. `readonly: true`인 역할 넷이 전부 `Bash`를 들고 있는데 검증기는
// 그것을 `filesystem: read`로 분류한다 — 선언끼리는 앞뒤가 맞지만 실제로는 쓰기·삭제가
// 된다 (#46).
//
// 이 저장소에는 런타임이 없다(ADR-0002). 그런데 **플랫폼에는 있다.** 승인 선언을
// `settings.json`으로 투영하면 런타임을 만들지 않고도 처음으로 실제 강제를 얻는다.
//
// 무엇이 승인 대상인지는 여기서 정하지 않는다. `capability.yaml`의 `requiresApproval`이
// 단일 출처이고, 이 파일은 그것을 어떤 명령 패턴으로 옮기는지만 안다. 양방향으로
// 대조하므로 어느 쪽이 어긋나도 조용하지 않다.

/** `{ 'git-operations': {variants: {push: {requiresApproval: true}}} }` → `['git-operations#push']` */
export function approvalRequiredVariants(capabilities) {
  const found = []
  for (const [id, capability] of capabilities ?? []) {
    for (const [name, variant] of Object.entries(capability?.variants ?? {})) {
      if (variant?.requiresApproval === true) found.push(`${id}#${name}`)
    }
    if (!capability?.variants && capability?.requiresApproval === true) found.push(id)
  }
  return found
}

/**
 * 선언과 투영 표가 어긋난 곳.
 *
 * `unprojected` — 승인을 요구하는데 명령 패턴이 없다. 선언이 강제되지 않는다.
 * `orphan` — 표에는 있는데 그런 변형이 없거나 승인을 요구하지 않는다. 표가 오래된 것이다.
 */
export function findPermissionMismatches(capabilities, table) {
  const declared = new Set(approvalRequiredVariants(capabilities))
  const projected = new Set(Object.keys(table?.approvalRequired ?? {}))

  return [
    ...[...declared].filter((k) => !projected.has(k)).map((key) => ({ key, problem: 'unprojected' })),
    ...[...projected].filter((k) => !declared.has(k)).map((key) => ({ key, problem: 'orphan' })),
  ]
}

/** 플랫폼이 읽는 설정. ask는 승인 선언에서, deny는 어떤 변형도 선언하지 않은 것에서 온다. */
export function buildSettings(capabilities, table) {
  const ask = approvalRequiredVariants(capabilities)
    .flatMap((key) => table?.approvalRequired?.[key] ?? [])
    .sort()
  const deny = (table?.neverAllowed ?? []).map((entry) => entry.pattern).sort()
  return { permissions: { ask, deny } }
}
