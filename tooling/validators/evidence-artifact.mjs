// 코어 증거는 원본 경로 없이 남길 수 없다.
//
// 모델은 세션마다 잊는다. 증거가 status와 summary 한 줄로만 남으면 그 증거는 세션과
// 함께 사라진다. 다음 세션은 무엇이 red였는지 몰라 처음부터 다시 하거나, 더 나쁘게는
// "아까 봤다"고 기억한다고 착각한 채 게이트를 통과시킨다. 증거 기반 판정이 상태 기반
// 판정으로 조용히 퇴화한다 (#45).
//
// `artifactRequired`는 스키마에 있었지만 기본값이 false였고 어느 kind가 이것을 켜야
// 하는지 정한 것이 없었다. 그래서 켠 곳과 안 켠 곳이 갈렸는데, 안 켠 쪽이 하필
// `approval-record`·`policy-decision`·`completeness-check`, 즉 status만으로는 아무것도
// 재구성할 수 없는 것들이었다. `approval-record: granted`는 누가 무엇을 언제 승인했는지
// 말하지 않는다.
//
// 경계 1: 프로파일 네임스페이스 증거(`frontend:` 등)는 대상이 아니다. 코어가 프로파일
// 증거의 status를 규정하지 않는 것과 같은 이유다 — 프로파일이 자기 증거를 소유한다.
//
// 경계 2: artifact가 필요 없다고 판단되는 것은 증거가 아니라 신호다. 어휘가 둘을 이미
// 갈라 두었다 (`docs/vocabulary.md` §1·§3) — 신호는 있음/없음이고, 증거는 재현
// 가능해야 한다. 새 증거에 예외를 두고 싶어지면 그것이 신호가 아닌지 먼저 본다.
//
// 한계: 이 검사는 선언이 경로를 *요구하는지*만 본다. 실행 시점에 그 경로에 실제로
// 파일이 생겼는지는 증거를 기록하는 주체가 없어서 아무도 보지 않는다. 게다가
// `.harness/`는 gitignore 대상이라 남더라도 한 머신 안에 갇힌다. 둘 다 #45에 열려 있다.

// 전제: 스키마를 통과한 문서만 들어온다. capability.schema.json이 evidence 원소를
// `kind`가 있는 object로 요구하고, validateFile은 스키마 검증에 실패한 문서에
// 의미 검사를 돌리지 않는다.

/** 코어 증거인데 artifactRequired가 켜져 있지 않은 선언. 없으면 빈 배열. */
export function findEvidenceWithoutArtifact(scopes) {
  const violations = []
  for (const { label, evidence } of scopes ?? []) {
    for (const item of evidence ?? []) {
      if (item.kind.includes(':')) continue
      if (item.artifactRequired === true) continue
      violations.push({ scope: label, kind: item.kind })
    }
  }
  return violations
}
