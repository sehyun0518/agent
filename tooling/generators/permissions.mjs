// 하네스의 승인 선언을 플랫폼 permission 런타임으로 투영한다.
//
// 지금까지 런타임에 전달되는 안전 정보는 "도구 목록" 하나뿐이었고, 그 목록의 가장 넓은
// 항목이 `Bash`였다. `readonly: true`인 역할 넷이 전부 `Bash`를 들고 있는데 검증기는
// 그것을 `filesystem: read`로 분류한다 — 선언끼리는 앞뒤가 맞지만 실제로는 쓰기·삭제가
// 된다 (#46).
//
// 이 저장소에는 런타임이 없다(ADR-0002). 그런데 **플랫폼에는 있다.** 승인 선언을
// 플랫폼 설정으로 투영하면 런타임을 만들지 않고도 처음으로 실제 강제를 얻는다.
//
// 무엇이 승인 대상인지는 여기서 정하지 않는다. `capability.yaml`의 `requiresApproval`이
// 단일 출처이고, 이 파일은 **플랫폼마다 그것을 어떤 문법으로 쓰는지**만 안다. 하네스는
// 한 플랫폼의 것이 아니므로 패턴은 플랫폼 키 아래 둔다 — 투영하지 않는 플랫폼은
// `unprojected`에 사유와 함께 적어, 구멍이 하네스 전체가 아니라 그 플랫폼의 것임을
// 드러낸다.

/**
 * 이 플랫폼에 실제로 투영된 패턴.
 *
 * 배열이 아니거나 비어 있으면 투영이 아니다. 판정과 생성이 같은 함수를 봐야 한다 —
 * 한쪽만 문자열을 받아들이면 "투영이 없다"고 보고하면서 그 패턴을 설정에 쓰게 된다.
 */
function patternsFor(entry, platform) {
  const value = entry?.[platform]
  if (!Array.isArray(value)) return []
  return value.filter(
    (pattern) =>
      (typeof pattern === 'string' && pattern.length > 0) ||
      (Array.isArray(pattern) &&
        pattern.length > 0 &&
        pattern.every((token) => typeof token === 'string' && token.length > 0)),
  )
}

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
 * `unprojected` — 승인을 요구하는데 이 플랫폼의 명령 패턴이 없다. 선언이 런타임에
 *   도달하지 않는다.
 * `orphan` — 표에는 있는데 그런 변형이 없거나 승인을 요구하지 않는다. 표가 오래됐다.
 */
export function findPermissionMismatches(capabilities, table, platform) {
  const declared = new Set(approvalRequiredVariants(capabilities))
  const entries = table?.approvalRequired ?? {}
  const projected = new Set(
    Object.entries(entries)
      .filter(([, patterns]) => patternsFor(patterns, platform).length > 0)
      .map(([key]) => key),
  )

  return [
    ...[...declared].filter((k) => !projected.has(k)).map((key) => ({ key, problem: 'unprojected' })),
    ...Object.keys(entries).filter((k) => !declared.has(k)).map((key) => ({ key, problem: 'orphan' })),
  ]
}

/**
 * 켜져 있는데 투영도 안 하고 사유도 없는 플랫폼.
 *
 * 투영하지 않는 것 자체는 정당할 수 있다. 조용한 것이 문제다 — 사유가 없으면 그
 * 플랫폼에서 승인이 강제되지 않는다는 사실을 아무도 모른다.
 */
export function findUndeclaredPlatforms(platforms, table) {
  const excused = table?.unprojected ?? {}
  // 한 조건으로 둔다. 앞의 `config?.enabled`가 단축 평가로 뒤를 지키므로 뒤에 옵셔널
  // 체이닝을 또 붙일 필요가 없고, 나눠 놓으면 그 보장이 다른 줄에 있어 없는 것처럼 읽힌다.
  return Object.entries(platforms ?? {})
    .filter(
      ([name, config]) =>
        !name.startsWith('$') && config?.enabled && !config.permissionFile && !excused[name],
    )
    .map(([name]) => name)
}

/**
 * 플랫폼이 읽는 설정. ask는 승인 선언에서, deny는 어떤 변형도 선언하지 않은 것에서 온다.
 *
 * 중복을 없앤다. 변형 둘이 같은 패턴을 요구하면 목록에 두 번 들어가는데, 생성물이
 * 그대로 두면 무엇이 왜 있는지 읽기 어렵고 드리프트 비교도 흔들린다.
 */
export function buildSettings(capabilities, table, platform) {
  const unique = (entries) => {
    const byValue = new Map(entries.map((entry) => [JSON.stringify(entry), entry]))
    return [...byValue.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry)
  }

  const ask = unique(
    approvalRequiredVariants(capabilities).flatMap((key) =>
      patternsFor(table?.approvalRequired?.[key], platform),
    ),
  )
  const deny = unique(
    Object.values(table?.neverAllowed ?? {}).flatMap((group) => patternsFor(group, platform)),
  )
  return { permissions: { ask, deny } }
}

function renderCodexRule(pattern, decision, justification) {
  const invalid =
    !Array.isArray(pattern) ||
    pattern.length === 0 ||
    pattern.some((token) => typeof token !== 'string' || token.length === 0)
  if (invalid) {
    throw new Error(
      `codex-rules 패턴은 비어 있지 않은 명령 토큰 배열이어야 한다: ${JSON.stringify(pattern)}`,
    )
  }
  const tokens = pattern.map((token) => JSON.stringify(token)).join(', ')
  return (
    `prefix_rule(\n` +
    `    pattern = [${tokens}],\n` +
    `    decision = ${JSON.stringify(decision)},\n` +
    `    justification = ${JSON.stringify(justification)},\n` +
    `)`
  )
}

/** 플랫폼 permission 파일을 canonical 형식으로 렌더링한다. */
export function renderPermissionFile(format, settings) {
  if (format === 'claude-settings') return `${JSON.stringify(settings, null, 2)}\n`
  if (format === 'codex-rules') {
    const rules = [
      ...(settings?.permissions?.ask ?? []).map((pattern) =>
        renderCodexRule(
          pattern,
          'prompt',
          'capability.yaml의 requiresApproval 선언에서 생성됨',
        ),
      ),
      ...(settings?.permissions?.deny ?? []).map((pattern) =>
        renderCodexRule(
          pattern,
          'forbidden',
          'permissions.json의 neverAllowed 선언에서 생성됨',
        ),
      ),
    ]
    return (
      `# 이 파일은 생성물이다. tooling/generators/permissions.json을 고치고 npm run generate를 실행한다.\n` +
      (rules.length > 0 ? `\n${rules.join('\n\n')}\n` : '')
    )
  }
  throw new Error(`permissionFormat "${format}"에 렌더러가 없다.`)
}
