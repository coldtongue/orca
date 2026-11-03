import { describe, expect, it } from 'vitest'
import { CODEX_REVIEW_EXECUTION_PROFILE } from '../worker-execution-profile'
import { WorkerStartParams } from './orchestration-worker-start-params'
import { WorkerExecutionProfileParams } from './orchestration-execution-profile-params'

const request = {
  task: 'task-1',
  from: 'term-1',
  worktree: 'id:repo::review',
  agent: 'codex',
  executionProfile: CODEX_REVIEW_EXECUTION_PROFILE,
  expectedExecutionProfileSha256: 'a'.repeat(64)
}

describe('explicit execution-profile admission', () => {
  it('accepts a fresh exact existing local Codex workspace only', () => {
    expect(WorkerStartParams.parse(request)).toMatchObject(request)
    expect(
      WorkerExecutionProfileParams.parse({
        profile: CODEX_REVIEW_EXECUTION_PROFILE,
        worktree: request.worktree
      })
    ).toBeDefined()
  })
  it.each([
    { on: 'remote' },
    { terminal: 'old-worker' },
    { agent: 'claude' },
    { worktree: 'current' },
    { worktree: 'new-child' },
    { retryOf: 'old-dispatch' },
    { executionProfile: undefined },
    { expectedExecutionProfileSha256: undefined },
    { expectedExecutionProfileSha256: 'wrong' }
  ])('does not silently drop profile requirements %j', (changed) => {
    expect(WorkerStartParams.safeParse({ ...request, ...changed }).success).toBe(false)
  })
})
