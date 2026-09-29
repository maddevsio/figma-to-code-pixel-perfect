export const meta = {
  name: 'page-pipeline',
  description: 'Build pages from the Figma snapshot: planner brief, one builder per page looping on the live pixel check, one review of the whole branch, results back to the main agent',
  whenToUse: 'Implement site pages without human input between steps. args: { page: "<uid>" } or { pages: ["a", "b"], concurrency?: 2 }, kind?: "<a kind from .claude/page-pipeline.md>", base?: "<branch>", briefs?: { "<uid>": "<brief.json path>" } (skip the planner on reruns). Project adapter: .claude/page-pipeline.md',
  phases: [
    { title: 'Plan', detail: 'planner: build brief per page' },
    { title: 'Build', detail: 'builder: fixture, pixel map, blocks, live pixel loop, gates' },
    { title: 'Review', detail: 'reviewer: whole page diff once, one fix round' },
  ],
}

const pages = args && (args.pages || (args.page ? [args.page] : null))
if (!pages || pages.length === 0) throw new Error('args.page or args.pages is required, e.g. { page: "about" }')
const base = (args && args.base) || null

// Kinds (where a page's content lives, which route renders it) are project knowledge: the planner resolves
// `kind` to `source` and `path` from .claude/page-pipeline.md and returns them in the brief.
const kind = (args && args.kind) || 'page'
const target = (page) => ({ page, kind })
const CONCURRENCY = (args && args.concurrency) || 2

const LIST = { type: 'array', items: { type: 'string' } }
const BRIEF = {
  type: 'object',
  properties: {
    source: { type: 'string' },
    path: { type: ['string', 'null'] },
    frames: LIST,
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          status: { type: 'string', enum: ['new', 'off-spec', 'ok'] },
          shared: { type: 'boolean' },
          component: { type: 'string' },
          design: LIST,
          notes: { type: 'string' },
        },
        required: ['type', 'status', 'shared', 'design'],
      },
    },
    sharedChanges: LIST,
    decisions: LIST,
    notes: LIST,
  },
  required: ['source', 'path', 'frames', 'blocks', 'sharedChanges', 'decisions', 'notes'],
}
const GATE = { type: 'string', enum: ['pass', 'fail', 'skipped'] }
const BUILD = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'needs-shared', 'stuck', 'failed'] },
    branch: { type: 'string' },
    base: { type: 'string' },
    worktree: { type: 'string' },
    commits: LIST,
    gates: {
      type: 'object',
      properties: { lint: GATE, tsc: GATE, test: GATE, build: GATE, coverage: GATE, pixel: GATE, otherPages: GATE },
      required: ['lint', 'tsc', 'test', 'build', 'coverage', 'pixel', 'otherPages'],
    },
    pixelSummary: LIST,
    remainingFailures: LIST,
    sharedProposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, change: { type: 'string' }, reason: { type: 'string' }, fixesRows: LIST },
        required: ['file', 'change', 'reason', 'fixesRows'],
      },
    },
    provisional: LIST,
    screenshotNotes: LIST,
    summary: { type: 'string' },
  },
  required: ['status', 'branch', 'base', 'worktree', 'commits', 'gates', 'pixelSummary', 'remainingFailures', 'sharedProposals', 'provisional', 'screenshotNotes', 'summary'],
}
const REVIEW = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'problem', 'fix'],
      },
    },
  },
  required: ['approved', 'findings'],
}

const json = (value) => JSON.stringify(value, null, 2)

log(`${pages.length} ${kind}(s), ${Math.min(CONCURRENCY, pages.length)} at a time: ${pages.join(', ')}`)
const results = await pool(pages, CONCURRENCY, buildPage)
return { base, pages: results }

async function buildPage(page) {
  // A rerun after shared-code changes reuses the earlier brief: the Figma snapshot and the backend page have not changed.
  const savedBrief = args && args.briefs && args.briefs[page]
  const brief = savedBrief
    ? `Read the saved brief from ${savedBrief}; it replaces this field.`
    : await agent(`Input:\n${json(target(page))}`, { agentType: 'page-planner', schema: BRIEF, label: `plan:${page}`, phase: 'Plan' })
  if (!brief) return { page, status: 'failed', reason: 'planner returned nothing' }

  let build = await agent(`Mode: build.\nInput:\n${json({ ...target(page), base, brief })}`, {
    agentType: 'page-builder',
    schema: BUILD,
    label: `build:${page}`,
    phase: 'Build',
  })
  if (!build) return { page, status: 'failed', reason: 'builder returned nothing', brief }
  log(`${page}: build ${build.status}`)
  if (build.status === 'failed') return { page, brief, build }

  const reviewInput = () => `Input:\n${json({ ...target(page), base: build.base, branch: build.branch, brief, gates: build.gates, provisional: build.provisional })}`
  let review = await agent(reviewInput(), { agentType: 'page-reviewer', schema: REVIEW, label: `review:${page}`, phase: 'Review' })
  const blocking = (verdict) => (verdict ? verdict.findings.filter((finding) => finding.severity !== 'minor') : [])
  if (review && !review.approved && blocking(review).length) {
    const fixed = await agent(`Mode: fix.\nInput:\n${json({ ...target(page), base, brief, reviewFindings: blocking(review) })}`, {
      agentType: 'page-builder',
      schema: BUILD,
      label: `fix:${page}`,
      phase: 'Review',
    })
    if (fixed) build = fixed
    review = await agent(reviewInput(), { agentType: 'page-reviewer', schema: REVIEW, label: `review:${page} fix`, phase: 'Review' })
  }
  log(`${page}: ${build.status}, review ${review ? (review.approved ? 'approved' : `${blocking(review).length} open`) : 'missing'}`)
  return { page, brief, build, review }
}

// Runs fn over items with at most `limit` in flight; a failed item becomes { error } instead of stopping the others.
async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index]).catch((error) => ({ page: items[index], status: 'failed', reason: String(error) }))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
