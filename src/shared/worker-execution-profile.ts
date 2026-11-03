export const CODEX_REVIEW_EXECUTION_PROFILE = 'codex-unsandboxed-on-request-v1' as const
export const WORKER_EXECUTION_PROFILE_CAPABILITY = 'orchestration.execution-profile.v1' as const
export const CODEX_REVIEW_EXECUTION_ARGS =
  '-s danger-full-access -a on-request -c approvals_reviewer=user'

export type WorkerExecutionScope = {
  runtimeId: string
  worktreeId: string
  repoId: string
}

export type WorkerExecutionProfile = {
  schema: 'orca-worker-execution-profile-v1'
  id: typeof CODEX_REVIEW_EXECUTION_PROFILE
  agent: 'codex'
  scope: WorkerExecutionScope
  args: typeof CODEX_REVIEW_EXECUTION_ARGS
  policy: { sandbox: 'danger-full-access'; approval: 'on-request'; reviewer: 'user' }
  settingsSha256: string
  sha256: string
}

export type CodexWorkerModeEvidence = {
  schema: 'orca-codex-worker-mode-v1'
  status: 'verified' | 'mismatch' | 'unverified'
  sessionId: string
  sourceFingerprint: string
  throughByte: number
  contexts: {
    sha256: string
    approval: string | null
    reviewer: string | null
    sandbox: string | null
    permissionProfile: string | null
  }[]
  reason?: string
}
