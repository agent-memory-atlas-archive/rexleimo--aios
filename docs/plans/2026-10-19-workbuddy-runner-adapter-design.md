# WorkBuddy Evaluation Runner Adapter — Design (A 路线)

Status: implemented in code (adapter branch + tests), **live execution blocked on CLI install**.
Decision ticket: `docs/plans/2026-10-19-workbuddy-harness-scorecard-decision-ticket.json`
Delivery ticket: `docs/plans/2026-10-19-workbuddy-harness-scorecard-delivery-ticket.json` (`work-workbuddy-runner-adapter`, `work-workbuddy-live-ab`)

## Facts this design is built on

- **F1** `scripts/lib/learning/gaia-ab-eval/client-adapters.mjs` (before this change) configured only
  `codex` / `claude` / `hermes` CLI-spawn adapters; any other client threw
  `GAIA client adapter is not configured for ${client}`.
- **F2** `config/host-capabilities.json#clients.workbuddy`: `targetLevel L2`,
  `capabilities: [mcpProxy, compactPacket]`, `requiredEntrypoint: aios-managed-runner`,
  `directHostBypassAllowed: false`, limits: *"No standalone CLI binary: AIOS cannot wrap the host
  shell or spawn WorkBuddy as a subprocess."*
- **F3** `scripts/lib/foundation/clients/selection/core/definitions.mjs:118-140` documents that the
  WorkBuddy desktop app ships a real CLI inside its bundle
  (`/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`, alias
  `cbc`), supporting one-shot `-p`, `--model`, JSON output; `one-shot.mjs` already registers a
  `workbuddy-agent` handler using `-p <prompt>`.
- **F4** (verified this session, 2026-10-19) the CLI is **not installed on this machine**:
  `/Applications/WorkBuddy.app` absent; `codebuddy`/`cbc` not on PATH; no brew/npm-global copy;
  only config state exists in `~/.workbuddy/`.

## Resolution of the F2-vs-F3 tension

F2's "cannot spawn WorkBuddy as a subprocess" refers to the desktop host; F3 shows a bundled
headless CLI. The evaluation channel is therefore the **bundled `codebuddy` CLI spawned by
gaia-ab-eval**, same execution shape as codex/claude/hermes — *conditional on install-time
verification* (below). If the CLI never materializes, the fallback is the in-session
`aios-managed-runner` route, and we formally record WorkBuddy as not live-measurable.

## Adapter as implemented

`buildGaiaClientInvocation({ client: 'workbuddy', model, ... })` returns
`{ executable: 'codebuddy', args: ['-p', input, '--model', model] }`:

- model is **operator-pinned per run** (account-bound, no hardcoded default); empty model fails
  closed (`GAIA workbuddy model … must be a non-empty string`);
- no `-y` / `--dangerously-skip-permissions` — the eval is read-only Q&A, permission prompts must
  surface as timeout failures, never be auto-approved;
- expected answers never enter the prompt (existing `buildTaskInput` boundary, asserted in tests).

## Pre-live verification checklist (gate before first real run; each item needs command output)

1. Binary present + version: `<bundle>/cli/bin/codebuddy --version`.
2. Flag contract from real help output: `-p`, `--model`, output format options.
3. Non-interactive behavior: `-p` exits without a permission prompt in a fresh temp dir.
4. Model inventory (`/model` or equivalent) → pick and pin one model string in the live manifest.
5. Global-config bleed: confirm whether `~/.workbuddy/` or project `AGENTS.md` is auto-loaded; if
   yes, pin both arms' guidance docs via git ref + SHA-256 digest exactly as the BBH-20 A/B
   protocol (`docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md`).

## Self-attestation boundary (must be disclosed in any published score)

WorkBuddy may load project-level guidance from disk; unless the digest-pinned protocol of item 5
holds, arm separation is weaker than the codex BBH-20 run, and the report must state that
explicitly. Scores remain non-leaderboard, internal diagnostics.

## Unblock condition (human action required)

Install/open WorkBuddy app (or provide the `codebuddy` binary path), then run checklist items 1-5
and flip `work-workbuddy-live-ab` to ready. Cost note: full A/B run ≈ 2 arms × N tasks of CLI
model calls; the user approved this route on 2026-10-19.
