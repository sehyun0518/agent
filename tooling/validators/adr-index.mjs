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
const INDEX_HEADING = '## 결정 기록'

/**
 * 결정 기록 절만 떼어낸다.
 *
 * 문서 전체를 보면 **본문의 링크가 표의 누락을 가린다.** README는 설명 중에 특정 ADR을
 * 링크한다 — 표에서 그 줄을 지워도 본문 링크가 남아 있어 검사가 통과한다. 실제로
 * ADR-0011을 표에서 빼 봤더니 0건이 나왔다.
 *
 * 다음 `## `까지만 자른다. 문서 끝까지 자르면 뒤에 절이 하나 붙는 순간 같은 구멍이
 * 다시 생긴다.
 */
function indexSection(markdown) {
  const text = markdown ?? ''
  const start = text.indexOf(INDEX_HEADING)
  if (start === -1) return ''
  const rest = text.slice(start + INDEX_HEADING.length)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

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
 * 결정 기록 절이 없으면 모든 ADR이 누락으로 나온다 — 표가 통째로 사라진 것도 드리프트다.
 *
 * @returns {Array<{number: string, problem: 'not-in-index'|'no-file'}>}
 */
export function findAdrIndexDrift(markdown, fileNames) {
  const listed = new Set([...indexSection(markdown).matchAll(ADR_LINK)].map((m) => m[1]))
  const actual = new Set(adrNumbers(fileNames))

  return [
    ...[...actual].filter((n) => !listed.has(n)).map((number) => ({ number, problem: 'not-in-index' })),
    ...[...listed].filter((n) => !actual.has(n)).map((number) => ({ number, problem: 'no-file' })),
  ].sort((a, b) => a.number.localeCompare(b.number))
}
