import {
  decideWorkerStartMode,
  readWorkerStartModeSettings
} from '../../orchestration-worker-start-mode'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { defineMethod } from '../../../core'
import { WorkerExecutionProfileParams } from '../../../../../../shared/rpc-contract/orchestration-execution-profile-params'
import { resolveLocalWorkerExecutionProfile } from './execution-profile'
import { ORCHESTRATION_WORKER_CONTROL_METHODS } from './worker-control'
import { ORCHESTRATION_WORKER_RELEASE_METHODS } from './worker-release'
import { ORCHESTRATION_WORKER_STOP_METHODS } from './worker-stop'
import { ORCHESTRATION_WORKER_START_METHODS } from './workers'

export const ORCHESTRATION_WORKER_METHODS = [
  defineMethod({
    name: 'orchestration.executionProfile',
    permission: 'workspace',
    params: WorkerExecutionProfileParams,
    handler: (params, { runtime }) => {
      const settings = readWorkerStartModeSettings(runtime)
      if (!settings) {
        throw new OrchestrationError(
          'capability_unsupported',
          'Execution profile settings are unavailable.'
        )
      }
      const mode = decideWorkerStartMode({ params: { agent: 'codex' }, settings })
      if (mode.mode !== 'terminal') {
        throw new OrchestrationError(
          'capability_unsupported',
          'Execution profile v1 requires a Codex CLI surface.'
        )
      }
      return resolveLocalWorkerExecutionProfile(runtime, params.worktree)
    }
  }),
  ...ORCHESTRATION_WORKER_START_METHODS,
  ...ORCHESTRATION_WORKER_CONTROL_METHODS,
  ...ORCHESTRATION_WORKER_STOP_METHODS,
  ...ORCHESTRATION_WORKER_RELEASE_METHODS
]
