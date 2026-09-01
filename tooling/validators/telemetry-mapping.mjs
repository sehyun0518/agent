// 프로파일의 이벤트 이름 매핑이 실재하는 이벤트를 가리키는지 본다.
//
// `profile.telemetry`는 코어 이벤트 이름을 저장소의 이름으로 바꾸는 표이고
// "Adapter가 소비한다"고 스키마가 적어 뒀다. 그런데 `additionalProperties: {type:
// string}`이라 **아무 키나 받는다.**
//
// 없는 이름을 적으면 두 쪽이 조용하다. 매핑은 영영 안 걸리고, Adapter는 오지 않는
// 이름을 기다린다. ADR-0026이 `commandKey`에서 본 것과 같다 — "선언한 명령은 아무도
// 안 부르고, 부르는 쪽은 없는 키를 찾는다. 둘 다 조용하다."
//
// 그리고 이쪽이 더 나쁘다. 매핑이 빠진 이벤트는 차원 하나를 통째로 잃는데
// (ADR-0031 결정 2), 잃었다는 사실이 관측 시스템 쪽에서도 안 보인다 — 안 온 이벤트는
// 세어지지 않는다.
//
// 값은 보지 않는다. 저장소가 자기 이름을 정하는 자리이고 하네스는 그 이름을 모른다 —
// 명령을 담지 않는 것과 같은 이유다 (AGENT.md).

/**
 * `event.schema.json`이 아는 이벤트 이름.
 *
 * @param {object} eventSchema
 * @returns {string[]}
 */
export function knownEventNames(eventSchema) {
  return eventSchema?.properties?.event?.enum ?? []
}

/**
 * 코어에 없는 이벤트를 가리키는 매핑 키.
 *
 * @param {Map<string, {telemetry?: Record<string, string>}>} profiles
 * @param {string[]} knownEvents
 * @returns {Array<{profile: string, event: string}>}
 */
export function findUnknownTelemetryEvents(profiles, knownEvents) {
  const known = new Set(knownEvents ?? [])
  const found = []
  for (const [id, profile] of profiles ?? []) {
    for (const event of Object.keys(profile?.telemetry ?? {})) {
      if (known.has(event)) continue
      found.push({ profile: id, event })
    }
  }
  return found
}
