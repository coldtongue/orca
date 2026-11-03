import { z } from 'zod'
import { CODEX_REVIEW_EXECUTION_PROFILE } from '../worker-execution-profile'
import { OptionalFiniteNumber, OptionalString, requiredString } from './rpc-param-primitives'

export const OptionalWorkerLaunchPreference = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim(), 'Surrounding whitespace is invalid')
  .optional()

export const WorkerStartParams = z
  .object({
    task: OptionalString,
    spec: OptionalString,
    taskTitle: OptionalString,
    deps: OptionalString,
    parent: OptionalString,
    on: OptionalString,
    run: OptionalString,
    from: requiredString('Missing --from'),
    worktree: OptionalString,
    name: OptionalString,
    repo: OptionalString,
    baseBranch: OptionalString,
    displayName: OptionalString,
    comment: OptionalString,
    setup: z.enum(['run', 'skip', 'inherit']).optional(),
    terminal: OptionalString,
    agent: OptionalString,
    executionProfile: z.literal(CODEX_REVIEW_EXECUTION_PROFILE).optional(),
    expectedExecutionProfileSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    model: OptionalWorkerLaunchPreference,
    effort: OptionalWorkerLaunchPreference,
    retryOf: OptionalString,
    timeoutMs: OptionalFiniteNumber,
    devMode: z.boolean().optional()
  })
  .superRefine((params, ctx) => {
    if (Boolean(params.executionProfile) !== Boolean(params.expectedExecutionProfileSha256)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionProfile'],
        message: 'execution-profile and expected-profile-sha256 are required together'
      })
    }
    if (
      params.executionProfile &&
      (params.agent !== 'codex' ||
        params.on ||
        params.terminal ||
        params.retryOf ||
        !params.worktree?.startsWith('id:'))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionProfile'],
        message:
          'Execution profiles require a fresh Codex worker in an exact existing local workspace'
      })
    }

    if (!params.task && !params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task'],
        message: 'Missing --task or --spec'
      })
    }
    if (params.task && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec'],
        message: '--task and --spec are mutually exclusive'
      })
    }
    // spec creates a new Task, so retryOf cannot refer to a prior Dispatch for it.
    if (params.retryOf && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryOf'],
        message:
          '--retry-of needs --task <task_id> naming the failed Task; --spec creates a new one'
      })
    }
  })
