import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTestingLayers } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'
import { resolveRunners, findUnresolvedRunners, findDuplicateInserts } from './profile-roster.mjs'
import { findDocumentationBypass } from './documentation-gate.mjs'

test('계층별 red 생산자가 구현의 조상이면 전이를 허용한다', () => {
  const graph = createWorkflowGraph([
    { id: 'ui-design', produces: ['test-design.ui.completed'] },
    { id: 'ui-red', dependsOn: ['ui-design'], produces: ['test.ui.red-confirmed'] },
    { id: 'ui-implementation', dependsOn: ['ui-red'] },
  ])

  assert.equal(graph.hasAncestorProducer('ui-implementation', 'test.ui.red-confirmed'), true)
  assert.deepEqual(graph.duplicates, [])
  assert.deepEqual(graph.cycles, [])
})

test('red 생산자가 있어도 구현의 조상이 아니면 우회로 판정한다', () => {
  const graph = createWorkflowGraph([
    { id: 'ui-red', produces: ['test.ui.red-confirmed'] },
    { id: 'unit-green' },
    { id: 'ui-implementation', dependsOn: ['unit-green'] },
  ])

  assert.equal(graph.producerIds('test.ui.red-confirmed').length, 1)
  assert.equal(graph.hasAncestorProducer('ui-implementation', 'test.ui.red-confirmed'), false)
})

test('중복 단계와 의존 순환을 검출한다', () => {
  const duplicateGraph = createWorkflowGraph([
    { id: 'a' },
    { id: 'a' },
  ])
  const cycleGraph = createWorkflowGraph([
    { id: 'a', dependsOn: ['b'] },
    { id: 'b', dependsOn: ['a'] },
  ])

  assert.deepEqual(duplicateGraph.duplicates, ['a'])
  assert.ok(cycleGraph.cycles.length > 0)
})

test('repository 테스트 계층은 domain 기본값과 섞지 않고 전체 대체한다', () => {
  const resolved = resolveTestingLayers(
    { ui: { libraries: ['vitest', '@testing-library/react'], filePatterns: ['*.ui.test.tsx'] } },
    { ui: { libraries: ['jest', '@testing-library/react'] } },
  )

  assert.deepEqual(resolved.ui, { libraries: ['jest', '@testing-library/react'] })
})

// ---------------------------------------------------------------- 문서화 선행 관계
// 선행 토큰 검사는 생산 단계가 이미 있을 때만 조상 여부를 본다. 단계를 통째로 뺀
// 우회는 그 검사에 걸리지 않으므로 별도 규칙이 잡아야 한다.

const CAPABILITIES = new Map([
  ['specification', {}],
  ['documentation', {}],
  ['review', {}],
  ['test-execution', { variants: { unit: {}, e2e: {} } }],
])

test('문서 단계가 판정 단계의 조상이면 통과한다', () => {
  const steps = [
    { id: 'specification', capability: 'specification' },
    { id: 'documentation', capability: 'documentation', dependsOn: ['specification'] },
    { id: 'review', capability: 'review', dependsOn: ['documentation'] },
  ]

  assert.deepEqual(findDocumentationBypass(steps, createWorkflowGraph(steps)), [])
})

test('문서 단계 없이 판정으로 가는 워크플로를 우회로 판정한다', () => {
  const steps = [
    { id: 'specification', capability: 'specification' },
    { id: 'review', capability: 'review', dependsOn: ['specification'] },
  ]

  assert.deepEqual(findDocumentationBypass(steps, createWorkflowGraph(steps)), [
    { stepId: 'review', reason: 'missing' },
  ])
})

test('문서 단계가 있어도 판정의 조상이 아니면 우회로 판정한다', () => {
  const steps = [
    { id: 'specification', capability: 'specification' },
    { id: 'documentation', capability: 'documentation', dependsOn: ['specification'] },
    { id: 'review', capability: 'review', dependsOn: ['specification'] },
  ]

  assert.deepEqual(findDocumentationBypass(steps, createWorkflowGraph(steps)), [
    { stepId: 'review', reason: 'not-ancestor' },
  ])
})

test('계약 고정 단계가 없는 흐름에는 문서 단계를 요구하지 않는다', () => {
  // review 전용 워크플로. 문서 영향을 판정할 주체가 흐름 안에 없다 (ADR-0005 결정 4).
  const steps = [
    { id: 'unit', capability: 'test-execution', variant: 'unit' },
    { id: 'review', capability: 'review', dependsOn: ['unit'] },
  ]

  assert.deepEqual(findDocumentationBypass(steps, createWorkflowGraph(steps)), [])
})

// ---------------------------------------------------------------- 프로파일 실행자 해석

test('실행자 집합은 capability id, variant, 프로파일 agent를 모두 담는다', () => {
  const runners = resolveRunners(CAPABILITIES, [{ id: 'design' }])

  assert.ok(runners.has('documentation'))
  assert.ok(runners.has('test-execution#unit'))
  assert.ok(runners.has('design'))
  assert.equal(runners.has('test-execution#ui'), false)
})

test('roster의 미등록 실행자를 검출한다', () => {
  const runners = resolveRunners(CAPABILITIES, [])
  const profile = {
    roster: [
      { unit: '문서 갱신', runner: 'documentation' },
      { unit: '토큰·시각 스펙', runner: 'design' },
    ],
  }

  assert.deepEqual(findUnresolvedRunners(profile, runners), [
    { field: 'roster', index: 1, name: 'design', label: '토큰·시각 스펙' },
  ])
})

test('routing owner가 실행자로 해석되지 않으면 검출한다', () => {
  const runners = resolveRunners(CAPABILITIES, [])
  const profile = {
    routing: [
      { symptom: '문서 누락', owner: 'documentation' },
      { symptom: '키보드·포커스', owner: 'accessibility' },
    ],
  }

  assert.deepEqual(findUnresolvedRunners(profile, runners), [
    { field: 'routing', index: 1, name: 'accessibility', label: '키보드·포커스' },
  ])
})

// ---------------------------------------------------------------- 삽입 겹침
// workflow "*"는 모든 워크플로를 대상으로 하므로 특정 워크플로 블록과 겹칠 수 있다.
// 삽입 하나씩 보는 검사는 이 겹침을 놓친다.

const WORKFLOWS = new Map([
  ['change', {}],
  ['bugfix', {}],
  ['review', {}],
])

test('서로 다른 워크플로에 같은 id를 넣는 것은 중복이 아니다', () => {
  const profile = {
    workflowExtensions: [
      { workflow: 'change', insert: [{ id: 'state-data', runner: 'state-data' }] },
      { workflow: 'bugfix', insert: [{ id: 'state-data', runner: 'state-data' }] },
    ],
  }

  assert.deepEqual(findDuplicateInserts(profile, WORKFLOWS), [])
})

test('"*"와 특정 워크플로가 같은 id를 넣으면 중복으로 판정한다', () => {
  const profile = {
    workflowExtensions: [
      { workflow: '*', insert: [{ id: 'state-data', runner: 'state-data' }] },
      { workflow: 'change', insert: [{ id: 'state-data', runner: 'state-data' }] },
    ],
  }

  assert.deepEqual(findDuplicateInserts(profile, WORKFLOWS), [
    { workflowId: 'change', insertId: 'state-data', count: 2 },
  ])
})

test('한 블록 안에서 같은 id를 두 번 넣어도 중복으로 판정한다', () => {
  const profile = {
    workflowExtensions: [
      {
        workflow: 'change',
        insert: [
          { id: 'design', runner: 'design' },
          { id: 'design', runner: 'design' },
        ],
      },
    ],
  }

  assert.deepEqual(findDuplicateInserts(profile, WORKFLOWS), [
    { workflowId: 'change', insertId: 'design', count: 2 },
  ])
})

test('같은 runner를 다른 id로 넣는 것은 막지 않는다', () => {
  const profile = {
    workflowExtensions: [
      {
        workflow: 'change',
        insert: [
          { id: 'a11y-early', runner: 'accessibility' },
          { id: 'a11y-final', runner: 'accessibility' },
        ],
      },
    ],
  }

  assert.deepEqual(findDuplicateInserts(profile, WORKFLOWS), [])
})
