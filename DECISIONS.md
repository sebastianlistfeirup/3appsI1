# Decisions

## 2026-10-16 — Initial profile and ownership

The supplied repository is empty and public. Develop in task branches in that explicitly selected repository; do not change its visibility. No runtime credentials are configured. Implement the specified local/demo profile with synthetic data, IndexedDB and real local exports. Cloud authentication, tenant isolation and paid integrations remain gated until verified. The PDF is the only supplied source; reconstruct tasks and fixtures from its contracts rather than assume the referenced ZIP exists.

Use three independent Next.js App Router applications, React/TypeScript and pnpm workspaces. Use TypeScript 5.9.3 as a conservative, supported compiler baseline; dependencies are pinned and actual compatibility is determined by builds. Shared packages are extracted for concrete common needs. No new paid provider calls.

Two specialists own FlowLab and Director in separate worktrees; the coordinator owns Studio One, foundation and lockfile. The requested eight-hour budget is recorded; no daemon is claimed to exist. Active development is checkpointed for continuation.
