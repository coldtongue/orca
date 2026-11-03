import { z } from 'zod'
import { CODEX_REVIEW_EXECUTION_PROFILE } from '../worker-execution-profile'

export const WorkerExecutionProfileParams = z
  .object({
    profile: z.literal(CODEX_REVIEW_EXECUTION_PROFILE),
    worktree: z.string().startsWith('id:').min(4)
  })
  .strict()
