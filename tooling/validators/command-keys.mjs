// 소비 저장소가 선언한 명령 키가 실제로 쓰이는 키인지 본다.
//
// `commands`는 임의 키를 받는다. Capability variant의 `commandKey`가 그 키를 찾는데,
// **한쪽에 오타가 나도 아무 일이 일어나지 않는다** — 선언한 명령은 아무도 안 부르고,
// 부르는 쪽은 없는 키를 찾는다. 둘 다 조용하다.
//
// 규약 키(`preflight`)는 어느 variant도 가리키지 않지만 이름이 정해져 있다. 그것과
// 오타를 가르려면 아는 이름을 적어 둬야 한다 (ADR-0026).

/** commandKey가 아니지만 하네스가 뜻을 아는 키. */
export const CONVENTION_KEYS = ['preflight']

/** 모든 capability variant가 선언한 commandKey. */
export function declaredCommandKeys(capabilities) {
  const keys = []
  for (const [, capability] of capabilities ?? []) {
    if (capability?.commandKey) keys.push(capability.commandKey)
    for (const variant of Object.values(capability?.variants ?? {})) {
      if (variant?.commandKey) keys.push(variant.commandKey)
    }
  }
  return [...new Set(keys)].sort()
}

/**
 * 선언했는데 아무도 부르지 않는 명령 키. 오타이거나 죽은 명령이다.
 *
 * **반대 방향은 보지 않는다.** "부르는데 선언이 없다"는 계층마다 다르게 판정된다 —
 * 러너 없이 수동으로 검증하는 계층은 명령이 없는 것이 정상이고(ADR-0013), 그 판정은
 * `findTestLayerConflicts`가 이미 계층별로 한다. 여기서 또 보면 선언하지 않은 계층까지
 * 걸린다.
 */
export function findUnusedCommandKeys(commands, commandKeys, conventions = CONVENTION_KEYS) {
  const known = new Set([...(commandKeys ?? []), ...conventions])
  return Object.keys(commands ?? {})
    .filter((key) => !known.has(key))
    .sort()
}
