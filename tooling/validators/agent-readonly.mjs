// readonly로 선언한 역할이 쓰기 도구를 들고 있지 않은지 본다.
//
// readonly는 capability.schema.json과 profile.schema.json 양쪽의 필드인데 아무도 읽지
// 않았다. 선언이 아무 일도 하지 않으면 선언이 아니라 주석이다.
//
// ADR-0007이 이 필드에 기대고 있다 — 마지막 green 뒤에 실행되는 역할이 코드를 고치면
// 그 수정을 검증할 단계가 뒤에 없다. 그 ADR은 "Write와 Edit가 빠졌으므로 파일을 쓸 수단이
// 없다"고 적었지만, 그것을 지키는 검사는 없었다.
//
// 한계: Bash는 여기서 잡지 못한다. 쓰기·삭제가 되는데 검증기의 도구-권한 매핑이
// filesystem:read로 분류한다. 그 분류를 어떻게 다룰지는 열려 있다 (#46).

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

// 전제: 스키마를 통과한 문서만 들어온다. validateFile이 스키마 검증에 실패한 문서에는
// 의미 검사를 돌리지 않고, 두 스키마 모두 agents의 원소를 id·file·tools·description이
// 있는 object로 요구한다. 원소가 null이면 여기 오기 전에 스키마에서 걸린다.

/** readonly:true인 역할이 든 쓰기 도구. 없으면 빈 배열. */
export function findReadonlyWriteTools(agents) {
  const violations = []
  for (const agent of agents ?? []) {
    if (agent.readonly !== true) continue
    for (const tool of agent.tools ?? []) {
      if (WRITE_TOOLS.has(tool)) violations.push({ agent: agent.id, tool })
    }
  }
  return violations
}
