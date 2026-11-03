import { createHash } from 'node:crypto'
import type { AgentLaunchSettings } from '../../../shared/agent-launch-settings'
import {
  CODEX_REVIEW_EXECUTION_ARGS,
  CODEX_REVIEW_EXECUTION_PROFILE,
  type WorkerExecutionProfile,
  type WorkerExecutionScope
} from '../../../shared/worker-execution-profile'

const digest = (values: readonly unknown[]) =>
  createHash('sha256').update(JSON.stringify(values)).digest('hex')

export function resolveCodexReviewExecutionProfile(
  settings: AgentLaunchSettings,
  scope: WorkerExecutionScope
): WorkerExecutionProfile {
  if (Object.values(scope).some((value) => !value || value !== value.trim())) {
    throw new Error('execution_profile_scope_invalid')
  }
  const permission = settings.agentPermission
  const choice = permission?.overrides.codex ?? permission?.default
  const userArgs = settings.agentChoices
    ? (settings.agentChoices.userArgs.codex ?? '')
    : permission?.userArgs.codex
  const command = settings.agentCmdOverrides.codex ?? ''
  const environment = settings.environmentNames.codex ?? []
  if (
    !permission ||
    settings.disabledTuiAgents.includes('codex') ||
    command.trim() ||
    environment.length ||
    !(
      (choice === 'full-access' && userArgs === '') ||
      (choice === 'own' && userArgs === CODEX_REVIEW_EXECUTION_ARGS)
    )
  ) {
    throw new Error('execution_profile_requires_existing_unsandboxed_permission')
  }
  const settingsSha256 = digest([
    choice,
    userArgs,
    command,
    [...environment].sort(),
    settings.agentChoices?.defaults.codex ?? null
  ])
  const sha256 = digest([
    1,
    CODEX_REVIEW_EXECUTION_PROFILE,
    scope.runtimeId,
    scope.worktreeId,
    scope.repoId,
    CODEX_REVIEW_EXECUTION_ARGS,
    settingsSha256
  ])
  return {
    schema: 'orca-worker-execution-profile-v1',
    id: CODEX_REVIEW_EXECUTION_PROFILE,
    agent: 'codex',
    scope: { ...scope },
    args: CODEX_REVIEW_EXECUTION_ARGS,
    policy: { sandbox: 'danger-full-access', approval: 'on-request', reviewer: 'user' },
    settingsSha256,
    sha256
  }
}

export function assertWorkerExecutionProfile(
  actual: WorkerExecutionProfile,
  expectedSha256: string
): void {
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || actual.sha256 !== expectedSha256) {
    throw new Error('execution_profile_changed')
  }
}
