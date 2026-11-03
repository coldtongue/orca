import { createHash } from 'node:crypto'
import * as identity from './worker-transcript-local-checkpoint'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readCodexWorkerModeEvidence } from './codex-worker-mode-evidence'
import { readLocalTranscriptSourceIdentity } from './worker-transcript-local-checkpoint'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'codex-mode-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
const policy = {
  approval_policy: 'on-request',
  approvals_reviewer: 'user',
  sandbox_policy: { type: 'danger-full-access' },
  permission_profile: { type: 'disabled' }
}
async function observe(contexts: unknown[], session = 'session-1', partial = false) {
  const file = path.join(root, 'rollout.jsonl')
  const rows = [
    { type: 'session_meta', payload: { id: session } },
    ...contexts.map((payload) => ({ type: 'turn_context', payload }))
  ]
  await writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n') + (partial ? '' : '\n'))
  const source = await readLocalTranscriptSourceIdentity(file)
  return readCodexWorkerModeEvidence(file, 'session-1', source!.fingerprint)
}

describe('exact Codex child mode evidence', () => {
  it('collects raw context digests without exposing message or environment contents', async () => {
    const value = await observe([policy, policy])
    expect(value.status).toBe('verified')
    expect(value.contexts).toHaveLength(2)
    expect(value.contexts[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(value.contexts[0].approval).toBe('on-request')
  })
  it.each([
    { ...policy, approval_policy: 'never' },
    { ...policy, approvals_reviewer: 'auto_review' },
    { ...policy, sandbox_policy: { type: 'read-only' } },
    { ...policy, sandbox_policy: { type: 'workspace-write' } },
    { ...policy, permission_profile: { type: 'managed' } },
    { ...policy, permission_profile: undefined }
  ])('rejects any unsafe/missing policy, including a later change', async (changed) => {
    expect((await observe([policy, changed])).status).toBe('mismatch')
  })
  it('does not accept another session or a missing context', async () => {
    expect((await observe([policy], 'other-session')).status).toBe('mismatch')
    expect((await observe([])).status).toBe('unverified')
  })
  it('fails closed for partial, missing and different-inode sources', async () => {
    expect((await observe([policy], 'session-1', true)).status).toBe('unverified')
    expect(
      (await readCodexWorkerModeEvidence(path.join(root, 'missing'), 'session-1', 'x')).status
    ).toBe('unverified')
    const file = path.join(root, 'other.jsonl')
    await writeFile(file, '{}\n')
    expect((await readCodexWorkerModeEvidence(file, 'session-1', 'wrong-source')).status).toBe(
      'unverified'
    )
  })
  it('hashes the raw context record without normalizing its whitespace', async () => {
    const file = path.join(root, 'whitespace.jsonl')
    const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'session-1' } })
    const context = `${JSON.stringify({ type: 'turn_context', payload: policy })} \t`
    await writeFile(file, `${meta}\n${context}\n`)
    const source = await readLocalTranscriptSourceIdentity(file)
    const result = await readCodexWorkerModeEvidence(file, 'session-1', source!.fingerprint)
    expect(result.status).toBe('verified')
    expect(result.contexts[0].sha256).toBe(createHash('sha256').update(context).digest('hex'))
  })
  it('does not attest a prefix if the same source grows during the read', async () => {
    const file = path.join(root, 'growing.jsonl')
    await writeFile(
      file,
      `${[
        { type: 'session_meta', payload: { id: 'session-1' } },
        { type: 'turn_context', payload: policy }
      ]
        .map((row) => JSON.stringify(row))
        .join('\n')}\n`
    )
    const source = await readLocalTranscriptSourceIdentity(file)
    vi.spyOn(identity, 'readLocalTranscriptSourceIdentity').mockResolvedValue({
      ...source!,
      size: source!.size + 1
    })
    expect((await readCodexWorkerModeEvidence(file, 'session-1', source!.fingerprint)).status).toBe(
      'unverified'
    )
  })
  it('does not report a bounded read as a complete proof', async () => {
    const file = path.join(root, 'large.jsonl')
    await writeFile(file, '{}\n')
    await truncate(file, 33 * 1024 * 1024)
    const source = await readLocalTranscriptSourceIdentity(file)
    expect((await readCodexWorkerModeEvidence(file, 'session-1', source!.fingerprint)).status).toBe(
      'unverified'
    )
  })
})
