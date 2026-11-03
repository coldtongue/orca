# Explicit worker execution profiles

`orchestration execution-profile` is read-only. It resolves an immutable, runtime- and
workspace-scoped descriptor and digest; it starts no agent and changes no settings.
The caller then passes both the profile and expected digest to `worker-start`.
Older hosts fail the capability check instead of ignoring the requested policy.

```bash
orca orchestration execution-profile --profile codex-unsandboxed-on-request-v1 \
  --worktree id:<workspace> --json
orca orchestration worker-start --task <task> --from <coordinator> --agent codex \
  --worktree id:<workspace> --execution-profile codex-unsandboxed-on-request-v1 \
  --expected-profile-sha256 <resolved-sha256> --full --json
```

The v1 profile is deliberately narrow: a fresh Codex terminal in an exact existing
local workspace. Remote, reused, resumed and structured workers are refused rather
than falling back. Other worker launches retain their existing behavior.

The v1 profile supports native macOS and Linux hosts. Windows/WSL mode evidence is
not supported yet and is refused before worker creation; existing workers without
this profile keep their normal cross-platform behavior.

It never widens Ask or Auto: the host must already permit unsandboxed Codex through
Full Access with empty custom arguments, or the exact approved Own recipe. Custom
command/environment overrides and disabled agents are refused. The profile narrows
Full Access by retaining `on-request` approvals with the user as reviewer. It does
not write global settings, disable hooks, or bypass managed policy and approvals.
Caller authorization and repository-specific approval remain separate requirements.

```mermaid
flowchart LR
  A[Read-only profile resolution] --> B[Caller binds expected digest]
  B --> C[Native pre-effect check]
  C --> D[Same startup settings snapshot]
  D --> E[Exact child mode evidence]
  E --> F[Frozen archive and review gate]
```

The native start receipt's `executionProfile` describes the applied launch policy;
it is not proof of the child's effective mode. For Codex, exact transcript output
also supplies `executionMode`: session-bound hashes of raw `turn_context` records,
including every observed policy transition. Partial/unreadable/oversized sources
remain unverified; wrong session or any unsafe policy is a mismatch. No prompt or
environment contents are exposed. Frozen terminal archives retain this evidence.
Consumers must require verified evidence alongside their ordinary completed-worker,
result/progress, input/head/contract and finding checks. Missing evidence is not a
clean review. A later source/settings mismatch must never be fixed by a hidden
profile switch, repeated launch or round/budget reset.
