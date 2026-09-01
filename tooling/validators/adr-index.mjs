// README의 결정 기록 표가 실제 ADR을 다 담는지 본다.
//
// 이 표는 손으로 옮겨 적는 목록이라 갈라진다. 실제로 갈라졌다 — ADR이 스물다섯인데
// 표는 열을 적고 있었다. 결정을 내리는 쪽과 표를 고치는 쪽이 같은 사람이어도 그렇다.
//
// 이 저장소는 같은 부류의 드리프트를 여러 번 고쳤다. policies/README.md의 강제 현황표
// (#66), 요구사항 슬롯 목록(ADR-0021), 플랫폼 투영 현황(#69). 목록을 두 곳에 적으면
// 한 곳은 낡는다.
//
// 파일 이름이 `NNNN-`로 시작하므로 번호만 뽑아 대조한다. 제목까지 보지 않는 이유는
// 표의 설명 문구가 파일 제목과 같을 필요가 없기 때문이다 — 표는 한 줄 요약이고 ADR은
// 본문을 갖는다.

const ADR_FILE = /^(\d{4})-/
const ADR_LINK = /docs\/adr\/(\d{4})-/g

/** `0011-logic-scaffold.md` → `0011` */
export function adrNumbers(fileNames) {
  return [...new Set((fileNames ?? []).map((n) => ADR_FILE.exec(n)?.[1]).filter(Boolean))].sort()
}

/**
 * 표에 없는 ADR과, 표에만 있고 파일이 없는 번호.
 *
 * 양방향으로 본다. 새 ADR이 표에 안 들어간 것이 지금 난 일이고, 파일을 지웠는데 표가
 * 남은 것은 죽은 링크가 된다.
 *
 * @returns {Array<{number: string, problem: 'not-in-index'|'no-file'}>}
 */
export function findAdrIndexDrift(markdown, fileNames) {
  const listed = new Set([...(markdown ?? '').matchAll(ADR_LINK)].map((m) => m[1]))
  const actual = new Set(adrNumbers(fileNames))

  return [
    ...[...actual].filter((n) => !listed.has(n)).map((number) => ({ number, problem: 'not-in-index' })),
    ...[...listed].filter((n) => !actual.has(n)).map((number) => ({ number, problem: 'no-file' })),
  ].sort((a, b) => a.number.localeCompare(b.number))
}
