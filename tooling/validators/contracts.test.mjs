import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTestingLayers } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'
import { resolveRunners, findUnresolvedRunners, findDuplicateInserts } from './profile-roster.mjs'
import { findDocumentationBypass } from './documentation-gate.mjs'
import { findReadonlyWriteTools } from './agent-readonly.mjs'
import { findEvidenceWithoutArtifact } from './evidence-artifact.mjs'
import { findMissingMootBranches } from './workflow-red-proof.mjs'
import { findMissingScaffolds } from './workflow-scaffold.mjs'
import {
  VALIDATOR_REGISTRY,
  findUnknownValidators,
  findUnreferencedValidators,
} from './policy-enforcement.mjs'
import {
  commandsFromCapabilities,
  commandsFromProfile,
  commandsFromWorkflows,
  findDuplicateCommands,
  insertionsForWorkflow,
} from '../generators/commands.mjs'

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

// ---------------------------------------------------------------- 커맨드 유도
// 중앙 목록 없이 계약에서 유도한다. 목록을 두면 새 변형을 넣으면서 안 고쳤을 때
// 조용히 빠진다.

test('autoTriggerable이 false인 Capability의 변형만 커맨드가 된다', () => {
  const caps = new Map([
    ['git-operations', {
      chaining: { autoTriggerable: false },
      variants: { inspect: { title: '상태 확인', description: '읽기 전용' }, commit: { title: '커밋' } },
    }],
    ['implementation', {
      chaining: { autoInvoke: false },   // autoTriggerable 선언 없음 = 자동 가능
      variants: { logic: {}, ui: {} },
    }],
  ])

  assert.deepEqual(commandsFromCapabilities(caps).map((c) => c.name), ['git-inspect', 'git-commit'])
})

test('변형이 없는 Capability는 커맨드를 내지 않는다', () => {
  const caps = new Map([['review', { chaining: { autoTriggerable: false } }]])
  assert.deepEqual(commandsFromCapabilities(caps), [])
})

test('워크플로에 삽입되지 않은 프로파일 역할만 커맨드가 된다', () => {
  const profile = {
    agents: [
      { id: 'design', description: '토큰' },
      { id: 'project-design-inspect', description: '조사' },
    ],
    workflowExtensions: [{ workflow: '*', insert: [{ id: 'design', runner: 'design' }] }],
  }

  assert.deepEqual(commandsFromProfile(profile).map((c) => c.name), ['project-inspect'])
})

test('삽입 선언이 아예 없으면 모든 역할이 커맨드가 된다', () => {
  const profile = { agents: [{ id: 'project-design-decide', description: '결정' }] }
  assert.deepEqual(commandsFromProfile(profile).map((c) => c.name), ['project-decide'])
})

test('이름이 겹치면 출처와 함께 검출한다', () => {
  const dupes = findDuplicateCommands([
    { name: 'git-commit', kind: 'variant', capability: 'git-operations', variant: 'commit' },
    { name: 'git-commit', kind: 'agent', runner: 'git-commit' },
  ])

  assert.deepEqual(dupes, [{ name: 'git-commit', sources: ['git-operations#commit', 'git-commit'] }])
})

test('워크플로는 그 자체가 커맨드가 된다', () => {
  const commands = commandsFromWorkflows([
    { id: 'change', title: '계층별 TDD 변경 작업', description: '설명', steps: [{}, {}, {}] },
    { id: 'review', title: '검토 전용', steps: [{}] },
  ])

  assert.deepEqual(commands.map((c) => [c.name, c.stepCount]), [['change', 3], ['review', 1]])
  assert.equal(commands[0].kind, 'workflow')
})

test('단계가 없는 워크플로도 커맨드가 되고 개수는 0이다', () => {
  assert.deepEqual(commandsFromWorkflows([{ id: 'empty' }]).map((c) => c.stepCount), [0])
})

test('워크플로와 변형이 같은 이름이면 출처와 함께 검출한다', () => {
  const dupes = findDuplicateCommands([
    { name: 'review', kind: 'workflow', workflow: 'review' },
    { name: 'review', kind: 'variant', capability: 'review', variant: 'main' },
  ])

  assert.deepEqual(dupes, [
    { name: 'review', sources: ['workflows/review.yaml', 'review#main'] },
  ])
})

// ---------------------------------------------------------------- readonly 역할
// ADR-0007이 이 필드에 기대는데 아무도 읽지 않고 있었다.

test('readonly 역할이 쓰기 도구를 들면 검출한다', () => {
  const found = findReadonlyWriteTools([
    { id: 'accessibility', readonly: true, tools: ['Read', 'Edit'] },
  ])
  assert.deepEqual(found, [{ agent: 'accessibility', tool: 'Edit' }])
})

test('readonly 역할이 읽기 도구만 들면 통과한다', () => {
  const found = findReadonlyWriteTools([
    { id: 'review', readonly: true, tools: ['Read', 'Grep', 'Glob'] },
  ])
  assert.deepEqual(found, [])
})

test('readonly가 아닌 역할은 쓰기 도구를 들어도 대상이 아니다', () => {
  const found = findReadonlyWriteTools([{ id: 'implementation', tools: ['Write', 'Edit'] }])
  assert.deepEqual(found, [])
})

test('Write·Edit·NotebookEdit를 모두 검출한다', () => {
  const found = findReadonlyWriteTools([
    { id: 'a', readonly: true, tools: ['Write', 'Edit', 'NotebookEdit', 'Read'] },
  ])
  assert.deepEqual(
    found.map((v) => v.tool),
    ['Write', 'Edit', 'NotebookEdit'],
  )
})

// 알려진 구멍을 케이스로 박아 둔다. Bash는 쓰기·삭제가 되는데 검증기의 도구-권한
// 매핑이 filesystem:read로 분류한다. 이 케이스가 초록인 동안 readonly는 Bash를 막지
// 못한다. #46이 Bash 분류를 정하면 이 케이스가 먼저 빨개진다.
test('Bash는 readonly 검사가 잡지 못한다 — 알려진 한계 (#46)', () => {
  const found = findReadonlyWriteTools([{ id: 'review', readonly: true, tools: ['Bash'] }])
  assert.deepEqual(found, [])
})

test('tools가 없어도 터지지 않는다', () => {
  assert.deepEqual(findReadonlyWriteTools([{ id: 'discussion', readonly: true }]), [])
  assert.deepEqual(findReadonlyWriteTools(undefined), [])
})

// ---------------------------------------------------------------- 정책 강제 수단
// 정책이 이름으로 지정한 검사가 실재하는지. 연결이 주석뿐이면 양방향으로 어긋난다.

test('레지스트리에 등록된 검증기를 가리키는 정책은 통과한다', () => {
  const found = findUnknownValidators([
    { id: 'filesystem-boundary', validator: 'tools-within-permissions' },
  ])
  assert.deepEqual(found, [])
})

test('레지스트리에 없는 검증기 이름을 검출한다', () => {
  const found = findUnknownValidators([{ id: 'filesystem-boundary', validator: '오타난-이름' }])
  assert.deepEqual(found, [{ policy: 'filesystem-boundary', validator: '오타난-이름' }])
})

test('validator 없이 훅만 선언한 정책은 대상이 아니다', () => {
  const found = findUnknownValidators([
    { id: 'secrets-redaction', validator: undefined },
    { id: 'sensitive-data-storage' },
  ])
  assert.deepEqual(found, [])
})

// 구현 상태와 등록 여부는 다른 축이다. partial·pending도 이름은 실재하므로 통과한다.
// 무엇이 아직 강제되지 않는지는 레지스트리의 status가 말한다.
test('partial 상태의 검증기도 등록된 것으로 본다', () => {
  const registry = { 'x': { status: 'partial' }, 'y': { status: 'pending' } }
  assert.deepEqual(
    findUnknownValidators([{ id: 'p', validator: 'x' }, { id: 'q', validator: 'y' }], registry),
    [],
  )
})

test('어떤 정책도 가리키지 않는 검증기를 검출한다', () => {
  const registry = { '쓰이는-검사': {}, '고아-검사': {} }
  const found = findUnreferencedValidators([{ id: 'p', validator: '쓰이는-검사' }], registry)
  assert.deepEqual(found, ['고아-검사'])
})

test('레지스트리의 모든 항목에 status가 있다', () => {
  const 허용 = new Set(['implemented', 'partial', 'pending'])
  for (const [name, entry] of Object.entries(VALIDATOR_REGISTRY)) {
    assert.ok(허용.has(entry.status), `${name}: 알 수 없는 status "${entry.status}"`)
    assert.ok(entry.by, `${name}: 어느 검사인지 by에 적어야 한다`)
  }
})

// ---------------------------------------------------------------- 증거의 원본 경로
// 컨텍스트는 작업 공간이지 데이터베이스가 아니다. status와 summary만 남는 증거는
// 세션과 함께 사라진다 (#45).

test('코어 증거가 artifactRequired 없이 선언되면 검출한다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'variant:push', evidence: [{ kind: 'approval-record', required: true }] },
  ])
  assert.deepEqual(found, [{ scope: 'variant:push', kind: 'approval-record' }])
})

test('artifactRequired가 true면 통과한다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'capability', evidence: [{ kind: 'changed-files', artifactRequired: true }] },
  ])
  assert.deepEqual(found, [])
})

// required와 artifactRequired는 다른 축이다. 선택 증거라도 남긴다면 재현 가능해야 한다.
// test.skip-justification이 정확히 이 자리에 있었다 — required:false인데 status가
// "recorded" 하나뿐이라 경로가 없으면 아무것도 남지 않는다.
test('required가 false여도 artifactRequired는 면제되지 않는다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'variant:e2e', evidence: [{ kind: 'test.skip-justification', required: false }] },
  ])
  assert.deepEqual(found, [{ scope: 'variant:e2e', kind: 'test.skip-justification' }])
})

// artifactRequired: false는 기본값과 같지만 "생각해 보고 껐다"는 뜻이 될 수 있다.
// 그 예외를 허용하면 규칙이 사라지므로 명시적 false도 똑같이 걸린다.
test('artifactRequired를 명시적으로 false로 적어도 걸린다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'capability', evidence: [{ kind: 'review-findings', artifactRequired: false }] },
  ])
  assert.deepEqual(found, [{ scope: 'capability', kind: 'review-findings' }])
})

// 코어는 프로파일 증거의 status를 규정하지 않는다. 경로 요구도 같은 경계를 따른다.
test('프로파일 네임스페이스 증거는 대상이 아니다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'capability', evidence: [{ kind: 'frontend:a11y.axe-result' }] },
  ])
  assert.deepEqual(found, [])
})

test('여러 스코프의 위반을 스코프와 함께 모아서 돌려준다', () => {
  const found = findEvidenceWithoutArtifact([
    { label: 'capability', evidence: [{ kind: 'completeness-check' }] },
    { label: 'variant:ui', evidence: [{ kind: 'test.ui.result', artifactRequired: true }] },
    { label: 'variant:e2e', evidence: [{ kind: 'policy-decision' }] },
  ])
  assert.deepEqual(found, [
    { scope: 'capability', kind: 'completeness-check' },
    { scope: 'variant:e2e', kind: 'policy-decision' },
  ])
})

test('evidence가 없어도 터지지 않는다', () => {
  assert.deepEqual(findEvidenceWithoutArtifact([{ label: 'capability' }]), [])
  assert.deepEqual(findEvidenceWithoutArtifact(undefined), [])
})

// ---------------------------------------------------------------- 프로파일 삽입
// 순서의 단일 출처는 워크플로이고 삽입 지점은 프로파일이 소유한다. 그 분리 때문에
// 워크플로 파일만 읽는 실행자에게 도메인 단계의 존재가 전달되지 않았다 (#52).

const 프로파일 = [
  {
    id: 'frontend',
    workflowExtensions: [
      {
        workflow: '*',
        insert: [
          { id: 'design', runner: 'design', anchorCapability: 'specification' },
          { id: 'accessibility', runner: 'accessibility', anchorCapability: 'documentation' },
        ],
      },
      {
        workflow: 'change',
        insert: [
          {
            id: 'state-data',
            runner: 'state-data',
            anchorCapability: 'implementation',
            anchorStep: 'logic',
          },
        ],
      },
    ],
  },
]

test('"*" 삽입과 해당 워크플로 삽입을 함께 모은다', () => {
  const found = insertionsForWorkflow(
    {
      id: 'change',
      steps: [
        { id: 'specification', capability: 'specification' },
        { id: 'logic', capability: 'implementation', variant: 'logic' },
        { id: 'documentation', capability: 'documentation' },
      ],
    },
    프로파일,
  )
  assert.deepEqual(
    found.map((i) => i.id),
    ['design', 'accessibility', 'state-data'],
  )
  assert.equal(found[0].profile, 'frontend')
})

// 프로파일이 스스로 적어 둔 것 — "review 전용 흐름에는 계약 고정 단계가 없으므로 이
// 삽입은 건너뛰어진다". 그 문장이 실제로 성립하는지 여기서 고정한다.
test('앵커 capability가 없는 흐름에서는 "*" 삽입도 빠진다', () => {
  const found = insertionsForWorkflow(
    { id: 'review', steps: [{ id: 'review', capability: 'review' }] },
    프로파일,
  )
  assert.deepEqual(found, [])
})

test('다른 워크플로 전용 삽입은 넘어오지 않는다', () => {
  const found = insertionsForWorkflow(
    {
      id: 'bugfix',
      steps: [
        { id: 'specification', capability: 'specification' },
        { id: 'logic-fix', capability: 'implementation', variant: 'logic' },
      ],
    },
    프로파일,
  )
  assert.deepEqual(
    found.map((i) => i.id),
    ['design'],
  )
})

// anchorStep이 있으면 capability만 같아서는 안 된다. bugfix의 로직 단계는 id가
// logic-fix라 change용 state-data 삽입의 앵커가 되지 못한다.
test('anchorStep이 있으면 step id까지 맞아야 한다', () => {
  const ext = [
    {
      id: 'state-data',
      runner: 'state-data',
      anchorCapability: 'implementation',
      anchorStep: 'logic',
    },
  ]
  const profiles = [{ id: 'p', workflowExtensions: [{ workflow: '*', insert: ext }] }]
  const 맞음 = insertionsForWorkflow(
    { id: 'w', steps: [{ id: 'logic', capability: 'implementation' }] },
    profiles,
  )
  const 틀림 = insertionsForWorkflow(
    { id: 'w', steps: [{ id: 'logic-fix', capability: 'implementation' }] },
    profiles,
  )
  assert.equal(맞음.length, 1)
  assert.deepEqual(틀림, [])
})

// YAML은 값 없는 키를 null로 파싱한다. undefined만 보면 그 선언이 어떤 step과도 맞지
// 않아 삽입이 커맨드에서 통째로 사라진다 — 이 모듈이 막으려는 실패와 같은 모양이다.
test('anchorStep이 값 없는 키로 들어와도 삽입이 사라지지 않는다', () => {
  const profiles = [
    {
      id: 'p',
      workflowExtensions: [
        {
          workflow: '*',
          insert: [
            { id: 'state-data', runner: 'state-data', anchorCapability: 'implementation', anchorStep: null },
          ],
        },
      ],
    },
  ]
  const found = insertionsForWorkflow(
    { id: 'change', steps: [{ id: 'logic', capability: 'implementation' }] },
    profiles,
  )
  assert.deepEqual(
    found.map((i) => i.id),
    ['state-data'],
  )
})

test('프로파일이 없으면 삽입도 없다', () => {
  const w = { id: 'change', steps: [{ id: 'specification', capability: 'specification' }] }
  assert.deepEqual(insertionsForWorkflow(w, []), [])
  assert.deepEqual(insertionsForWorkflow(w, undefined), [])
})

// 커맨드 본문이 "단계 N개다"라고 적는 근거가 여기다. 삽입을 세지 않으면 그 문장이
// 흐름이 N에서 완결됐다고 읽히게 만든다.
test('워크플로 커맨드가 삽입 수를 함께 낸다', () => {
  const [command] = commandsFromWorkflows(
    [
      {
        id: 'change',
        steps: [
          { id: 'specification', capability: 'specification' },
          { id: 'documentation', capability: 'documentation' },
        ],
      },
    ],
    프로파일,
  )
  assert.equal(command.stepCount, 2)
  assert.deepEqual(
    command.insertions.map((i) => i.id),
    ['design', 'accessibility'],
  )
})

// ---------------------------------------------------------------- moot 분기
// ADR-0012가 integration·e2e에 moot을 열었는데, 그 분기를 지워도 아무것도 빨개지지
// 않았다 (#51). 허용되지 않는 계층에 moot을 쓰는 것은 어휘 검사가 이미 잡는다 —
// 없는 쪽만 이 검사가 본다.

const 어휘 = {
  'test.unit.red-proof': { statuses: ['confirmed', 'rejected'] },
  'test.ui.red-proof': { statuses: ['confirmed', 'rejected'] },
  'test.integration.red-proof': { statuses: ['confirmed', 'rejected', 'moot'] },
  'test.e2e.red-proof': { statuses: ['confirmed', 'rejected', 'moot'] },
}

test('moot이 허용된 계층인데 분기가 없으면 검출한다', () => {
  const found = findMissingMootBranches(
    [
      {
        id: 'integration-implementation',
        expectAnyOf: [
          { conditions: [{ evidence: 'test.integration.red-proof', status: 'confirmed' }] },
          { conditions: [{ evidence: 'test.skip-justification', status: 'recorded' }] },
        ],
      },
    ],
    어휘,
  )
  assert.deepEqual(found, [
    { step: 'integration-implementation', evidence: 'test.integration.red-proof' },
  ])
})

test('moot 분기가 있으면 통과한다', () => {
  const found = findMissingMootBranches(
    [
      {
        id: 'e2e-fix',
        expectAnyOf: [
          { conditions: [{ evidence: 'test.e2e.red-proof', status: 'confirmed' }] },
          { conditions: [{ evidence: 'test.e2e.red-proof', status: 'moot' }] },
        ],
      },
    ],
    어휘,
  )
  assert.deepEqual(found, [])
})

// unit·ui는 앞의 스캐폴드가 동작을 비우므로 red가 반드시 관찰된다. moot이 없는 것이
// 정상이다 (ADR-0012). 이 케이스가 빨개지면 두 ADR의 대칭이 깨진 것이다.
test('moot이 허용되지 않는 계층은 분기가 없어도 대상이 아니다', () => {
  const found = findMissingMootBranches(
    [
      { id: 'logic-fix', expect: [{ evidence: 'test.unit.red-proof', status: 'confirmed' }] },
      {
        id: 'ui-implementation',
        expectAnyOf: [{ conditions: [{ evidence: 'test.ui.red-proof', status: 'confirmed' }] }],
      },
    ],
    어휘,
  )
  assert.deepEqual(found, [])
})

// expectAnyOf를 통째로 expect로 바꿔 분기를 없애는 우회도 같은 자리에서 걸린다.
test('expect로 바꿔 분기를 없애도 검출한다', () => {
  const found = findMissingMootBranches(
    [{ id: 'e2e-implementation', expect: [{ evidence: 'test.e2e.red-proof', status: 'confirmed' }] }],
    어휘,
  )
  assert.deepEqual(found, [{ step: 'e2e-implementation', evidence: 'test.e2e.red-proof' }])
})

// 어휘가 단일 출처다. 계층 목록을 검사기에 박아두지 않는다 — vocabulary.json에서
// moot을 빼면 그 계층은 자동으로 대상에서 빠진다.
test('어휘에서 moot을 빼면 그 계층은 요구하지 않는다', () => {
  const 좁힌어휘 = { 'test.integration.red-proof': { statuses: ['confirmed', 'rejected'] } }
  const steps = [
    {
      id: 'integration-implementation',
      expectAnyOf: [{ conditions: [{ evidence: 'test.integration.red-proof', status: 'confirmed' }] }],
    },
  ]
  assert.equal(findMissingMootBranches(steps, 어휘).length, 1)
  assert.deepEqual(findMissingMootBranches(steps, 좁힌어휘), [])
})

test('red-proof를 안 보는 단계와 빈 입력은 대상이 아니다', () => {
  const found = findMissingMootBranches(
    [
      { id: 'specification' },
      { id: 'unit-design', expect: [{ evidence: 'contract-diff', status: 'recorded' }] },
    ],
    어휘,
  )
  assert.deepEqual(found, [])
  assert.deepEqual(findMissingMootBranches(undefined, 어휘), [])
})

// ---------------------------------------------------------------- 스캐폴드 단계
// ADR-0011이 만든 단계를 지워도 아무것도 빨개지지 않았다 (#51 통제 1). 규칙은
// 변형 이름에서 나온다 — logic ↔ logic-scaffold, ui ↔ ui-scaffold.

const 구현 = {
  implementation: {
    variants: {
      'logic-scaffold': { produces: ['implementation.logic-scaffold.completed'] },
      logic: { produces: ['implementation.logic.completed'] },
      'ui-scaffold': { produces: ['implementation.ui-scaffold.completed'] },
      ui: { produces: ['implementation.ui.completed'] },
      integration: { produces: ['implementation.integration.completed'] },
    },
  },
}

function 그래프(steps) {
  return createWorkflowGraph(steps)
}

test('스캐폴드 변형이 선언됐는데 워크플로가 안 쓰면 검출한다', () => {
  const steps = [
    { id: 'specification' },
    { id: 'unit-design', dependsOn: ['specification'] },
    { id: 'logic-fix', capability: 'implementation', variant: 'logic', dependsOn: ['unit-design'] },
  ]
  const found = findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현)))
  assert.deepEqual(found, [{ step: 'logic-fix', scaffold: 'logic-scaffold' }])
})

test('스캐폴드 단계가 조상에 있으면 통과한다', () => {
  const steps = [
    {
      id: 'logic-scaffold',
      capability: 'implementation',
      variant: 'logic-scaffold',
      produces: ['implementation.logic-scaffold.completed'],
    },
    { id: 'unit-design', dependsOn: ['logic-scaffold'] },
    { id: 'logic', capability: 'implementation', variant: 'logic', dependsOn: ['unit-design'] },
  ]
  const found = findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현)))
  assert.deepEqual(found, [])
})

// 존재하는 것으로는 부족하다. 조상이 아니면 red 앞에 온다는 보장이 없다.
test('스캐폴드 단계가 있어도 조상이 아니면 검출한다', () => {
  const steps = [
    {
      id: 'ui-scaffold',
      capability: 'implementation',
      variant: 'ui-scaffold',
      produces: ['implementation.ui-scaffold.completed'],
    },
    { id: 'ui-design' },
    { id: 'ui-implementation', capability: 'implementation', variant: 'ui', dependsOn: ['ui-design'] },
  ]
  const found = findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현)))
  assert.deepEqual(found, [{ step: 'ui-implementation', scaffold: 'ui-scaffold' }])
})

// integration·e2e에는 비울 스캐폴드가 없다. moot이 그 자리를 대신한다 (ADR-0012).
test('스캐폴드 변형이 선언되지 않은 계층은 대상이 아니다', () => {
  const steps = [
    { id: 'integration-implementation', capability: 'implementation', variant: 'integration' },
  ]
  const found = findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현)))
  assert.deepEqual(found, [])
})

// 스캐폴드 단계 자신은 자기를 요구하지 않는다. logic-scaffold-scaffold는 없다.
test('스캐폴드 단계 자신은 대상이 아니다', () => {
  const steps = [
    { id: 'logic-scaffold', capability: 'implementation', variant: 'logic-scaffold' },
  ]
  const found = findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현)))
  assert.deepEqual(found, [])
})

test('다른 capability의 단계와 빈 입력은 대상이 아니다', () => {
  const steps = [{ id: 'review', capability: 'review' }, { id: 'x' }]
  assert.deepEqual(findMissingScaffolds(steps, 그래프(steps), new Map(Object.entries(구현))), [])
  assert.deepEqual(findMissingScaffolds(undefined, 그래프([]), new Map()), [])
})
