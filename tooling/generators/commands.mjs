/**
 * 수동 실행 대상을 계약에서 유도한다.
 *
 * 중앙 목록을 두지 않는다. 커맨드로 낼 것을 따로 선언하면 선언과 계약이 어긋날 수
 * 있고, 새 변형을 넣으면서 목록을 안 고치면 조용히 빠진다(ADR-0001).
 *
 * 세 축에서 유도한다.
 *   1. chaining.autoTriggerable이 false인 Capability의 각 변형
 *   2. workflowExtensions에 삽입되지 않은 프로파일 역할
 *   3. 워크플로 자체 — 흐름의 진입점
 */

/** `git-operations#pr-create` → `git-pr-create` */
function shortId(capabilityId, variant) {
  const head = capabilityId.replace(/-operations$/, '').replace(/^project-design$/, 'project')
  return `${head}-${variant}`
}

/**
 * @param {Map<string, any>|Iterable<[string, any]>} capabilities
 * @returns {Array<{name, kind, capability, variant, title, description}>}
 */
export function commandsFromCapabilities(capabilities) {
  const entries = capabilities instanceof Map ? capabilities : new Map(capabilities)
  const out = []
  for (const [id, capability] of entries) {
    // 워크플로가 자동 단계로 둘 수 없는 것 = 사람이 직접 부르는 것.
    if (capability?.chaining?.autoTriggerable !== false) continue
    for (const [variant, scope] of Object.entries(capability.variants ?? {})) {
      out.push({
        name: shortId(id, variant),
        kind: 'variant',
        capability: id,
        variant,
        title: scope.title ?? variant,
        description: (scope.description ?? capability.description ?? '').trim(),
      })
    }
  }
  return out
}

/**
 * 삽입 지점이 없는 프로파일 역할은 어느 워크플로에도 들어가지 않는다.
 * 그것이 곧 수동 전용이라는 선언이다(ADR-0010).
 *
 * @param {{agents?: Array, workflowExtensions?: Array}} profile
 * @returns {Array<{name, kind, runner, title, description}>}
 */
export function commandsFromProfile(profile) {
  const inserted = new Set(
    (profile.workflowExtensions ?? []).flatMap((e) => (e.insert ?? []).map((i) => i.runner)),
  )
  return (profile.agents ?? [])
    .filter((agent) => !inserted.has(agent.id))
    .map((agent) => ({
      name: agent.id.replace(/^project-design-/, 'project-'),
      kind: 'agent',
      runner: agent.id,
      title: agent.id,
      description: (agent.description ?? '').trim(),
    }))
}

/**
 * 프로파일이 이 워크플로에 끼우는 단계.
 *
 * 순서의 단일 출처는 워크플로이고 삽입 지점은 프로파일이 소유한다
 * (`profile.schema.json`). 그 분리는 의도된 설계인데, 대가로 워크플로 파일만 읽는
 * 실행자에게 도메인 단계의 **존재 자체**가 전달되지 않았다. 실제로 `design`과
 * `state-data`를 빠뜨린 실행이 있었다 (#52).
 *
 * 여기서 순서를 계산하지 않는다. 무엇이 이 흐름에 붙는지만 낸다 — 어디에 붙는지는
 * 프로파일이 계속 소유한다.
 *
 * `workflow: "*"` 삽입이라도 앵커 capability가 그 흐름에 없으면 붙지 않는다.
 * 프로파일이 note에 적어 둔 동작이다 — "review 전용 흐름에는 계약 고정 단계가
 * 없으므로 이 삽입은 건너뛰어진다".
 *
 * @returns {Array<{profile: string, id: string, runner: string}>}
 */
export function insertionsForWorkflow(workflow, profiles) {
  const steps = workflow?.steps ?? []
  const out = []
  for (const profile of profiles ?? []) {
    for (const extension of profile.workflowExtensions ?? []) {
      if (!extensionApplies(extension, workflow?.id)) continue
      for (const insert of extension.insert ?? []) {
        if (!hasAnchor(steps, insert)) continue
        out.push({ profile: profile.id, id: insert.id, runner: insert.runner })
      }
    }
  }
  return out
}

/**
 * 이 삽입이 이 흐름의 것인가. `*`는 모든 흐름이다.
 *
 * 흐름을 안 가리면 `bugfix`용 삽입이 `change`에 섞인다 — 브리핑을 만들다 실제로 그랬다
 * (ADR-0032).
 */
export function extensionApplies(extension, workflowId) {
  return extension?.workflow === '*' || extension?.workflow === workflowId
}

/**
 * 이 삽입이 이 단계에 붙는가.
 *
 * `== null`인 것은 YAML이 값 없는 키(`anchorStep:`)를 `null`로 파싱하기 때문이다.
 * `=== undefined`로 보면 그 선언이 어떤 step과도 안 맞아 **삽입이 통째로 사라진다.**
 * 값 없는 키는 스키마 위반이라 `npm run validate`가 거부하지만, 거부당하는 입력에
 * 대고 조용히 단계를 지우는 것과 없는 제약으로 보는 것 중에서는 후자가 낫다.
 */
export function anchoredAt(step, insert) {
  return (
    step?.capability === insert?.anchorCapability &&
    (insert?.anchorStep == null || step?.id === insert.anchorStep)
  )
}

function hasAnchor(steps, insert) {
  return steps.some((step) => anchoredAt(step, insert))
}

/** 이름이 겹치면 어느 쪽이 불릴지 알 수 없다. 생성 전에 잡는다. */
export function findDuplicateCommands(commands) {
  const seen = new Map()
  const dupes = []
  for (const c of commands) {
    if (seen.has(c.name)) dupes.push({ name: c.name, sources: [seen.get(c.name), sourceOf(c)] })
    else seen.set(c.name, sourceOf(c))
  }
  return dupes
}

function sourceOf(c) {
  if (c.kind === 'variant') return `${c.capability}#${c.variant}`
  if (c.kind === 'workflow') return `workflows/${c.workflow}.yaml`
  return c.runner
}

/**
 * 워크플로는 그 자체가 진입점이다.
 *
 * 실행 코드가 없는 것과 실행 주체가 없는 것은 다르다. 이 하네스는 "실제 단계 호출과
 * 증거 기록은 사람 또는 메인 에이전트가 수행한다"고 정해뒀다(ADR-0004·0005·0010).
 * 커맨드는 그 주체에게 흐름을 건네는 것이지 대신 도는 것이 아니다.
 *
 * 단계 수는 워크플로가 가진 것만 센다. 프로파일이 끼우는 것은 insertions가 따로
 * 담는다 — 둘을 더해 하나의 수로 내면 커맨드를 읽는 사람이 워크플로 파일에서 그
 * 수를 확인할 수 없다.
 *
 * @param {Array<{id: string, title?: string, description?: string, steps?: Array}>} workflows
 * @param {Array<{id: string, workflowExtensions?: Array}>} profiles
 * @returns {Array<{name, kind, workflow, title, description, stepCount, insertions}>}
 */
/**
 * 흐름을 돌리는 사람을 돕는 도구 커맨드.
 *
 * Capability도 워크플로도 아니라 선언에서 유도되지 않는다. 그래서 여기 적는다 —
 * 대신 **본문에 절차를 옮겨 적지 않고 스크립트를 가리키기만 한다.** 스크립트가
 * 호출 시점에 원본을 읽으므로 드리프트가 생길 자리가 없다 (ADR-0032).
 *
 * `note`는 도구마다 다르다. 하나로 묶으면 읽는 원본도 하는 일도 다른 도구가 같은
 * 설명을 달게 된다 — 실제로 `reviews`가 `step`의 문구를 그대로 받았다.
 */
export const TOOL_COMMANDS = [
  {
    name: 'step',
    kind: 'tool',
    script: 'npm run step -- <workflow> <step> [--profile <경로>] [--run <runId>]',
    description:
      '워크플로 단계 하나에 필요한 것을 한 화면으로 모은다 — 돌릴 명령·계층 규약·게이트·선행 증거·남길 증거·내는 토큰·프로파일 삽입.',
    note:
      '출력은 선언에서 그때그때 조립된다. **실행하지 않는다** — 단계를 부르는 것도 증거를 남기는 것도 사람이 한다 (ADR-0002 · ADR-0032).',
  },
  {
    name: 'init',
    kind: 'tool',
    script: 'npm run init -- <소비저장소 경로>',
    description:
      '소비 저장소에 프로파일 뼈대를 놓고 코어가 찾는 명령 키를 알려준다. 이미 있으면 손대지 않는다.',
    note:
      '**탐지하지 않는다** — package.json을 읽어 라이브러리를 알아내면 하네스가 생태계를 아는 것이 된다 (ADR-0026). 채울 것을 선언에서 유도해 보여줄 뿐이고 무엇을 쓸지는 저장소가 정한다 (ADR-0039).',
  },
  {
    name: 'reviews',
    kind: 'tool',
    script: 'npm run reviews -- <pr번호>',
    description:
      '머지 전에 답하지 않은 리뷰 지적과 진행 중인 체크를 센다. 남아 있으면 0이 아닌 코드로 끝난다.',
    note:
      'GitHub에서 그때그때 읽는다. **막지 않는다** — 머지 여부는 사람이 정하고, 이 명령은 아직 볼 것이 남았는지만 말한다 (ADR-0034).',
  },
]

/**
 * 있지도 않은 npm 스크립트를 가리키는 도구 커맨드.
 *
 * 커맨드 본문이 `npm run step`이라고 적는데 그 스크립트가 없으면, 부른 사람은
 * 커맨드가 깨졌는지 자기가 틀렸는지 모른다. 이름이 두 곳에 있으므로 대조한다 —
 * `commandKey` 오타(ADR-0026)와 같은 자리다.
 *
 * @param {Array<{name: string, script?: string}>} tools
 * @param {Record<string, string>} packageScripts
 * @returns {Array<{command: string, script: string}>}
 */
export function findMissingToolScripts(tools, packageScripts) {
  const known = new Set(Object.keys(packageScripts ?? {}))
  const missing = []
  for (const tool of tools ?? []) {
    const script = /^npm run ([a-z][a-z0-9:-]*)/.exec(tool?.script ?? '')?.[1]
    if (!script || known.has(script)) continue
    missing.push({ command: tool.name, script })
  }
  return missing
}

/**
 * 설명(`note`)이 없는 도구 커맨드.
 *
 * 없으면 생성된 파일에 `undefined`가 그대로 찍힌다. 폴백으로 빈 문자열을 두면
 * 찍히지는 않지만 **설명 없는 커맨드가 조용히 남는다** — 도구는 무엇을 읽고
 * 무엇을 안 하는지가 설명의 전부라 그것이 없으면 커맨드가 아니라 명령 한 줄이다.
 *
 * @param {Array<{name: string, note?: string}>} tools
 * @returns {string[]} 설명 없는 커맨드 이름
 */
export function findToolCommandsWithoutNote(tools) {
  return (tools ?? []).filter((t) => !t?.note?.trim()).map((t) => t?.name).filter(Boolean)
}

export function commandsFromTools() {
  return TOOL_COMMANDS.map((c) => ({ ...c }))
}

export function commandsFromWorkflows(workflows, profiles = []) {
  return (workflows ?? []).map((w) => ({
    name: w.id,
    kind: 'workflow',
    workflow: w.id,
    title: w.title ?? w.id,
    description: (w.description ?? '').trim(),
    stepCount: (w.steps ?? []).length,
    insertions: insertionsForWorkflow(w, profiles),
  }))
}
