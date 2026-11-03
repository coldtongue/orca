import type { WorkerStartInput } from './worker-start-schema'
import type { WorkerStartModeReceipt } from '../../orchestration-worker-start-mode'
import {
  assertWorkerExecutionProfile,
  resolveCodexReviewExecutionProfile
} from '../../../../orchestration/codex-review-execution-profile'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

type ExecutionProfileRuntime = Pick<
  OrcaRuntimeService,
  'getRuntimeId' | 'getClientAgentLaunchSettings'
> & {
  showManagedTerminalWorkspace: (
    selector: string,
    host?: 'local'
  ) => Promise<{ id: string; repoId: string }>
}

export async function resolveLocalWorkerExecutionProfile(
  runtime: ExecutionProfileRuntime,
  selector: string
) {
  if (process.platform === 'win32') {
    throw new OrchestrationError(
      'capability_unsupported',
      'Execution profile v1 requires a native macOS or Linux host; Windows/WSL mode evidence is not supported yet.'
    )
  }
  if (!selector.startsWith('id:')) {
    throw new OrchestrationError('invalid_argument', 'An exact existing workspace is required.')
  }
  const workspace = await runtime.showManagedTerminalWorkspace(selector, 'local')
  return resolveCodexReviewExecutionProfile(runtime.getClientAgentLaunchSettings(), {
    runtimeId: runtime.getRuntimeId(),
    worktreeId: workspace.id,
    repoId: workspace.repoId
  })
}

export async function prepareLocalWorkerExecutionProfile(
  runtime: ExecutionProfileRuntime,
  params: WorkerStartInput,
  mode: WorkerStartModeReceipt,
  followUp: boolean
) {
  if (!params.executionProfile) {
    return undefined
  }
  if (mode.mode !== 'terminal' || followUp || params.agent !== 'codex') {
    throw new Error('execution_profile_requires_fresh_terminal_worker')
  }
  const profile = await resolveLocalWorkerExecutionProfile(runtime, params.worktree ?? '')
  assertWorkerExecutionProfile(profile, params.expectedExecutionProfileSha256 ?? '')
  return profile
}
