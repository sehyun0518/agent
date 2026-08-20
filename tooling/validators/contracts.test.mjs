import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTestingLayers } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'

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
