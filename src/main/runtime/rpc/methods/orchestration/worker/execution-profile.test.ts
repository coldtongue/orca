import { describe, expect, it, vi } from 'vitest'
import type { AgentLaunchSettings } from '../../../../../../shared/agent-launch-settings'
import { CODEX_REVIEW_EXECUTION_PROFILE } from '../../../../../../shared/worker-execution-profile'
import { WorkerStartParams } from '../../../../../../shared/rpc-contract/orchestration-worker-start-params'
import { decideWorkerStartMode } from '../../orchestration-worker-start-mode'
import {
  prepareLocalWorkerExecutionProfile,
  resolveLocalWorkerExecutionProfile
} from './execution-profile'

function fixture() {
  const settings: AgentLaunchSettings = {
    defaultTuiAgent: 'codex',
    disabledTuiAgents: [],
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    environmentNames: {},
    permissionMode: 'yolo',
    agentPermission: { default: 'full-access', overrides: {}, userArgs: { codex: '' } }
  }
  const runtime = {
    getClientAgentLaunchSettings: vi.fn(() => settings),
    getRuntimeId: () => 'runtime-1',
    showManagedTerminalWorkspace: vi.fn(async () => ({ id: 'repo::review', repoId: 'repo' }))
  }
  return { runtime, settings }
}
const mode = (chat = false) =>
  decideWorkerStartMode({
    params: { agent: 'codex' },
    settings: { nativeChatProviders: { codex: chat } }
  })

describe('native profile pre-effect boundary', () => {
  it('resolves readonly local identity and applies only that expected digest', async () => {
    const { runtime, settings } = fixture()
    const before = structuredClone(settings)
    const profile = await resolveLocalWorkerExecutionProfile(runtime, 'id:repo::review')
    const params = WorkerStartParams.parse({
      task: 'task-1',
      from: 'owner',
      agent: 'codex',
      worktree: 'id:repo::review',
      executionProfile: CODEX_REVIEW_EXECUTION_PROFILE,
      expectedExecutionProfileSha256: profile.sha256
    })
    expect(await prepareLocalWorkerExecutionProfile(runtime, params, mode(), false)).toEqual(
      profile
    )
    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('id:repo::review', 'local')
    expect(settings).toEqual(before)
    settings.agentPermission!.default = 'ask'
    await expect(
      prepareLocalWorkerExecutionProfile(runtime, params, mode(), false)
    ).rejects.toThrow('requires_existing')
  })
  it('rejects a changed hash, structured or follow-up worker before launch', async () => {
    const { runtime } = fixture()
    const params = WorkerStartParams.parse({
      task: 'task-1',
      from: 'owner',
      agent: 'codex',
      worktree: 'id:repo::review',
      executionProfile: CODEX_REVIEW_EXECUTION_PROFILE,
      expectedExecutionProfileSha256: '0'.repeat(64)
    })
    await expect(
      prepareLocalWorkerExecutionProfile(runtime, params, mode(), false)
    ).rejects.toThrow('changed')
    await expect(
      prepareLocalWorkerExecutionProfile(runtime, params, mode(true), false)
    ).rejects.toThrow('fresh_terminal')
    await expect(prepareLocalWorkerExecutionProfile(runtime, params, mode(), true)).rejects.toThrow(
      'fresh_terminal'
    )
  })
  it('does not launch an unattestable Windows/WSL v1 route', async () => {
    const { runtime } = fixture()
    const before = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    try {
      await expect(resolveLocalWorkerExecutionProfile(runtime, 'id:repo::review')).rejects.toThrow(
        'Windows/WSL'
      )
      expect(runtime.showManagedTerminalWorkspace).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: before })
    }
  })
  it('does not change ordinary workers or resolve an implicit workspace', async () => {
    const { runtime } = fixture()
    const params = WorkerStartParams.parse({ task: 'task-1', from: 'owner', agent: 'codex' })
    expect(await prepareLocalWorkerExecutionProfile(runtime, params, mode(), false)).toBeUndefined()
    expect(runtime.getClientAgentLaunchSettings).not.toHaveBeenCalled()
    await expect(resolveLocalWorkerExecutionProfile(runtime, 'current')).rejects.toThrow(
      'exact existing'
    )
  })
})
