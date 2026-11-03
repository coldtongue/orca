import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { okFixture } from '../test-fixtures'
import { ORCHESTRATION_HANDLERS } from './orchestration'
import {
  WORKER_EXECUTION_PROFILE_CAPABILITY,
  CODEX_REVIEW_EXECUTION_PROFILE
} from '../../shared/worker-execution-profile'

const callMock = vi.fn()
const client = new RuntimeClient('/tmp/orca-profile-cli', 60000, null, null)
const originalExit = process.exitCode

describe('explicit worker profile CLI', () => {
  beforeEach(() => {
    callMock.mockReset()
    vi.spyOn(client, 'call').mockImplementation(callMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = undefined
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = originalExit
  })
  const invokeWorkerStart = (flags: Map<string, string | boolean>) =>
    ORCHESTRATION_HANDLERS['orchestration worker-start']({
      flags,
      client,
      cwd: '/tmp/repo',
      json: true
    })
  it('refuses a missing execution-profile capability before any mutation', async () => {
    callMock.mockResolvedValue(okFixture('status', { capabilities: [] }))
    await expect(
      invokeWorkerStart(
        new Map([
          ['task', 'task_1'],
          ['agent', 'codex'],
          ['worktree', 'id:repo::wt'],
          ['execution-profile', CODEX_REVIEW_EXECUTION_PROFILE],
          ['expected-profile-sha256', 'a'.repeat(64)]
        ])
      )
    ).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(callMock.mock.calls.map((call) => call[0])).toEqual(['status.get'])
  })

  it('resolves a profile without creating a Run, Task or worker', async () => {
    callMock.mockImplementation(async (method) =>
      method === 'status.get'
        ? okFixture('status', { capabilities: [WORKER_EXECUTION_PROFILE_CAPABILITY] })
        : okFixture('profile', { sha256: 'a'.repeat(64) })
    )
    await ORCHESTRATION_HANDLERS['orchestration execution-profile']({
      flags: new Map([
        ['profile', CODEX_REVIEW_EXECUTION_PROFILE],
        ['worktree', 'id:repo::wt']
      ]),
      client,
      cwd: '/tmp/repo',
      json: true
    })
    expect(callMock.mock.calls.map((call) => call[0])).toEqual([
      'status.get',
      'orchestration.executionProfile'
    ])
  })

  it('passes the explicit profile and expected hash unchanged', async () => {
    callMock.mockImplementation(async (method) =>
      method === 'status.get'
        ? okFixture('status', { capabilities: [WORKER_EXECUTION_PROFILE_CAPABILITY] })
        : okFixture('start', {
            state: 'ready',
            runId: 'run_1',
            taskId: 'task_1',
            dispatchId: 'ctx_1',
            effects: [],
            residualResources: []
          })
    )
    await invokeWorkerStart(
      new Map([
        ['task', 'task_1'],
        ['from', 'term_coord'],
        ['agent', 'codex'],
        ['worktree', 'id:repo::wt'],
        ['execution-profile', CODEX_REVIEW_EXECUTION_PROFILE],
        ['expected-profile-sha256', 'a'.repeat(64)]
      ])
    )
    expect(
      callMock.mock.calls.find((call) => call[0] === 'orchestration.workerStart')?.[1]
    ).toMatchObject({
      executionProfile: CODEX_REVIEW_EXECUTION_PROFILE,
      expectedExecutionProfileSha256: 'a'.repeat(64)
    })
  })
})
