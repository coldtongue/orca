import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import type { CodexWorkerModeEvidence } from '../../../shared/worker-execution-profile'
import { readLocalTranscriptSourceIdentity } from './worker-transcript-local-checkpoint'
import {
  localWorkerTranscriptSourceIdentity,
  workerTranscriptSourceChanged
} from './worker-transcript-source-identity'

const MAX_MODE_SOURCE_BYTES = 32 * 1024 * 1024
const member = (value: unknown, choices: readonly string[]) =>
  typeof value === 'string' && choices.includes(value) ? value : null

export async function readCodexWorkerModeEvidence(
  filePath: string,
  sessionId: string,
  sourceFingerprint: string
): Promise<CodexWorkerModeEvidence> {
  const result: CodexWorkerModeEvidence = {
    schema: 'orca-codex-worker-mode-v1',
    status: 'unverified',
    sessionId,
    sourceFingerprint,
    throughByte: 0,
    contexts: []
  }
  try {
    const handle = await open(filePath, 'r')
    try {
      const before = localWorkerTranscriptSourceIdentity(await handle.stat({ bigint: true }))
      if (
        !before ||
        before.fingerprint !== sourceFingerprint ||
        before.size > MAX_MODE_SOURCE_BYTES
      ) {
        return { ...result, reason: 'source_not_verifiable' }
      }
      const raw = Buffer.alloc(before.size)
      let read = 0
      while (read < raw.length) {
        const part = await handle.read(raw, read, raw.length - read, read)
        if (!part.bytesRead) {
          return { ...result, reason: 'source_truncated' }
        }
        read += part.bytesRead
      }
      const after = localWorkerTranscriptSourceIdentity(await handle.stat({ bigint: true }))
      const pathAfter = await readLocalTranscriptSourceIdentity(filePath)
      if (
        workerTranscriptSourceChanged(before, after, raw.length) ||
        workerTranscriptSourceChanged(before, pathAfter, raw.length) ||
        after?.size !== before.size ||
        pathAfter?.size !== before.size
      ) {
        return { ...result, reason: 'source_changed' }
      }
      result.throughByte = raw.length
      if (!raw.length || raw.at(-1) !== 0x0a) {
        return { ...result, reason: 'source_record_incomplete' }
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
      let meta = 0
      let mismatch = false
      for (const line of text.slice(0, -1).split('\n')) {
        const record = JSON.parse(line)
        if (record.type === 'session_meta') {
          meta += 1
          mismatch ||= record.payload?.id !== sessionId
        }
        if (record.type !== 'turn_context') {
          continue
        }
        const p = record.payload ?? {}
        const context = {
          sha256: createHash('sha256').update(line).digest('hex'),
          approval: member(p.approval_policy, ['on-request', 'never', 'untrusted', 'on-failure']),
          reviewer: member(p.approvals_reviewer, ['user', 'auto_review']),
          sandbox: member(p.sandbox_policy?.type, [
            'danger-full-access',
            'read-only',
            'workspace-write'
          ]),
          permissionProfile: member(p.permission_profile?.type, ['disabled', 'managed', 'legacy'])
        }
        result.contexts.push(context)
        mismatch ||=
          context.approval !== 'on-request' ||
          context.reviewer !== 'user' ||
          context.sandbox !== 'danger-full-access' ||
          context.permissionProfile !== 'disabled'
      }
      if (meta !== 1 || result.contexts.length === 0) {
        return { ...result, reason: 'session_or_mode_missing' }
      }
      return { ...result, status: mismatch ? 'mismatch' : 'verified' }
    } finally {
      await handle.close()
    }
  } catch {
    return { ...result, reason: 'source_unreadable_or_invalid' }
  }
}
