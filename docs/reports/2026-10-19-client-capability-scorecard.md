# Client Capability Scorecard (generated)

<!-- generated-by: scripts/client-capability-scorecard.mjs -->
<!-- source: config/host-capabilities.json — do not hand-edit numbers; rerun --write -->

## Scope and reading rules

- This scorecard measures the **AIOS control-surface coverage** of each client
  (what AIOS can reliably intercept, inject, compress, and meter), recomputed
  from `config/host-capabilities.json`. It is **not** a model-intelligence
  score and **not** a leaderboard entry; behavioral A/B evidence lives in the
  `docs/reports/2026-07-23-workflow-intelligence-diagnostic-*` protocol.
- Axis set is fixed to the capability tokens in the config: `sessionStartInjection` + `preToolRewrite` + `controlledShellRunner` + `mcpProxy` + `compactPacket` + `advisorySkills` + `metrics`.
- Every row's evidence is the config entry itself; declared limits are listed
  verbatim below the table so constraints stay visible with the score.

## Level legend (from config)

- `L3` (3 pts): Full transparent interception: pre-tool rewrite or controlled runtime plus MCP proxy and compact packets.
- `L2` (2 pts): Controlled runtime/proxy available, but native host raw shell may bypass interception.
- `L1` (1 pts): Advisory skill/thin-shell guidance only.
- `L0` (0 pts): No reliable AIOS interception surface.

## Scorecard

| client | level | sess preT cont mcpP comp advi metr | entry | compress | total |
| --- | --- | --- | --- | --- | --- |
| `aios-harness` | L3 (3) | · · ✓ ✓ ✓ · ✓ | ✓ | ✓ | **9 / 12** |
| `claude` | L2 (2) | ✓ ✓ · ✓ ✓ · · | ✓ | ✓ | **8 / 12** |
| `codex` | L2 (2) | · · ✓ ✓ ✓ · · | ✓ | ✓ | **7 / 12** |
| `grok` | L2 (2) | · · ✓ ✓ ✓ · · | ✓ | ✓ | **7 / 12** |
| `hermes` | L2 (2) | · · · ✓ ✓ ✓ · | ✓ | ✓ | **7 / 12** |
| `gemini` | L2 (2) | · · · ✓ ✓ · · | ✓ | ✓ | **6 / 12** |
| `generic-mcp` | L2 (2) | · · · ✓ ✓ · · | ✓ | ✓ | **6 / 12** |
| `opencode` | L2 (2) | · · · ✓ ✓ · · | ✓ | ✓ | **6 / 12** |
| `pi` | L2 (2) | · · ✓ · ✓ · · | ✓ | ✓ | **6 / 12** |
| `workbuddy` | L2 (2) | · · · ✓ ✓ · · | ✓ | ✓ | **6 / 12** |
| `qoder` | L2 (2) | · · · ✓ · · · | ✓ | ✓ | **5 / 12** |
| `zcode` | L2 (2) | · · · ✓ · · · | ✓ | ✓ | **5 / 12** |
| `cursor` | L1 (1) | · · · · · ✓ · | ✓ | ✓ | **4 / 12** |

`entry` = `requiredEntrypoint: aios-managed-runner` and `directHostBypassAllowed: false`.
`compress` = pre-send + post-receive required, mode `tight`, uncontrolled host output
treated as `policy-violation`. Column order in `level` and capability groups matches
the axis list above; abbreviated headers are the first four letters of each axis.

## Declared limits (evidence, verbatim from config)

### `claude`
- Command rewrite is guarded to supported noisy shell commands; unsupported shell constructs fail open.

### `codex`
- Do not claim raw host shell L3 unless Codex exposes a pre-tool mutation API.

### `gemini`
- Shell interception requires verified host hook or AIOS-controlled runner.

### `opencode`
- L3 depends on plugin or tool-call mutation support.

### `hermes`
- No built-in unattended approval mode; harness orchestration must use controlled AIOS entrypoints.

### `grok`
- Do not claim raw host shell L3 unless Grok Build exposes a pre-tool mutation API.

### `workbuddy`
- No standalone CLI binary: AIOS cannot wrap the host shell or spawn WorkBuddy as a subprocess.
- Shell interception and harness/team routes are unavailable; orchestration runs inside the agent session.

### `pi`
- No built-in MCP surface: AIOS tools reach Pi through the AIOS Pi extension, not MCP config migration.
- No sub-agents upstream: team/agents routes are unverified.
- Project trust gating: project-local .pi resources load only after trust; harness passes --approve per run.

### `cursor`
- Needs a verified extension/hook surface before claiming L2/L3.

### `generic-mcp`
- Proxy-only; shell is out of scope.

### `zcode`
- No verified turn compression: compact packets and shell rewrite are not injected into ZCode sessions yet.
- Bundled CLI is not on PATH by default: harness dispatch requires aliasing the app-bundle zcode.cjs entrypoint.
- Config-file hooks exist (7 events) but AIOS init does not inject ZCode hooks yet.

### `qoder`
- No verified turn compression: compact packets and shell rewrite are not injected into Qoder sessions yet.
- Qoder host hooks exist (tool-call events) but AIOS init does not inject Qoder hooks yet.
- CN distribution uses ~/.qoder-cn home and qoderclicn command name; international default is ~/.qoder with qoder.
