#!/usr/bin/env node
// `npm run reviews -- <pr>` — 답하지 않은 리뷰 지적과 진행 중인 체크를 센다.
//
// gh를 부르는 것까지가 이 파일의 일이다. 판단은 reviews.mjs에 있고 회귀 케이스가
// 거기 붙는다.

import { execFileSync } from 'node:child_process'
import { findUnansweredReviews, findPendingChecks, reviewers, reviewCoverage } from './reviews.mjs'

const pr = process.argv[2]

if (!pr) {
  console.error('사용법: npm run reviews -- <pr번호>')
  process.exit(2)
}

const run = (args) =>
  JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))

const gh = (args) => {
  try {
    return run(args)
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('gh가 없다. GitHub CLI를 설치한다.')
    } else {
      console.error('gh를 부르지 못했다. 로그인돼 있는지, PR 번호가 맞는지 본다.')
      console.error(`  ${(error.stderr || String(error.message)).toString().trim().split('\n')[0]}`)
    }
    process.exit(1)
  }
}

// gh pr checks는 체크가 없을 때도, 체크가 **실패했을 때도** 0이 아닌 코드로 끝난다.
// 둘 다 이 도구가 답해야 하는 상태다 — 여기서 죽으면 "로그인 확인하라"는 엉뚱한
// 말을 하고, 정작 미응답 지적은 보여주지 못한다 (#94 리뷰).
const ghChecks = (args) => {
  try {
    return run(args)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    try {
      return JSON.parse(error.stdout?.toString() || '[]')
    } catch {
      return []
    }
  }
}

const repo = gh(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner
const comments = gh(['api', `repos/${repo}/pulls/${pr}/comments`, '--paginate'])
const checks = ghChecks(['pr', 'checks', pr, '--json', 'name,state,bucket']) ?? []

// API가 배열이 아닌 것을 돌려줄 수 있다. 순수 함수는 막고 있지만 아래 루프는 안 막는다.
const commentList = Array.isArray(comments) ? comments : []
const view = gh(['pr', 'view', pr, '--json', 'reviews,headRefOid'])
const reviewed = reviewers(view.reviews)
const coverage = reviewCoverage(view.reviews, view.headRefOid)
const unanswered = findUnansweredReviews(commentList)
const pending = findPendingChecks(checks)

const byBot = new Map()
for (const c of commentList) {
  if (c?.in_reply_to_id || !/\[bot\]$/.test(c?.user?.login ?? '')) continue
  byBot.set(c.user.login, (byBot.get(c.user.login) ?? 0) + 1)
}

console.log(`PR #${pr}`)
console.log(`  리뷰를 낸 쪽  ${reviewed.length ? reviewed.join(' · ') : '없음  ⚠'}`)
console.log(`  최신을 본 쪽  ${coverage.sawHead.length ? coverage.sawHead.join(' · ') : '없음  ⚠'}`)
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

// 리뷰가 있어도 그것이 지금 머지될 커밋을 본 것이 아니면 아무도 안 본 것과 같다.
if (coverage.stale.length) {
  console.log(`\n낡은 리뷰 — 지금 머지될 ${view.headRefOid.slice(0, 7)} 를 안 봤다`)
  for (const { login, commit } of coverage.stale) {
    console.log(`  ${login.padEnd(26)}본 커밋 ${String(commit).slice(0, 7)}`)
  }
}

if (unanswered.length || pending.length || coverage.sawHead.length === 0) {
  console.log('\n머지하기 전에 볼 것이 있다.')
  process.exit(1)
}
console.log('\n답하지 않은 지적 없음. 진행 중인 체크 없음.')
