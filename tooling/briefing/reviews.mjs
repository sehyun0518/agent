// PR의 리뷰 지적 중 답하지 않은 것을 찾는다.
//
// 이 세션이 리뷰 세 건을 놓쳤다. 늦게 온 것이 아니었다 — **머지 28분 전에 도착해
// 있었고 내가 안 돌아봤다.** "확인했을 때 진행 중이었다"가 이유였는데, 그것은 다시
// 볼 이유이지 안 볼 이유가 아니다.
//
// 사람이 기억하는 것으로 고치면 같은 실패가 또 난다. 세어서 말한다.
//
// CI로 막지 않는 이유가 있다. CI는 푸시에 돈다. **마지막 푸시 뒤에 도착한 리뷰는
// CI를 다시 돌리지 않으므로, 초록인 채로 미응답이 남는다.** 그래서 머지 직전에
// 부르는 명령으로 둔다 (`docs/operations.md` §2.8).

const isBot = (login) => /\[bot\]$/.test(login ?? '')

/**
 * 답하지 않은 봇 지적.
 *
 * 스레드의 뿌리(`in_reply_to_id`가 없는 것)가 봇이고, 그 스레드에 사람 답글이
 * 하나도 없으면 미응답이다. 봇이 봇에게 단 답글은 세지 않는다 — CodeRabbit이 내
 * 답글에 다시 답하는 일이 있고, 그것은 내가 답한 증거가 아니다.
 *
 * @param {Array<{id: number, in_reply_to_id: number|null, user: {login: string}, path?: string, line?: number, html_url?: string}>} comments
 * @returns {Array<{id: number, bot: string, path?: string, line?: number, url?: string}>}
 */
export function findUnansweredReviews(comments) {
  const list = Array.isArray(comments) ? comments : []
  const answered = new Set()
  for (const comment of list) {
    const root = comment?.in_reply_to_id
    if (root && !isBot(comment?.user?.login)) answered.add(root)
  }
  return list
    .filter((c) => c && !c.in_reply_to_id && isBot(c.user?.login) && !answered.has(c.id))
    .map((c) => ({
      id: c.id,
      bot: c.user.login,
      path: c.path,
      line: c.line ?? c.original_line,
      url: c.html_url,
    }))
}

/**
 * 리뷰를 낸 적 있는 이름.
 *
 * **"지적 없음"과 "아직 안 봤다"는 다르다.** 인라인 코멘트만 세면 둘이 같아 보이고,
 * 아무도 안 본 PR이 깨끗한 PR로 보고된다 — 이 도구를 처음 돌렸을 때 실제로 그랬다.
 * ADR-0031이 텔레메트리에서 적은 것과 같다: **안 온 것은 세어지지 않는다.**
 *
 * **누가 봐야 하는지는 정하지 않는다.** 필수 리뷰어 목록을 여기 두면 봇이 늘 때
 * 두 곳이 갈린다. 누가 봤는지만 말하고 빠진 쪽은 사람이 안다.
 *
 * @param {Array<{author?: {login?: string}}>} reviews
 * @returns {string[]}
 */
export function reviewers(reviews) {
  return [...new Set((reviews ?? []).map((r) => r?.author?.login).filter(Boolean))]
}

/**
 * 아직 끝나지 않은 체크.
 *
 * 리뷰 봇은 체크로도 상태를 낸다 — CodeRabbit이 `Review in progress`를 그렇게
 * 알린다. 진행 중인 것이 있으면 지적이 더 올 수 있다.
 *
 * @param {Array<{name: string, state?: string, conclusion?: string, bucket?: string}>} checks
 * @returns {string[]} 진행 중인 체크 이름
 */
export function findPendingChecks(checks) {
  return (checks ?? [])
    .filter((c) => {
      const state = (c?.bucket ?? c?.conclusion ?? c?.state ?? '').toLowerCase()
      return state === '' || state === 'pending' || state === 'in_progress' || state === 'queued'
    })
    .map((c) => c?.name)
    .filter(Boolean)
}
