import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTestingLayers, findTestLayerConflicts } from './profile-testing.mjs'
import { createWorkflowGraph } from './workflow-graph.mjs'
import { resolveRunners, findUnresolvedRunners, findDuplicateInserts } from './profile-roster.mjs'
import { findDocumentationBypass } from './documentation-gate.mjs'
import { findReadonlyWriteTools } from './agent-readonly.mjs'
import { findEvidenceWithoutArtifact } from './evidence-artifact.mjs'
import { commandsInScript, findChecksMissingFromCi } from './pipeline.mjs'
import { findForeignNamespaceTokens, insertTokens } from './profile-namespace.mjs'
import { findUndeclaredNestedRepos, submodulePathsFrom } from './nested-repo.mjs'
import { findWidenedHosts, findUnfilledAllowlist } from './network-scope.mjs'
import { adrNumbers, findAdrIndexDrift } from './adr-index.mjs'
import {
  CONVENTION_KEYS,
  declaredCommandKeys,
  findUnusedCommandKeys,
} from './command-keys.mjs'
import {
  normalize,
  classifyPack,
  extractVendoredBody,
  findDrift,
  parseFrontmatter,
} from '../vendoring/vendored-files.mjs'
import { findMissingMootBranches } from './workflow-red-proof.mjs'
import { findMissingScaffolds } from './workflow-scaffold.mjs'
import { findUnisolatedBackgroundAgents } from './background-isolation.mjs'
import { writesFilesystem, toolRequirement } from './tools.mjs'
import { findEscalationCycles, findDanglingEscalations } from './escalation.mjs'
import {
  findMissingAggregationInputs,
  findAggregationTableDrift,
  AGGREGATION_INPUTS,
} from './reliability-inputs.mjs'
import {
  findUnreachablePreconditions,
  findUnusedAssumes,
} from './workflow-return-path.mjs'
import {
  normalizeRequiredEvidence,
  findUndeclaredCompletionEvidence,
} from './completion-alternatives.mjs'
import {
  findUnofferedManualResults,
  findMissingManualBranches,
} from './manual-result.mjs'
import {
  VALIDATOR_REGISTRY,
  findUnknownValidators,
  findUnreferencedValidators,
  PROJECTION_REGISTRY,
  findUnknownProjections,
  findEnforcementTableDrift,
} from './policy-enforcement.mjs'
import {
  approvalRequiredVariants,
  findPermissionMismatches,
  findUndeclaredPlatforms,
  buildSettings,
  renderPermissionFile,
} from '../generators/permissions.mjs'
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
    // 덜 강제되는데 무엇이 남았는지 안 적으면 policies/README.md의 표가 거짓말을 한다.
    // 투영 레지스트리도 같은 규칙을 쓴다 — 두 축이 다른 모양이면 표를 읽는 사람이
    // 어느 쪽이 덜 강제되는지 가릴 수 없다.
    if (entry.status !== 'implemented') {
      assert.ok(entry.pending, `${name}: status가 "${entry.status}"인데 남은 것이 안 적혀 있다`)
    }
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

// ---------------------------------------------------------------- completion 대안
// 같은 것을 다른 방법으로 증명하는 증거가 생겼다 — 러너 결과와 수동 검증 결과.
// requiresEvidence가 AND 목록뿐이라 그 둘을 적을 수 없었다 (ADR-0013).

test('문자열 하나는 대안이 하나인 묶음으로 읽는다', () => {
  assert.deepEqual(normalizeRequiredEvidence(['changed-files']), [['changed-files']])
})

test('배열은 대안 묶음으로 읽는다', () => {
  assert.deepEqual(
    normalizeRequiredEvidence([['test.e2e.result', 'test.e2e.manual-result'], 'changed-files']),
    [['test.e2e.result', 'test.e2e.manual-result'], ['changed-files']],
  )
})

test('requiresEvidence가 없으면 빈 목록이다', () => {
  assert.deepEqual(normalizeRequiredEvidence(undefined), [])
})

// 선언하지 않은 경로를 대안으로 내놓을 수 없다. 묶음 안의 하나만 빠져도 그 경로는
// 실제로는 없는 것이고, 있는 것처럼 읽히면 completion이 느슨해 보인다.
test('묶음 안에 선언되지 않은 kind가 있으면 검출한다', () => {
  const found = findUndeclaredCompletionEvidence(
    [['test.e2e.result', 'test.e2e.manual-result']],
    new Set(['test.e2e.result']),
  )
  assert.deepEqual(found, [{ kind: 'test.e2e.manual-result' }])
})

test('묶음 안의 kind가 전부 선언돼 있으면 통과한다', () => {
  const found = findUndeclaredCompletionEvidence(
    [['test.e2e.result', 'test.e2e.manual-result'], ['changed-files']],
    new Set(['test.e2e.result', 'test.e2e.manual-result', 'changed-files']),
  )
  assert.deepEqual(found, [])
})

test('단일 항목도 같은 규칙으로 본다', () => {
  const found = findUndeclaredCompletionEvidence([['completeness-check']], new Set())
  assert.deepEqual(found, [{ kind: 'completeness-check' }])
})

// ---------------------------------------------------------------- manual-result 제공
// 어휘가 경로를 열었는데 선언이 그것을 내놓지 않으면 그 경로는 없는 것이다 (ADR-0013).
// moot 검사와 같은 모양이고, 붙는 자리만 다르다 — 저쪽은 워크플로 step, 이쪽은 선언.

const 결과어휘 = {
  'test.unit.result': {},
  'test.integration.result': {},
  'test.integration.manual-result': {},
  'test.e2e.result': {},
  'test.e2e.manual-result': {},
}

test('어휘에 manual-result가 있는데 변형이 안 내놓으면 검출한다', () => {
  const found = findUnofferedManualResults(
    [{ label: 'variant:e2e', evidence: [{ kind: 'test.e2e.result' }] }],
    결과어휘,
  )
  assert.deepEqual(found, [{ scope: 'variant:e2e', kind: 'test.e2e.manual-result' }])
})

test('둘 다 내놓으면 통과한다', () => {
  const found = findUnofferedManualResults(
    [
      {
        label: 'variant:e2e',
        evidence: [{ kind: 'test.e2e.result' }, { kind: 'test.e2e.manual-result' }],
      },
    ],
    결과어휘,
  )
  assert.deepEqual(found, [])
})

// unit·ui는 같은 프로세스 안에서 도므로 "러너를 둘 수 없다"가 성립하지 않는다.
// 어휘에 manual-result가 없고, 따라서 요구하지도 않는다.
test('어휘에 manual-result가 없는 계층은 대상이 아니다', () => {
  const found = findUnofferedManualResults(
    [{ label: 'variant:unit', evidence: [{ kind: 'test.unit.result' }] }],
    결과어휘,
  )
  assert.deepEqual(found, [])
})

test('결과 증거를 선언하지 않은 스코프는 대상이 아니다', () => {
  const found = findUnofferedManualResults(
    [{ label: 'capability', evidence: [{ kind: 'changed-files' }] }, { label: 'x' }],
    결과어휘,
  )
  assert.deepEqual(found, [])
  assert.deepEqual(findUnofferedManualResults(undefined, 결과어휘), [])
})

// ---------------------------------------------------------------- 계층 검증 수단
// 러너를 두거나 문서화된 수동 절차로 검증하거나 둘 중 하나다 (ADR-0013).

test('libraries와 manual이 함께 있으면 검출한다', () => {
  const found = findTestLayerConflicts(
    { e2e: { libraries: ['@playwright/test'], manual: { procedure: 'docs/e2e/*.md', reason: 'x' } } },
    {},
    'domain',
  )
  assert.deepEqual(found, [{ layer: 'e2e', problem: 'both-runner-and-manual' }])
})

// 러너가 있는데 수동으로 하겠다는 뜻이 된다. 어느 쪽이 진짜인지 알 수 없다.
test('manual인데 러너 명령이 있으면 검출한다', () => {
  const found = findTestLayerConflicts(
    { e2e: { manual: { procedure: 'docs/e2e/*.md', reason: 'x' } } },
    { 'test.e2e': { command: 'pnpm test:e2e' } },
    'repository',
  )
  assert.deepEqual(found, [{ layer: 'e2e', problem: 'manual-with-command' }])
})

// manual은 러너가 없는 것이 선언의 내용이다. 명령을 요구하면 선언 자체가 불가능해진다.
test('manual 계층에는 repository여도 명령을 요구하지 않는다', () => {
  const found = findTestLayerConflicts(
    { e2e: { manual: { procedure: 'docs/e2e/*.md', reason: 'x' } } },
    {},
    'repository',
  )
  assert.deepEqual(found, [])
})

test('러너 계층은 repository면 명령이 필요하다', () => {
  const 있음 = findTestLayerConflicts(
    { unit: { libraries: ['vitest'] } },
    { 'test.unit': { command: 'pnpm test:unit' } },
    'repository',
  )
  const 없음 = findTestLayerConflicts({ unit: { libraries: ['vitest'] } }, {}, 'repository')
  assert.deepEqual(있음, [])
  assert.deepEqual(없음, [{ layer: 'unit', problem: 'missing-command' }])
})

// domain 프로파일은 명령을 소유하지 않는다. 소비 저장소가 채운다.
test('domain 프로파일에는 명령을 요구하지 않는다', () => {
  const found = findTestLayerConflicts({ unit: { libraries: ['vitest'] } }, {}, 'domain')
  assert.deepEqual(found, [])
})

test('빈 입력은 대상이 아니다', () => {
  assert.deepEqual(findTestLayerConflicts(undefined, undefined, 'repository'), [])
})

// 선언이 경로를 내놓아도 워크플로가 그 분기를 안 두면 결과는 같다 — 그 계층은 러너
// 결과와 승인된 생략 둘뿐이 된다. review.yaml이 실제로 그 상태였다 (ADR-0013).

test('result를 조건으로 보는데 manual 분기가 없으면 검출한다', () => {
  const found = findMissingManualBranches(
    [
      {
        id: 'e2e',
        expectAnyOf: [
          { conditions: [{ evidence: 'test.integration.result', status: 'passed' }] },
          { conditions: [{ evidence: 'test.skip-justification', status: 'recorded' }] },
        ],
      },
    ],
    결과어휘,
  )
  assert.deepEqual(found, [{ step: 'e2e', kind: 'test.integration.manual-result' }])
})

test('manual 분기가 있으면 통과한다', () => {
  const found = findMissingManualBranches(
    [
      {
        id: 'e2e-design',
        expectAnyOf: [
          { conditions: [{ evidence: 'test.integration.result', status: 'passed' }] },
          { conditions: [{ evidence: 'test.integration.manual-result', status: 'passed' }] },
        ],
      },
    ],
    결과어휘,
  )
  assert.deepEqual(found, [])
})

// unit은 어휘에 manual-result가 없다. 분기를 요구하지 않는다.
test('어휘에 짝이 없는 계층은 대상이 아니다', () => {
  const found = findMissingManualBranches(
    [{ id: 'review', expect: [{ evidence: 'test.unit.result', status: 'passed' }] }],
    결과어휘,
  )
  assert.deepEqual(found, [])
})

// expect는 AND라 대안이 아예 없다. 분기를 두려면 expectAnyOf로 가야 한다.
test('expect로만 요구하면 대안이 없으므로 검출한다', () => {
  const found = findMissingManualBranches(
    [{ id: 'x', expect: [{ evidence: 'test.e2e.result', status: 'passed' }] }],
    결과어휘,
  )
  assert.deepEqual(found, [{ step: 'x', kind: 'test.e2e.manual-result' }])
})

test('result를 안 보는 단계와 빈 입력은 대상이 아니다', () => {
  assert.deepEqual(findMissingManualBranches([{ id: 'spec' }], 결과어휘), [])
  assert.deepEqual(findMissingManualBranches(undefined, 결과어휘), [])
})

// ---------------------------------------------------------------- 되돌림 목적지
// return-to-producer가 발동해도 그 producer가 흐름 안에 없으면 갈 곳이 없다 (#51 통제 3).
// FE 실행에서 실제로 났다 — producer가 선행 step이 아니라 "저장소 온보딩"이었다.

const 계약 = new Map([
  ['test-execution', {
    requires: [],
    variants: { unit: { requires: ['test-design.unit.suite'] } },
  }],
  ['specification', { requires: ['requirements.spec'] }],
])

test('요구 토큰을 아무도 생산하지 않으면 검출한다', () => {
  const steps = [
    { id: 'unit-design', capability: 'test-design', produces: ['test-design.unit.completed'] },
    { id: 'unit-red', capability: 'test-execution', variant: 'unit', dependsOn: ['unit-design'] },
  ]
  const found = findUnreachablePreconditions(steps, 계약)
  assert.deepEqual(found, [{ step: 'unit-red', token: 'test-design.unit.suite' }])
})

test('생산자가 있으면 통과한다', () => {
  const steps = [
    { id: 'unit-design', capability: 'test-design', produces: ['test-design.unit.suite'] },
    { id: 'unit-red', capability: 'test-execution', variant: 'unit', dependsOn: ['unit-design'] },
  ]
  assert.deepEqual(findUnreachablePreconditions(steps, 계약), [])
})

// 루트 requires도 함께 본다. 변형이 자기 것만 적어도 루트는 상속된다.
test('루트 requires의 생산자가 없어도 검출한다', () => {
  const steps = [{ id: 'spec', capability: 'specification' }]
  const found = findUnreachablePreconditions(steps, 계약)
  assert.deepEqual(found, [{ step: 'spec', token: 'requirements.spec' }])
})

// 조상인지 여부는 기존 검사가 본다. 여기는 "아예 없다"만 본다 — 있는데 순서가
// 틀린 것과 애초에 없는 것은 되돌림 관점에서 다른 사건이다.
test('생산자가 조상이 아니어도 존재하면 대상이 아니다', () => {
  const steps = [
    { id: 'unit-red', capability: 'test-execution', variant: 'unit' },
    { id: 'unit-design', capability: 'test-design', produces: ['test-design.unit.suite'] },
  ]
  assert.deepEqual(findUnreachablePreconditions(steps, 계약), [])
})

// review는 앞선 실행이 남긴 산출을 판정만 한다. 흐름 안에 생산자가 없는 것이 결함이
// 아니라 그 워크플로의 정의다. 선언은 면제가 아니라 되돌림이 흐름 밖으로 나간다는 표시다.
test('assumes에 선언된 토큰은 대상이 아니다', () => {
  const steps = [{ id: 'unit-red', capability: 'test-execution', variant: 'unit' }]
  assert.equal(findUnreachablePreconditions(steps, 계약).length, 1)
  assert.deepEqual(findUnreachablePreconditions(steps, 계약, ['test-design.unit.suite']), [])
})

test('assumes에 없는 토큰은 여전히 검출한다', () => {
  const steps = [{ id: 'spec', capability: 'specification' }]
  const found = findUnreachablePreconditions(steps, 계약, ['다른.토큰'])
  assert.deepEqual(found, [{ step: 'spec', token: 'requirements.spec' }])
})

test('모르는 capability와 빈 입력은 대상이 아니다', () => {
  assert.deepEqual(findUnreachablePreconditions([{ id: 'x', capability: '없음' }], 계약), [])
  assert.deepEqual(findUnreachablePreconditions(undefined, 계약), [])
})

// assumes는 흐름 밖 의존을 적어 두는 목록이다. 필요 없어진 항목이 남으면 그 흐름이
// 실제보다 많은 것을 가정하는 것처럼 읽힌다 (ADR-0014).

test('아무 step도 요구하지 않는 assumes를 검출한다', () => {
  const steps = [{ id: 'spec', capability: 'specification' }]
  const found = findUnusedAssumes(steps, 계약, ['requirements.spec', '아무도.안쓰는것'])
  assert.deepEqual(found, [{ token: '아무도.안쓰는것', reason: 'unrequired' }])
})

// 나중에 흐름 안에 생산자가 생겼는데 목록이 남은 경우가 더 나쁘다 — 되돌림이 흐름
// 안으로 갈 수 있는데도 밖으로 나간다고 적혀 있게 된다.
test('흐름이 스스로 생산하는 assumes를 검출한다', () => {
  const steps = [
    { id: 'req', capability: 'x', produces: ['requirements.spec'] },
    { id: 'spec', capability: 'specification' },
  ]
  const found = findUnusedAssumes(steps, 계약, ['requirements.spec'])
  assert.deepEqual(found, [{ token: 'requirements.spec', reason: 'produced-in-flow' }])
})

test('필요하고 흐름 밖인 assumes는 통과한다', () => {
  const steps = [{ id: 'spec', capability: 'specification' }]
  assert.deepEqual(findUnusedAssumes(steps, 계약, ['requirements.spec']), [])
  assert.deepEqual(findUnusedAssumes(steps, 계약), [])
})

// ---------------------------------------------------------------- 승인 투영
// 승인 선언을 플랫폼 permission 런타임으로 옮긴다. 무엇이 승인 대상인지는
// capability.yaml이 정하고 표는 명령 패턴만 안다 (ADR-0015).

const 승인표 = {
  unprojected: { codex: '승인 정책을 파일로 받는 자리를 아직 정하지 않았다' },
  approvalRequired: { 'git-operations#push': { claude: ['Bash(git push:*)'] } },
  neverAllowed: { 'file-deletion': { why: '파일 삭제', claude: ['Bash(rm -rf:*)'] } },
}

const Codex승인표 = {
  approvalRequired: { 'git-operations#push': { codex: [['git', 'push']] } },
  neverAllowed: { 'file-deletion': { why: '파일 삭제', codex: [['rm', '-rf']] } },
}

const 선언 = new Map([
  ['git-operations', { variants: { push: { requiresApproval: true }, commit: {} } }],
  ['review', {}],
])

test('requiresApproval인 변형만 모은다', () => {
  assert.deepEqual(approvalRequiredVariants(선언), ['git-operations#push'])
})

// 변형이 없는 capability는 루트가 직접 선언한다.
test('변형 없는 capability의 루트 선언도 본다', () => {
  const found = approvalRequiredVariants(new Map([['x', { requiresApproval: true }]]))
  assert.deepEqual(found, ['x'])
})

// 승인을 요구하는데 그 플랫폼의 패턴이 없으면 선언이 그 런타임에 도달하지 않는다.
test('투영되지 않은 승인 선언을 검출한다', () => {
  const found = findPermissionMismatches(선언, { approvalRequired: {} }, 'claude')
  assert.deepEqual(found, [{ key: 'git-operations#push', problem: 'unprojected' }])
})

// 하네스는 한 플랫폼의 것이 아니다. claude에만 패턴이 있으면 codex 쪽은 비어 있다.
test('플랫폼마다 따로 본다', () => {
  assert.deepEqual(findPermissionMismatches(선언, 승인표, 'claude'), [])
  assert.deepEqual(findPermissionMismatches(선언, 승인표, 'codex'), [
    { key: 'git-operations#push', problem: 'unprojected' },
  ])
})

test('Codex 패턴을 지우면 그 플랫폼의 미투영으로 판정한다', () => {
  assert.deepEqual(findPermissionMismatches(선언, Codex승인표, 'codex'), [])
  assert.deepEqual(
    findPermissionMismatches(
      선언,
      { approvalRequired: { 'git-operations#push': { codex: [] } } },
      'codex',
    ),
    [{ key: 'git-operations#push', problem: 'unprojected' }],
  )
})

// 표가 오래된 경우. 변형을 지웠는데 패턴이 남으면 없는 것을 막고 있는 셈이다.
test('선언에 없는 표 항목을 검출한다', () => {
  const found = findPermissionMismatches(
    선언,
    { approvalRequired: { 'git-operations#push': { claude: ['x'] }, '없어진#변형': { claude: ['y'] } } },
    'claude',
  )
  assert.deepEqual(found, [{ key: '없어진#변형', problem: 'orphan' }])
})

test('ask는 승인 선언에서, deny는 표에서 온다', () => {
  assert.deepEqual(buildSettings(선언, 승인표, 'claude'), {
    permissions: { ask: ['Bash(git push:*)'], deny: ['Bash(rm -rf:*)'] },
  })
})

test('Codex 명령 토큰을 Starlark prefix_rule로 렌더링한다', () => {
  const settings = buildSettings(선언, Codex승인표, 'codex')
  assert.equal(
    renderPermissionFile('codex-rules', settings),
    `# 이 파일은 생성물이다. tooling/generators/permissions.json을 고치고 npm run generate를 실행한다.\n\n` +
      `prefix_rule(\n` +
      `    pattern = ["git", "push"],\n` +
      `    decision = "prompt",\n` +
      `    justification = "capability.yaml의 requiresApproval 선언에서 생성됨",\n` +
      `)\n\n` +
      `prefix_rule(\n` +
      `    pattern = ["rm", "-rf"],\n` +
      `    decision = "forbidden",\n` +
      `    justification = "permissions.json의 neverAllowed 선언에서 생성됨",\n` +
      `)\n`,
  )
})

test('모르는 permission 형식은 생성하지 않는다', () => {
  assert.throws(
    () => renderPermissionFile('없는-형식', { permissions: { ask: [], deny: [] } }),
    /permissionFormat "없는-형식"에 렌더러가 없다/,
  )
})

// 투영하지 않는 플랫폼은 빈 설정이 아니라 아무것도 내지 않는다. 빈 permissions를
// 내면 "아무것도 막지 않기로 했다"로 읽힌다.
test('패턴이 없는 플랫폼은 빈 목록이 된다', () => {
  assert.deepEqual(buildSettings(선언, 승인표, 'codex'), {
    permissions: { ask: [], deny: [] },
  })
})

// 단일 출처는 선언이다. 표에 있어도 선언이 승인을 요구하지 않으면 ask에 안 들어간다.
test('선언이 승인을 요구하지 않으면 패턴이 있어도 ask에 안 들어간다', () => {
  const settings = buildSettings(
    new Map([['git-operations', { variants: { push: {} } }]]),
    승인표,
    'claude',
  )
  assert.deepEqual(settings.permissions.ask, [])
})

// 투영하지 않는 것 자체는 정당할 수 있다. 조용한 것이 문제다 — 사유가 없으면 그
// 플랫폼에서 승인이 강제되지 않는다는 사실을 아무도 모른다.
test('투영도 안 하고 사유도 없는 플랫폼을 검출한다', () => {
  const platforms = {
    $comment: '무시된다',
    claude: { enabled: true, permissionFile: 'settings.json' },
    codex: { enabled: true },
    사유있음: { enabled: true },
    꺼진것: { enabled: false },
  }
  const table = { unprojected: { 사유있음: '아직 자리를 안 정했다' } }
  assert.deepEqual(findUndeclaredPlatforms(platforms, table), ['codex'])
})

// 변형 둘이 같은 패턴을 요구하면 목록에 두 번 들어간다. 생성물이 그대로 두면 무엇이
// 왜 있는지 읽기 어렵고 드리프트 비교도 흔들린다.
test('같은 패턴을 여러 변형이 요구해도 한 번만 낸다', () => {
  const 선언둘 = new Map([
    ['git-operations', { variants: { push: { requiresApproval: true }, sync: { requiresApproval: true } } }],
  ])
  const 표 = {
    approvalRequired: {
      'git-operations#push': { claude: ['Bash(git push:*)'] },
      'git-operations#sync': { claude: ['Bash(git push:*)'] },
    },
  }
  assert.deepEqual(buildSettings(선언둘, 표, 'claude').permissions.ask, ['Bash(git push:*)'])
})

// 빈 배열은 "패턴을 적었다"가 아니다. 문자열 하나를 배열 대신 적은 것도 마찬가지다 —
// 둘 다 그 플랫폼에는 투영이 없는 상태다.
test('빈 배열이나 배열 아닌 값은 투영으로 보지 않는다', () => {
  const 빈것 = { approvalRequired: { 'git-operations#push': { claude: [] } } }
  const 문자열 = { approvalRequired: { 'git-operations#push': { claude: 'Bash(git push:*)' } } }
  assert.deepEqual(findPermissionMismatches(선언, 빈것, 'claude'), [
    { key: 'git-operations#push', problem: 'unprojected' },
  ])
  assert.deepEqual(findPermissionMismatches(선언, 문자열, 'claude'), [
    { key: 'git-operations#push', problem: 'unprojected' },
  ])
  assert.deepEqual(buildSettings(선언, 문자열, 'claude').permissions.ask, [])
})

test('빈 입력은 대상이 아니다', () => {
  assert.deepEqual(findUndeclaredPlatforms(undefined, undefined), [])
  assert.deepEqual(approvalRequiredVariants(undefined), [])
})

// ---------------------------------------------------------------- 투영 레지스트리
// ADR-0015가 검증기도 훅도 아닌 강제 수단을 하나 만들었다. 그대로 두면 강제 현황표가
// 실제로 도는 강제를 빠뜨린다 — #50이 고친 것과 같은 종류의 드리프트다.

test('정책 선언이 없는 레지스트리 항목을 검출한다', () => {
  const found = findUnknownProjections([{ id: 'destructive-approval' }], {
    'destructive-approval': {},
    '없어진-정책': {},
  })
  assert.deepEqual(found, ['없어진-정책'])
})

// 반대 방향은 보지 않는다. 대부분의 정책은 투영 대상이 아니고 투영이 없는 것이 정상이다.
test('투영이 없는 정책은 대상이 아니다', () => {
  const found = findUnknownProjections(
    [{ id: 'destructive-approval' }, { id: 'secrets-redaction' }],
    { 'destructive-approval': {} },
  )
  assert.deepEqual(found, [])
})

test('실제 레지스트리의 모든 항목에 근거와 출처가 있다', () => {
  const 허용 = new Set(['implemented', 'partial', 'pending'])
  for (const [id, entry] of Object.entries(PROJECTION_REGISTRY)) {
    assert.ok(허용.has(entry.status), `${id}: 알 수 없는 status "${entry.status}"`)
    assert.ok(entry.by, `${id}: 무엇이 강제하는지 by에 적어야 한다`)
    assert.ok(entry.source, `${id}: 어느 파일이 소유하는지 source에 적어야 한다`)
  }
})

// 덜 강제되는데 무엇이 남았는지 안 적으면 표가 "이 정책이 강제된다"로 읽힌다.
// 검증기 레지스트리도 같은 규칙을 쓴다 (위 "status가 있다").
test('전부 강제하지 못하는 항목은 무엇이 남았는지 적는다', () => {
  for (const [id, entry] of Object.entries(PROJECTION_REGISTRY)) {
    if (entry.status === 'implemented') continue
    assert.ok(entry.pending, `${id}: status가 "${entry.status}"인데 남은 것이 안 적혀 있다`)
  }
})

// 이 표는 세 번 갈라졌다 (#49 · #50 · 이 변경). 단일 출처를 레지스트리로 정해 뒀지만
// 표를 손으로 옮겨 적는 한 네 번째가 난다.

const 레지스트리 = { 'tools-within-permissions': {}, 'network-within-allowlist': {} }

test('레지스트리에 있는데 표에 안 적힌 검증기를 검출한다', () => {
  const md = '| a | b | validator `tools-within-permissions` ✅ |'
  assert.deepEqual(findEnforcementTableDrift(md, 레지스트리), [
    { name: 'network-within-allowlist', problem: 'not-in-table' },
  ])
})

test('표에 있는데 레지스트리에 없는 이름을 검출한다', () => {
  const md = [
    '| a | b | validator `tools-within-permissions` ✅ |',
    '| a | b | validator `network-within-allowlist` ✅ |',
    '| a | b | validator `sensitive-data-blocked` ✅ |',
  ].join('\n')
  assert.deepEqual(findEnforcementTableDrift(md, 레지스트리), [
    { name: 'sensitive-data-blocked', problem: 'not-in-registry' },
  ])
})

// 검증기 id는 policy.schema.json이 소문자 kebab으로 고정한다. 그 밖의 표기는 검증기
// 참조로 보지 않는다 — 실제 이름이 될 수 없기 때문이다. 다만 오타가 그 형태를 벗어나면
// "표에 없다"로 잡히지 "이상한 이름이 있다"로 잡히지 않는다. 어느 쪽이든 실패한다.
test('소문자 kebab이 아닌 표기는 검증기 참조로 보지 않는다', () => {
  const md = [
    '| a | b | validator `tools-within-permissions` ✅ |',
    '| a | b | validator `Network-Within-Allowlist` ✅ |',
  ].join('\n')
  assert.deepEqual(findEnforcementTableDrift(md, 레지스트리), [
    { name: 'network-within-allowlist', problem: 'not-in-table' },
  ])
})

test('양쪽이 맞으면 통과한다', () => {
  const md = [
    '| a | b | validator `tools-within-permissions` ✅ |',
    '| a | b | validator `network-within-allowlist` 🟡 + 플랫폼 투영 🛡️ |',
  ].join('\n')
  assert.deepEqual(findEnforcementTableDrift(md, 레지스트리), [])
})

test('빈 입력은 레지스트리 전체를 미기재로 본다', () => {
  assert.deepEqual(
    findEnforcementTableDrift(undefined, 레지스트리).map((d) => d.problem),
    ['not-in-table', 'not-in-table'],
  )
})

// ---------------------------------------------------------------- 벤더링 드리프트
// ADR-0008이 바이트 일치를 요구하는데 대조 도구가 없었다. 두 번 어겼고 둘 다 사람이
// 우연히 잡았다 (#33 · ADR-0016).

test('CRLF와 파일 끝 개행만 고른다', () => {
  assert.equal(normalize('a\r\nb\n\n\n'), 'a\nb\n')
  assert.equal(normalize('a'), 'a\n')
  assert.equal(normalize(undefined), '\n')
})

// 그 밖에는 아무것도 하지 않는다. 공백을 다듬으면 상류의 공백 변경을 못 본다.
test('그 밖의 공백은 건드리지 않는다', () => {
  assert.equal(normalize('a  \n\n  b'), 'a  \n\n  b\n')
})

test('source가 없으면 우리 것으로 본다', () => {
  assert.equal(classifyPack(undefined), 'own')
  assert.equal(classifyPack({ author: 'x' }), 'own')
})

// 마커 유무가 아니라 선언으로 가른다. 마커로 가르면 마커를 지우는 것만으로
// "우리가 새로 쓴 파일"이 되어 검사를 빠져나간다.
test('본문을 다시 썼다는 선언이 있어야 대조를 면한다', () => {
  assert.equal(classifyPack({ source: 'u' }), 'vendored')
  assert.equal(classifyPack({ source: 'u', vendored: 'body-rewritten' }), 'body-rewritten')
})

test('마커 사이 본문을 앞뒤 개행 없이 떼어낸다', () => {
  const md = ['머리말', '<!-- vendored:begin -->', '', '# 상류', '본문', '', '<!-- vendored:end -->', '꼬리말'].join('\n')
  assert.equal(extractVendoredBody(md).body, '# 상류\n본문')
})

test('마커가 없거나 순서가 뒤집히거나 여러 번이면 사유를 낸다', () => {
  assert.equal(extractVendoredBody('마커 없음').problem, 'missing-marker')
  assert.equal(
    extractVendoredBody('<!-- vendored:end -->\nx\n<!-- vendored:begin -->').problem,
    'marker-out-of-order',
  )
  assert.equal(
    extractVendoredBody(
      ['<!-- vendored:begin -->', 'a', '<!-- vendored:end -->', '<!-- vendored:begin -->', 'b', '<!-- vendored:end -->'].join('\n'),
    ).problem,
    'marker-repeated',
  )
})

test('내용이 기록과 다르면 검출한다', () => {
  assert.deepEqual(findDrift({ 'a.md': 'x' }, { 'a.md': 'y' }), [{ path: 'a.md', problem: 'changed' }])
  assert.deepEqual(findDrift({ 'a.md': 'x' }, { 'a.md': 'x' }), [])
})

// 한쪽만 보면 지우거나 더해서 빠져나갈 수 있다.
test('파일이 사라진 것도 기록에 없는 것도 검출한다', () => {
  const found = findDrift({ 'b.md': 'x' }, { 'a.md': 'x' })
  assert.deepEqual(found, [
    { path: 'a.md', problem: 'missing' },
    { path: 'b.md', problem: 'unrecorded' },
  ])
})

// ---------------------------------------------------------------- check와 CI
// 둘은 서로 다른 파일에 있는 같은 목록이다. 벤더링 검사를 만들면서 check에는 넣고
// CI에는 안 넣었다 — 손으로 찾았고, 못 찾았으면 그 검사는 병합을 막지 못했을 것이다.

test('&& 사슬을 명령 목록으로 가른다', () => {
  assert.deepEqual(commandsInScript('npm run a && npm run b'), ['npm run a', 'npm run b'])
  assert.deepEqual(commandsInScript(undefined), [])
})

test('check에 있는데 CI에 없는 명령을 검출한다', () => {
  const found = findChecksMissingFromCi('npm run a && npm run b', ['npm run a'])
  assert.deepEqual(found, ['npm run b'])
})

// CI에 더 있는 것은 정상이다. npm ci 같은 준비 단계도, 로컬에서 돌릴 일이 없는
// 전체 재생성 대조도 CI에만 있어야 한다. 위험한 쪽은 반대다.
test('CI에만 있는 명령은 대상이 아니다', () => {
  const found = findChecksMissingFromCi('npm run a', ['npm ci', 'npm run a', 'rm -rf .claude'])
  assert.deepEqual(found, [])
})

// CRLF frontmatter를 못 읽으면 그 팩이 "우리 것"으로 분류돼 대조에서 통째로 빠진다.
// 기존 팩은 기록에 남아 "파일이 없다"로 걸리지만, 새 팩을 CRLF로 넣으면 기록에
// 들어가지도 않는다 — 조용한 우회다.

test('CRLF frontmatter도 읽는다', () => {
  const lf = '---\nname: x\nmetadata:\n  source: https://u\n---\n\n본문\n'
  assert.equal(classifyPack(parseFrontmatter(lf).data?.metadata), 'vendored')
  assert.equal(classifyPack(parseFrontmatter(lf.replace(/\n/g, '\r\n')).data?.metadata), 'vendored')
})

// 읽을 수 없는 것을 "없는 것"으로 흘려보내면 CRLF 말고 다른 이유로 못 읽는 경우도
// 같은 자리로 새어 나간다. 사유를 내고 호출부가 실패로 다룬다.
test('frontmatter가 없거나 깨지면 사유를 낸다', () => {
  assert.ok(parseFrontmatter('frontmatter 없음').problem)
  assert.ok(parseFrontmatter('---\na: 1\na: 2\n---\n').problem)
  assert.ok(parseFrontmatter(undefined).problem)
})

test('빈 frontmatter는 빈 객체로 읽는다', () => {
  const parsed = parseFrontmatter('---\n\n---\n본문')
  assert.deepEqual(parsed.data, {})
  assert.equal(classifyPack(parsed.data?.metadata), 'own')
})

// CI step 하나가 여러 줄이거나 &&로 이어질 수 있다. 통째로 대조하면 오탐이 난다.
test('CI의 멀티라인·체인 step도 명령 단위로 가른다', () => {
  const found = findChecksMissingFromCi('npm run a && npm run b', [
    'npm ci',
    'npm run a && npm run b',
  ])
  assert.deepEqual(found, [])
})

test('여러 줄 run에 섞여 있어도 찾는다', () => {
  const found = findChecksMissingFromCi('npm run a', ['echo x\nnpm run a\necho y'])
  assert.deepEqual(found, [])
})

// ---------------------------------------------------------------- 네임스페이스 소유권
// ADR-0001이 프로파일마다 네임스페이스를 준 이유는 중앙 등록 없이 자기 토큰을 만들게
// 하기 위해서다. 남의 접두사를 쓰면 그 프로파일을 떼어냈을 때 없는 것을 가리킨다.

test('자기 것이 아닌 네임스페이스를 검출한다', () => {
  const found = findForeignNamespaceTokens(['backend:x.y', 'frontend:a.b'], 'frontend')
  assert.deepEqual(found, [{ token: 'backend:x.y', namespace: 'backend' }])
})

// 코어 토큰은 프로파일을 떼어내도 남는 것이라 대상이 아니다.
test('접두사 없는 코어 토큰은 대상이 아니다', () => {
  assert.deepEqual(findForeignNamespaceTokens(['changed-files', 'review-findings'], 'frontend'), [])
  assert.deepEqual(findForeignNamespaceTokens(undefined, 'frontend'), [])
})

// 계약 필드가 늘면 이 함수도 늘어야 한다. 하나라도 빠지면 그 자리로 남의
// 네임스페이스가 새어 들어온다.
test('삽입 단계의 네 자리에서 토큰을 모은다', () => {
  const tokens = insertTokens({
    produces: ['frontend:a.b'],
    evidence: [{ kind: 'changed-files' }, { kind: 'frontend:c.d' }],
    completion: { requiresEvidence: ['changed-files'] },
    skippable: { evidenceOnSkip: 'frontend:e.f' },
  })
  assert.deepEqual(tokens, [
    'frontend:a.b',
    'changed-files',
    'frontend:c.d',
    'changed-files',
    'frontend:e.f',
  ])
})

test('계약 필드가 비어도 터지지 않는다', () => {
  assert.deepEqual(insertTokens({}), [])
  assert.deepEqual(insertTokens(undefined), [])
})

// ---------------------------------------------------------------- 중첩 저장소
// 소비 저장소를 하네스 안에 두면 그 디렉터리가 worktree에 존재하지 않아
// isolation: worktree가 아무것도 격리하지 못한다 (ADR-0020).

test('선언되지 않은 중첩 저장소를 검출한다', () => {
  const found = findUndeclaredNestedRepos(['FE', 'vendor/lib'], ['vendor/lib'])
  assert.deepEqual(found, ['FE'])
})

// submodule은 선언된 중첩이라 하네스가 아는 상태다.
test('submodule로 선언된 것은 대상이 아니다', () => {
  assert.deepEqual(findUndeclaredNestedRepos(['vendor/lib'], ['vendor/lib']), [])
  assert.deepEqual(findUndeclaredNestedRepos([], []), [])
  assert.deepEqual(findUndeclaredNestedRepos(undefined, undefined), [])
})

test('.gitmodules에서 path만 뽑는다', () => {
  const text = [
    '[submodule "lib"]',
    '\tpath = vendor/lib',
    '\turl = https://example.com/lib.git',
    '[submodule "other"]',
    '  path   =   tools/other  ',
  ].join('\n')
  assert.deepEqual(submodulePathsFrom(text), ['vendor/lib', 'tools/other'])
  assert.deepEqual(submodulePathsFrom(undefined), [])
})

// ---------------------------------------------------------------- 네트워크 범위
// 정책이 "등재된 호스트로만 나갈 수 있다"와 "프로파일은 좁힐 수만 있다"를 적어 뒀는데
// 둘 다 아무도 읽지 않았다. networkAllowlist는 선언돼 있고 검증기가 값을 본 적이 없다
// (ADR-0024).

test('프로파일이 코어 밖 호스트를 더하면 검출한다', () => {
  const found = findWidenedHosts(['github.com'], ['github.com', 'evil.example.com'])
  assert.deepEqual(found, ['evil.example.com'])
})

test('좁히는 것은 통과한다', () => {
  assert.deepEqual(findWidenedHosts(['github.com', 'npmjs.org'], ['github.com']), [])
  assert.deepEqual(findWidenedHosts(['github.com'], []), [])
})

// 코어 목록이 비면 아직 정해지지 않은 것이다. 그때 프로파일이 처음 정하는 것을
// "넓힘"으로 보면 아무도 호스트를 정할 수 없게 된다.
test('코어가 비어 있으면 넓힘을 판정하지 않는다', () => {
  assert.deepEqual(findWidenedHosts([], ['github.com']), [])
  assert.deepEqual(findWidenedHosts(undefined, ['github.com']), [])
})

// 호스트는 저장소의 사실이다. 공용 하네스와 domain 프로파일은 비어 있는 것이 정상이고,
// 실제로 도는 저장소에서만 채워져야 한다 — commands.test.<layer>와 같은 이유다.
test('repository 프로파일의 빈 allowlist를 검출한다', () => {
  const perms = { network: 'allowlist', networkAllowlist: [] }
  assert.equal(findUnfilledAllowlist(perms, 'repository'), true)
  assert.equal(findUnfilledAllowlist(perms, 'domain'), false)
})

test('allowlist가 아니면 대상이 아니다', () => {
  assert.equal(findUnfilledAllowlist({ network: 'none' }, 'repository'), false)
  assert.equal(findUnfilledAllowlist({ network: 'allowlist', networkAllowlist: ['x'] }, 'repository'), false)
  assert.equal(findUnfilledAllowlist(undefined, 'repository'), false)
})

// ---------------------------------------------------------------- 명령 키
// commands는 임의 키를 받고 commandKey가 그것을 찾는다. 한쪽에 오타가 나면
// 선언한 명령은 아무도 안 부르고 부르는 쪽은 없는 키를 찾는다 — 둘 다 조용하다
// (ADR-0026).

const 능력 = new Map([
  ['test-execution', { variants: { unit: { commandKey: 'test.unit' }, ui: { commandKey: 'test.ui' } } }],
  ['review', {}],
])

test('변형이 선언한 commandKey를 모은다', () => {
  assert.deepEqual(declaredCommandKeys(능력), ['test.ui', 'test.unit'])
  assert.deepEqual(declaredCommandKeys(undefined), [])
})

test('오타 난 명령 키를 검출한다', () => {
  const found = findUnusedCommandKeys({ 'test.unit': {}, 'test.unti': {} }, declaredCommandKeys(능력))
  assert.deepEqual(found, ['test.unti'])
})

// 규약 키는 어느 변형도 가리키지 않지만 하네스가 뜻을 안다. 오타와 가르려면
// 아는 이름을 적어 둬야 한다.
test('규약 키는 대상이 아니다', () => {
  assert.deepEqual(findUnusedCommandKeys({ preflight: {} }, declaredCommandKeys(능력)), [])
  assert.ok(CONVENTION_KEYS.includes('preflight'))
})

// 반대 방향은 보지 않는다. 러너 없이 수동으로 검증하는 계층은 명령이 없는 것이
// 정상이고(ADR-0013), 그 판정은 findTestLayerConflicts가 계층별로 한다.
test('선언되지 않은 commandKey는 여기서 보지 않는다', () => {
  assert.deepEqual(findUnusedCommandKeys({ 'test.unit': {} }, declaredCommandKeys(능력)), [])
})

test('빈 입력은 대상이 아니다', () => {
  assert.deepEqual(findUnusedCommandKeys(undefined, undefined), [])
  assert.deepEqual(findUnusedCommandKeys({}, ['test.unit']), [])
})

// ---------------------------------------------------------------- 결정 기록 표
// README의 ADR 표는 손으로 옮겨 적는 목록이다. 실제로 갈라졌다 — ADR이 스물다섯인데
// 표는 열을 적고 있었다. 같은 부류를 이 저장소가 여러 번 고쳤다 (#66 · #69 · ADR-0021).

test('파일 이름에서 번호만 뽑는다', () => {
  assert.deepEqual(adrNumbers(['0011-a.md', '0002-b.md', 'README.md']), ['0002', '0011'])
  assert.deepEqual(adrNumbers(undefined), [])
})

test('표에 없는 ADR을 검출한다', () => {
  const md = '## 결정 기록\n[ADR-0001](docs/adr/0001-a.md)'
  assert.deepEqual(findAdrIndexDrift(md, ['0001-a.md', '0002-b.md']), [
    { number: '0002', problem: 'not-in-index' },
  ])
})

// 문서 전체를 보면 본문의 링크가 표의 누락을 가린다. README는 설명 중에 특정 ADR을
// 링크하므로, 표에서 그 줄을 지워도 본문 링크가 남아 검사가 통과한다.
test('본문 링크는 표를 대신하지 못한다', () => {
  const md = ['본문에서 [ADR-0002](docs/adr/0002-b.md)를 설명한다.', '', '## 결정 기록', '[ADR-0001](docs/adr/0001-a.md)'].join('\n')
  assert.deepEqual(findAdrIndexDrift(md, ['0001-a.md', '0002-b.md']), [
    { number: '0002', problem: 'not-in-index' },
  ])
})

// 다음 `## `까지만 자른다. 끝까지 자르면 뒤에 절이 붙는 순간 같은 구멍이 다시 생긴다.
test('결정 기록 절 뒤의 링크도 표가 아니다', () => {
  const md = ['## 결정 기록', '[ADR-0001](docs/adr/0001-a.md)', '', '## 그다음', '[ADR-0002](docs/adr/0002-b.md)'].join('\n')
  assert.deepEqual(findAdrIndexDrift(md, ['0001-a.md', '0002-b.md']), [
    { number: '0002', problem: 'not-in-index' },
  ])
})

// 표가 통째로 사라진 것도 드리프트다.
test('결정 기록 절이 없으면 전부 누락으로 본다', () => {
  const found = findAdrIndexDrift('# 제목뿐', ['0001-a.md'])
  assert.deepEqual(found, [{ number: '0001', problem: 'not-in-index' }])
})

// 파일을 지웠는데 표가 남으면 죽은 링크가 된다.
test('파일이 없는 표 항목을 검출한다', () => {
  const found = findAdrIndexDrift('## 결정 기록\n[ADR-0009](docs/adr/0009-x.md)', ['0001-a.md'])
  assert.deepEqual(found, [
    { number: '0001', problem: 'not-in-index' },
    { number: '0009', problem: 'no-file' },
  ])
})

// 표의 설명 문구는 ADR 제목과 같을 필요가 없다. 번호만 본다.
test('설명이 달라도 번호가 맞으면 통과한다', () => {
  const md = '## 결정 기록\n| [ADR-0011](docs/adr/0011-logic-scaffold.md) | 전혀 다른 한 줄 요약 |'
  assert.deepEqual(findAdrIndexDrift(md, ['0011-logic-scaffold.md']), [])
})

// ── 백그라운드 격리 (ADR-0028 · #84) ───────────────────────────────────────
//
// 규칙은 선언에서 나왔다. background: true가 둘이고 isolation: worktree도 정확히
// 그 둘이다. 짝은 맞는데 강제가 없었다.

const 역할 = (over = {}) => ({
  id: 'implementation',
  tools: ['Read', 'Grep', 'Bash', 'Write', 'Edit'],
  background: true,
  isolation: 'worktree',
  ...over,
})
const 맵 = (...agents) => new Map([['implementation', { entrypoints: { agents } }]])

test('백그라운드인데 격리 없이 쓰면 검출한다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(맵(역할({ isolation: 'none' }))),
    [{ capability: 'implementation', agent: 'implementation' }])
})

test('isolation을 아예 안 적어도 none으로 본다', () => {
  const { isolation, ...격리없음 } = 역할()
  assert.deepEqual(findUnisolatedBackgroundAgents(맵(격리없음)),
    [{ capability: 'implementation', agent: 'implementation' }])
})

test('백그라운드이고 격리했으면 통과한다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(맵(역할())), [])
})

// 같은 트리를 봐도 고치지 않으면 부딪히지 않는다.
test('백그라운드여도 읽기만 하면 대상이 아니다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(
    맵(역할({ isolation: 'none', tools: ['Read', 'Grep', 'Glob'] }))), [])
})

// Bash는 tools.mjs가 read로 분류한다. write로 세면 거의 모든 역할이 쓰기 역할이 되고
// 규칙이 "백그라운드면 무조건 격리"가 된다.
test('Bash만 있으면 쓰기로 세지 않는다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(
    맵(역할({ isolation: 'none', tools: ['Read', 'Bash'] }))), [])
})

// 쓰기 도구 목록을 이 검사가 따로 갖고 있었고 NotebookEdit이 빠져 있었다 (#88 리뷰).
// 이제 tools.mjs가 단일 출처다.
test('NotebookEdit도 쓰기로 센다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(
    맵(역할({ isolation: 'none', tools: ['Read', 'NotebookEdit'] }))),
    [{ capability: 'implementation', agent: 'implementation' }])
})

// 모르는 도구 하나가 역할 전체를 쓰기로 만들면 안 된다.
test('모르는 도구는 쓰기로 세지 않는다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(
    맵(역할({ isolation: 'none', tools: ['Read', 'Unknown'] }))), [])
})

test('쓰기 도구 표가 권한 대조와 같은 출처다', () => {
  assert.equal(writesFilesystem('Write'), true)
  assert.equal(writesFilesystem('Edit'), true)
  assert.equal(writesFilesystem('NotebookEdit'), true)
  assert.equal(writesFilesystem('Bash'), false)
  assert.equal(writesFilesystem('mcp__x__y'), false)
  assert.equal(toolRequirement('mcp__x__y').filesystem, 'read')
  assert.equal(toolRequirement('Unknown'), null)
})

test('포그라운드는 격리 없이 써도 대상이 아니다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(
    맵(역할({ background: false, isolation: 'none' }))), [])
})

test('역할이 없어도 터지지 않는다', () => {
  assert.deepEqual(findUnisolatedBackgroundAgents(new Map([['x', {}]])), [])
  assert.deepEqual(findUnisolatedBackgroundAgents(undefined), [])
})

// ── 에스컬레이션 종료 (ADR-0029 · #85) ─────────────────────────────────────
//
// 재시도는 스키마가 묶는다 — maxAttempts가 maximum: 3이고 action이 분류마다
// const다. 에스컬레이션에는 그런 것이 없어서 사슬이 돌 수 있다.

const 넘김 = (to) => ({ failure: { 'contract-violation': { action: 'escalate', escalateTo: to } } })
const 사슬 = (entries) => new Map(entries.map(([id, to]) => [id, 넘김(to)]))

test('에스컬레이션 사슬이 orchestrator에서 끝나면 통과한다', () => {
  const capabilities = 사슬([
    ['implementation', 'specification'],
    ['specification', 'requirements'],
    ['requirements', 'orchestrator'],
  ])
  assert.deepEqual(findEscalationCycles(capabilities), [])
  assert.deepEqual(findDanglingEscalations(capabilities), [])
})

test('사슬이 돌면 검출한다', () => {
  assert.deepEqual(
    findEscalationCycles(사슬([['a', 'b'], ['b', 'c'], ['c', 'a']])),
    [{ cycle: ['a', 'b', 'c'] }],
  )
})

test('자기 자신을 가리켜도 순환이다', () => {
  assert.deepEqual(findEscalationCycles(사슬([['a', 'a']])), [{ cycle: ['a'] }])
})

// 시작점이 셋이어도 순환은 하나다. 시작점마다 보고하면 같은 것을 세 번 말한다.
test('같은 순환을 시작점마다 보고하지 않는다', () => {
  assert.equal(findEscalationCycles(사슬([['a', 'b'], ['b', 'c'], ['c', 'a']])).length, 1)
})

test('순환에 닿는 사슬이 있어도 순환만 보고한다', () => {
  assert.deepEqual(
    findEscalationCycles(사슬([['entry', 'a'], ['a', 'b'], ['b', 'a']])),
    [{ cycle: ['a', 'b'] }],
  )
})

test('escalateTo가 없으면 orchestrator로 본다', () => {
  assert.deepEqual(findEscalationCycles(new Map([['a', {}]])), [])
  assert.deepEqual(findDanglingEscalations(new Map([['a', {}]])), [])
})

// 스키마가 action을 const로 막지만 이 검사는 스키마 검증과 독립적으로 돈다.
// 스키마 실패한 문서도 여기 들어오므로 action을 직접 본다 (#89 리뷰).
test('action이 escalate가 아니면 escalateTo를 따라가지 않는다', () => {
  const capabilities = new Map([
    ['a', { failure: { 'contract-violation': { action: 'halt', escalateTo: 'b' } } }],
    ['b', 넘김('a')],
  ])
  assert.deepEqual(findEscalationCycles(capabilities), [])
  assert.deepEqual(findDanglingEscalations(capabilities), [])
})

test('action이 escalate가 아니면 없는 대상도 보고하지 않는다', () => {
  assert.deepEqual(
    findDanglingEscalations(new Map([
      ['a', { failure: { 'contract-violation': { action: 'halt', escalateTo: 'ghost' } } }],
    ])),
    [],
  )
})

test('없는 Capability를 가리키면 검출한다', () => {
  assert.deepEqual(
    findDanglingEscalations(사슬([['a', 'ghost']])),
    [{ capability: 'a', escalateTo: 'ghost' }],
  )
})

// 없는 대상은 순환이 아니다. 두 검사가 나눠 갖고 겹치지 않는다.
test('없는 대상을 순환으로 세지 않는다', () => {
  assert.deepEqual(findEscalationCycles(사슬([['a', 'ghost']])), [])
})

test('capability가 없어도 터지지 않는다', () => {
  assert.deepEqual(findEscalationCycles(undefined), [])
  assert.deepEqual(findDanglingEscalations(undefined), [])
})

// ── 집계 입력 (ADR-0030 · #83) ────────────────────────────────────────────
//
// 집계는 읽는 쪽이 만들지만(ADR-0023 결정 2) 필요한 사실이 기록에 있어야 만든다.
// 필드를 지우면 그 지표를 영영 못 만든다.

test('필요한 필드가 다 있으면 통과한다', () => {
  const schema = { properties: { runId: {}, outcome: {} } }
  assert.deepEqual(
    findMissingAggregationInputs(schema, [
      { field: 'runId', metric: 'x' },
      { field: 'outcome', metric: 'y' },
    ]),
    [],
  )
})

test('없는 필드를 이유와 함께 낸다', () => {
  assert.deepEqual(
    findMissingAggregationInputs({ properties: { runId: {} } }, [
      { field: 'runId', metric: 'x' },
      { field: 'workflow', metric: '종류를 못 가른다' },
    ]),
    [{ field: 'workflow', metric: '종류를 못 가른다' }],
  )
})

test('스키마가 비어도 터지지 않는다', () => {
  assert.deepEqual(findMissingAggregationInputs(undefined, [{ field: 'a', metric: 'z' }]),
    [{ field: 'a', metric: 'z' }])
  assert.deepEqual(findMissingAggregationInputs({ properties: {} }, undefined), [])
})

// 목록에 이름만 있고 이유가 없으면 실패 메시지가 무엇을 잃는지 말하지 못한다.
test('AGGREGATION_INPUTS의 모든 항목이 이유를 갖는다', () => {
  for (const entry of AGGREGATION_INPUTS) {
    assert.ok(entry.field, '필드 이름이 없다')
    assert.ok(entry.metric?.length > 0, `${entry.field}에 이유가 없다`)
  }
})

// 표와 목록은 두 곳에 적힌 같은 것이다. 실제로 갈렸다 — 표에 event·capability·variant가
// 있는데 목록에는 없었다 (#90 리뷰).

const 표 = (rows) => `## 조사\n\n| 지표 | 필요한 입력 |\n|---|---|\n${rows}\n\n## 결정 1\n`

test('표와 목록이 같으면 통과한다', () => {
  const drift = findAggregationTableDrift(표('| a | `runId` · `outcome` |'), [
    { field: 'runId' },
    { field: 'outcome' },
  ])
  assert.deepEqual(drift, { onlyInTable: [], onlyInList: [] })
})

test('표에만 있으면 검출한다', () => {
  const drift = findAggregationTableDrift(표('| a | `runId` · `policy` |'), [{ field: 'runId' }])
  assert.deepEqual(drift.onlyInTable, ['policy'])
})

test('목록에만 있으면 검출한다', () => {
  const drift = findAggregationTableDrift(표('| a | `runId` |'), [
    { field: 'runId' },
    { field: 'variant' },
  ])
  assert.deepEqual(drift.onlyInList, ['variant'])
})

// 본문이 표의 누락을 가리면 안 된다. adr-index.mjs가 같은 구멍을 실제로 겪었다.
test('절 밖의 산문은 표로 세지 않는다', () => {
  const md = '## 조사\n\n| a | `runId` |\n\n## 결정 1\n\n`variant`를 산문에서 언급한다.\n'
  const drift = findAggregationTableDrift(md, [{ field: 'runId' }, { field: 'variant' }])
  assert.deepEqual(drift.onlyInList, ['variant'])
})

test('실제 ADR-0030과 실제 목록이 일치한다', async () => {
  const { readFileSync } = await import('node:fs')
  const md = readFileSync(new URL('../../docs/adr/0030-reliability-inputs.md', import.meta.url), 'utf8')
  assert.deepEqual(findAggregationTableDrift(md, AGGREGATION_INPUTS), {
    onlyInTable: [],
    onlyInList: [],
  })
})

