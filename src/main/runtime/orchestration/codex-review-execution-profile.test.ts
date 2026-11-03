import { describe, expect, it } from 'vitest'
import {
  projectAgentLaunchSettings,
  type AgentLaunchSettings
} from '../../../shared/agent-launch-settings'
import { resolveAgentStartupPlanInputs } from '../../../shared/agent-startup-plan-inputs'
import { CODEX_REVIEW_EXECUTION_ARGS } from '../../../shared/worker-execution-profile'
import {
  assertWorkerExecutionProfile,
  resolveCodexReviewExecutionProfile
} from './codex-review-execution-profile'

function settings(
  choice: 'full-access' | 'own' | 'ask' | 'auto' = 'full-access'
): AgentLaunchSettings {
  return {
    defaultTuiAgent: 'codex',
    disabledTuiAgents: [],
    agentCmdOverrides: {},
    agentDefaultArgs: { codex: '' },
    environmentNames: {},
    permissionMode: 'yolo',
    agentPermission: {
      default: choice,
      overrides: {},
      userArgs: { codex: choice === 'own' ? CODEX_REVIEW_EXECUTION_ARGS : '' }
    }
  }
}
const scope = { runtimeId: 'runtime-1', worktreeId: 'repo::review-1', repoId: 'repo-1' }

describe('Codex reviewer execution profile', () => {
  it('narrows Full Access without mutating any user setting', () => {
    const before = settings()
    const frozen = structuredClone(before)
    const profile = resolveCodexReviewExecutionProfile(before, scope)
    expect(before).toEqual(frozen)
    expect(profile.args).toBe(CODEX_REVIEW_EXECUTION_ARGS)
    expect(profile.args).not.toContain('--dangerously-bypass')
    expect(profile.policy).toEqual({
      sandbox: 'danger-full-access',
      approval: 'on-request',
      reviewer: 'user'
    })
    assertWorkerExecutionProfile(profile, profile.sha256)
  })
  it('accepts the already approved exact Own recipe', () => {
    expect(resolveCodexReviewExecutionProfile(settings('own'), scope).policy.approval).toBe(
      'on-request'
    )
  })
  it.each(['ask', 'auto'] as const)('cannot widen the user %s permission', (mode) => {
    expect(() => resolveCodexReviewExecutionProfile(settings(mode), scope)).toThrow(
      'requires_existing'
    )
  })
  it.each(['', '--dangerously-bypass-approvals-and-sandbox', '-a never', '--approve-for-me'])(
    'refuses an unverified Own recipe %s',
    (args) => {
      const value = settings('own')
      value.agentPermission!.userArgs.codex = args
      expect(() => resolveCodexReviewExecutionProfile(value, scope)).toThrow('requires_existing')
    }
  )
  it('binds actual host and workspace and detects a changed baseline', () => {
    const value = settings()
    const first = resolveCodexReviewExecutionProfile(value, scope)
    for (const key of ['runtimeId', 'worktreeId', 'repoId'] as const) {
      expect(() =>
        assertWorkerExecutionProfile(
          resolveCodexReviewExecutionProfile(value, { ...scope, [key]: 'different' }),
          first.sha256
        )
      ).toThrow('execution_profile_changed')
    }
    expect(() =>
      assertWorkerExecutionProfile(
        resolveCodexReviewExecutionProfile(settings('own'), scope),
        first.sha256
      )
    ).toThrow('execution_profile_changed')
  })
  it('refuses command and environment overrides or a disabled agent', () => {
    for (const mutate of [
      (v: AgentLaunchSettings) => {
        v.agentCmdOverrides.codex = 'custom-codex'
      },
      (v: AgentLaunchSettings) => {
        v.environmentNames.codex = ['OPENAI_API_KEY']
      },
      (v: AgentLaunchSettings) => {
        v.disabledTuiAgents = ['codex']
      }
    ]) {
      const value = settings()
      mutate(value)
      expect(() => resolveCodexReviewExecutionProfile(value, scope)).toThrow('requires_existing')
    }
  })
})

describe('actual dedicated launch settings projection', () => {
  it.each(['full-access', 'own'] as const)(
    'keeps %s separate from model and effort defaults',
    (permission) => {
      const raw = {
        agentPermissionDefault: permission,
        agentDefaultArgs: { codex: permission === 'own' ? CODEX_REVIEW_EXECUTION_ARGS : '' },
        agentLaunchChoices: { codex: { model: 'gpt-5.2-codex', options: { effort: 'high' } } }
      }
      const projected = projectAgentLaunchSettings(raw, 'darwin')
      expect(projected.agentPermission?.userArgs.codex).toContain('-m gpt-5.2-codex')
      const before = structuredClone(raw)
      const profile = resolveCodexReviewExecutionProfile(projected, scope)
      const inputs = resolveAgentStartupPlanInputs({
        agent: 'codex',
        settings: raw,
        platform: 'darwin',
        isRemote: false,
        shell: 'posix',
        agentArgs: profile.args
      })
      expect(inputs.agentArgs).toBe(CODEX_REVIEW_EXECUTION_ARGS)
      expect(inputs.sessionOptions).toMatchObject({ model: 'gpt-5.2-codex', effort: 'high' })
      expect(raw).toEqual(before)
      raw.agentLaunchChoices.codex.options.effort = 'low'
      expect(() =>
        assertWorkerExecutionProfile(
          resolveCodexReviewExecutionProfile(projectAgentLaunchSettings(raw, 'darwin'), scope),
          profile.sha256
        )
      ).toThrow('execution_profile_changed')
    }
  )
  it('still rejects raw custom args when dedicated choices are present', () => {
    const projected = projectAgentLaunchSettings(
      {
        agentPermissionDefault: 'full-access',
        agentDefaultArgs: { codex: '-a never' },
        agentLaunchChoices: { codex: { model: 'gpt-5.2-codex' } }
      },
      'darwin'
    )
    expect(() => resolveCodexReviewExecutionProfile(projected, scope)).toThrow('requires_existing')
  })
})
