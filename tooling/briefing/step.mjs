// 워크플로 단계 하나를 실행하려면 무엇을 알아야 하는지 모아 준다.
//
// 지금은 파일 다섯을 열어야 한다 — 워크플로(단계), capability(변형·증거·완료 조건),
// 게이트(무엇을 보는지), 프로파일(삽입 단계), 어휘(토큰이 무슨 뜻인지). `change`는
// 단계가 28개다.
//
// **실행하지 않는다.** 선언을 읽어 사람이 볼 것을 인쇄할 뿐이고, 단계를 부르지도
// 증거를 남기지도 상태를 바꾸지도 않는다. 그 자리는 `execution-state`이고 승격
// 조건이 충족되지 않았다 (ADR-0002 · ADR-0032).
//
// 내용을 복제하지 않는다. 호출할 때마다 선언을 읽으므로 드리프트가 구조적으로 없다 —
// 커맨드 파일이 순서를 옮겨 적지 않는 것과 같은 이유다.

import { extensionApplies, anchoredAt } from '../generators/commands.mjs'
import { matchExpectations } from './evidence.mjs'

/** `gate:`가 문자열일 수도 배열일 수도 있다. */
const gateNames = (gate) => (Array.isArray(gate) ? gate : gate ? [gate] : [])

/**
 * 게이트 문서 머리의 메타 불릿을 뽑는다.
 *
 * 본문은 산문이라 읽지 않는다. 세 파일이 공통으로 갖는 `blocking`과 `소비 증거`만
 * 본다 — 그 둘이 "이 단계가 왜 막히나"에 답한다.
 *
 * @param {string} markdown
 * @returns {{blocking: boolean, consumes: string[]}}
 */
export function parseGateHeader(markdown) {
  const text = markdown ?? ''
  const head = text.split('\n## ')[0]
  const blocking = /^- blocking:\s*예/m.test(head)
  const consumesLine = head.match(/^- 소비 증거:\s*([\s\S]*?)(?=\n- |\n\n|$)/m)?.[1] ?? ''
  const consumes = [...consumesLine.matchAll(/`([^`]+)`/g)].map((m) => m[1])
  return { blocking, consumes }
}

/**
 * 이 단계에 걸리는 프로파일 삽입.
 *
 * 붙는지 판정하는 규칙은 **여기서 정하지 않는다.** 생성기가 같은 규칙으로 커맨드에
 * 삽입을 적고 있고, 두 곳이 다르면 브리핑과 커맨드가 서로 다른 말을 한다.
 *
 * 처음에 여기서 `anchorCapability`만 보고 다시 썼더니 `bugfix`용 삽입이 `change`
 * 브리핑에 섞였다 — 흐름을 안 가렸고 `anchorStep`도 안 봤다 (ADR-0032).
 */
function insertionsFor(workflowId, step, profiles) {
  const found = []
  for (const profile of profiles ?? []) {
    for (const extension of profile?.workflowExtensions ?? []) {
      if (!extensionApplies(extension, workflowId)) continue
      for (const insert of extension?.insert ?? []) {
        if (!anchoredAt(step, insert)) continue
        found.push({
          profile: profile.id,
          id: insert.id,
          runner: insert.runner,
          mode: insert.mode,
          produces: insert.produces ?? [],
          note: insert.note,
        })
      }
    }
  }
  return found
}

/**
 * 단계 하나의 브리핑. 없는 단계면 null.
 *
 * @param {{workflow: object, stepId: string, capabilities: Map<string, object>, profiles?: object[], gates?: Map<string, string>}} input
 */
export function buildStepBriefing({ workflow, stepId, capabilities, profiles, gates, evidence }) {
  const steps = workflow?.steps ?? []
  const index = steps.findIndex((s) => s?.id === stepId)
  if (index === -1) return null

  const step = steps[index]
  const capability = capabilities?.get(step.capability)
  const variant = capability?.variants?.[step.variant]

  return {
    workflow: workflow.id,
    step: step.id,
    position: { index: index + 1, total: steps.length },
    capability: step.capability ?? null,
    variant: step.variant ?? null,
    title: variant?.title ?? capability?.title ?? null,
    agents: (capability?.entrypoints?.agents ?? []).filter(Boolean).map((a) => ({
      id: a.id,
      background: !!a.background,
      isolation: a.isolation ?? 'none',
    })),
    trigger: step.trigger ?? null,
    dependsOn: step.dependsOn ?? [],
    gates: gateNames(step.gate).map((name) => ({
      name,
      ...parseGateHeader(gates?.get(name)),
    })),
    expects: step.expect ?? [],
    expectAnyOf: step.expectAnyOf ?? [],
    // 증거를 안 넘기면 대조하지 않는다. 흐름을 안 고르고 부르는 것이 기본 사용이다.
    matches: evidence ? matchExpectations(evidence, step.expect) : null,
    // expectAnyOf를 쓰는 단계가 서른이다. expect만 대조하면 그쪽은 통째로 안 보인다.
    anyOfMatches: evidence
      ? (step.expectAnyOf ?? []).map((g) => matchExpectations(evidence, g?.conditions))
      : null,
    requires: variant?.requires ?? capability?.requires ?? [],
    evidence: variant?.evidence ?? capability?.evidence ?? [],
    completion: variant?.completion ?? capability?.completion ?? null,
    produces: step.produces ?? variant?.produces ?? [],
    skippable: !!step.skippable,
    insertions: insertionsFor(workflow.id, step, profiles),
  }
}

/** 워크플로에 있는 단계 id. 오타를 냈을 때 무엇이 있는지 보여주려고 쓴다. */
export function stepIds(workflow) {
  return (workflow?.steps ?? []).map((s) => s?.id).filter(Boolean)
}

const bullet = (lines) => lines.map((l) => `  ${l}`).join('\n')

/**
 * 브리핑을 사람이 읽을 텍스트로.
 *
 * 비어 있는 절은 인쇄하지 않는다 — 없는 것을 "없음"으로 채우면 화면이 길어지고
 * 진짜 있는 것이 묻힌다.
 *
 * @param {ReturnType<typeof buildStepBriefing>} b
 * @returns {string}
 */
export function renderStepBriefing(b) {
  if (!b) return ''
  const out = []

  out.push(`단계  ${b.step}   (${b.workflow} ${b.position.index}/${b.position.total})`)
  if (b.capability) {
    const what = b.variant ? `${b.capability} / ${b.variant}` : b.capability
    out.push(`역할  ${what}${b.title ? ` — ${b.title}` : ''}`)
    for (const agent of b.agents) {
      const flags = [agent.background && 'background', `isolation: ${agent.isolation}`].filter(Boolean)
      out.push(`      agent: ${agent.id}  (${flags.join(' · ')})`)
    }
  }
  if (b.trigger) out.push(`실행  ${b.trigger}${b.skippable ? ' · 생략 가능 (사유를 증거로)' : ''}`)

  if (b.gates.length || b.expects.length || b.expectAnyOf.length || b.dependsOn.length) {
    out.push('', '먼저 있어야 하는 것')
    if (b.dependsOn.length) out.push(bullet([`선행 단계  ${b.dependsOn.join(' · ')}`]))
    for (const gate of b.gates) {
      out.push(bullet([`gate  ${gate.name}${gate.blocking ? '  (blocking)' : ''}`]))
      if (gate.consumes?.length) out.push(bullet([`      소비 증거  ${gate.consumes.join(' · ')}`]))
      out.push(bullet([`      workflows/gates/${gate.name}.md`]))
    }
    for (const [i, e] of b.expects.entries()) {
      if (!e?.evidence) continue
      out.push(bullet([`expect  ${e.evidence} = ${e.status}${e.from ? `  (from: ${e.from})` : ''}`]))
      const match = b.matches?.[i]
      if (!match) continue
      if (match.found) out.push(bullet([`        ✓ 있다${match.found.summary ? ` — ${match.found.summary}` : ''}`]))
      else if (match.sameKind) out.push(bullet(['        ⚠ 그 kind는 있는데 status나 단계가 다르다']))
      else out.push(bullet(['        ⚠ 없다']))
    }
    // 바깥 배열이 OR이고 각 묶음의 conditions가 AND다 (workflow.schema.json).
    if (b.expectAnyOf.length) {
      out.push(bullet(['expectAnyOf  아래 묶음 중 하나가 성립하면 된다']))
      for (const [gi, group] of b.expectAnyOf.entries()) {
        const conditions = (group?.conditions ?? [])
          .filter((e) => e?.evidence)
          .map((e) => `${e.evidence} = ${e.status}${e.from ? ` (from: ${e.from})` : ''}`)
          .join('  그리고  ')
        const groupMatches = b.anyOfMatches?.[gi]
        // 묶음 안은 AND다. 하나라도 없으면 그 묶음은 성립하지 않는다.
        const mark = !groupMatches
          ? ''
          : groupMatches.length && groupMatches.every((m) => m.found)
            ? '  ✓'
            : '  ⚠'
        out.push(bullet([`      · ${conditions}${mark}`]))
      }
    }
  }

  if (b.requires.length) {
    out.push('', '요구 토큰')
    out.push(bullet(b.requires))
  }

  if (b.evidence.length) {
    out.push('', '남겨야 하는 증거')
    for (const e of b.evidence) {
      if (!e?.kind) continue
      const flags = [e.required ? '필수' : '선택', e.artifactRequired && 'artifact 필수']
        .filter(Boolean)
        .join(' · ')
      out.push(bullet([`${e.kind.padEnd(24)}  ${flags}`]))
    }
    const required = b.completion?.requiresEvidence ?? []
    if (required.length) {
      const shown = required
        .map((r) => (Array.isArray(r) ? r.join(' 또는 ') : r))
        .join(' · ')
      out.push(bullet([`완료 조건  ${shown}`]))
    }
  }

  if (b.produces.length) {
    out.push('', '내는 토큰')
    out.push(bullet(b.produces))
  }

  if (b.insertions.length) {
    out.push('', '프로파일 삽입')
    for (const i of b.insertions) {
      out.push(bullet([`${i.id}  (${i.profile} · ${i.mode} · runner: ${i.runner})`]))
      if (i.note) out.push(bullet([`      ${i.note.split('\n')[0]}`]))
    }
  }

  out.push(
    '',
    '자동 아님 — 단계 호출과 증거 기록은 사람이 한다 (ADR-0002).',
    '증거는 격리 밖 주 체크아웃에 쓴다 (ADR-0018 · operations.md §1.4.2).',
  )
  return out.join('\n')
}
