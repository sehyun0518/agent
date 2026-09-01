#!/usr/bin/env node
// `npm run reviews -- <pr>` — 답하지 않은 리뷰 지적과 진행 중인 체크를 센다.
//
// gh를 부르는 것까지가 이 파일의 일이다. 판단은 reviews.mjs에 있고 회귀 케이스가
// 거기 붙는다.

import { execFileSync } from 'node:child_process'
import { findUnansweredReviews, findPendingChecks, reviewers } from './reviews.mjs'

const pr = process.argv[2]

if (!pr) {
  console.error('사용법: npm run reviews -- <pr번호>')
  process.exit(2)
}

const gh = (args) => {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
  } catch (error) {
    console.error('gh를 부르지 못했다. 로그인돼 있는지, PR 번호가 맞는지 본다.')
    console.error(`  ${String(error.message).split('\n')[0]}`)
    process.exit(1)
  }
}

const repo = gh(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner
const comments = gh(['api', `repos/${repo}/pulls/${pr}/comments`, '--paginate'])
const checks = gh(['pr', 'checks', pr, '--json', 'name,state,bucket']).map?.((c) => c) ?? []

const reviewed = reviewers(gh(['pr', 'view', pr, '--json', 'reviews']).reviews)
const unanswered = findUnansweredReviews(comments)
const pending = findPendingChecks(checks)

const byBot = new Map()
for (const c of comments) {
  if (c?.in_reply_to_id || !/\[bot\]$/.test(c?.user?.login ?? '')) continue
  byBot.set(c.user.login, (byBot.get(c.user.login) ?? 0) + 1)
}

console.log(`PR #${pr}`)
console.log(`  리뷰를 낸 쪽  ${reviewed.length ? reviewed.join(' · ') : '없음  ⚠'}`)
if (byBot.size === 0) console.log('  봇 인라인 지적 없음')
for (const [bot, total] of byBot) {
  const left = unanswered.filter((u) => u.bot === bot).length
  console.log(`  ${bot.padEnd(26)}지적 ${total} · 미응답 ${left}${left ? '  ⚠' : '  ✓'}`)
}

if (unanswered.length) {
  console.log('\n답하지 않은 지적')
  for (const u of unanswered) {
    console.log(`  ${u.path ?? '(파일 없음)'}${u.line ? `:${u.line}` : ''}`)
    if (u.url) console.log(`    ${u.url}`)
  }
}

if (pending.length) console.log(`\n진행 중인 체크: ${pending.join(' · ')}  ⚠ 지적이 더 올 수 있다`)

// 아무도 안 본 것과 보고 지적이 없는 것은 다르다.
if (reviewed.length === 0) console.log('\n아직 아무도 리뷰를 내지 않았다. 지적이 없는 것과 다르다.')

if (unanswered.length || pending.length || reviewed.length === 0) {
  console.log('\n머지하기 전에 볼 것이 있다.')
  process.exit(1)
}
console.log('\n답하지 않은 지적 없음. 진행 중인 체크 없음.')
