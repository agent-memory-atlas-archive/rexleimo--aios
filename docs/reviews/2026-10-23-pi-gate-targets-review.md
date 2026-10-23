# Standards-and-Spec review — pi gate target-based rewrite (`590ce455`)

- **Verdict:** `pass` for the gate rewrite. With it, the judge-mode audit opened by the user's
  "judge whether this makes agents smarter" directive is closed: the overblocking hypothesis was
  confirmed by measurement (112/114 blocks false-positive), fixed by target judgement, and proven
  with zero adversarial loss.
- **Fixed point:** `git:590ce455` (the range this review covers is `git:5f7e8763...590ce455`).
- **Diff under review:** 5 files, 708 insertions / 9 deletions. Non-empty, verified.
  `git diff --check` clean. New files: `packages/aios-pi/lib/danger-targets.mjs` (465 lines),
  `scripts/tests/clients/pi-agent/pi-gate-targets.test.mjs` (196 lines, wired into
  `scripts/test-suites.json` — wiring gate 6/6 green).
- **Spec source:** no pre-written contract item — this slice came from the user's explicit
  judge-mode directive ("evaluate whether the safety gate is overblocking, fix directly if
  evidence supports it"). Acceptance criteria were set before the fix and are quoted in §Spec:
  (1) false positives on the measured corpus go to ~zero, (2) every adversarial destructive
  shape still blocked, (3) the A2 no-terminate invariant and all other shape rules hold.
- **Standards sources:** `AGENTS.md`, `rex-engineering-standards` (file granularity, DRY,
  test担保), and the Fowler smell baseline from `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff; static reading
  plus real runs against 42,282 recorded tool calls. Treated as self-review.

## Standards

- **One responsibility per file — holds.** `danger-targets.mjs` owns exactly one judgement: "is
  this delete target dangerous". `gates.mjs` keeps verdict assembly (`checkBashCommand`,
  `decideToolCall`, reasons). No second checker was created: reporter and repair share the one
  predicate, same pattern as the earlier compat predicate-owner decision.
- **~400-line soft budget — advisory, not blocking.** `danger-targets.mjs` is 465 lines. A split
  (tokenizer vs classifier) was considered and rejected: the walk (`walkCommands`) is the one
  owner of "what is a command position", and splitting it across two files would let the
  delete-scan and the interpreter-body scan drift apart — which is precisely the class of bug
  this rewrite eliminates. Single cohesive reason to change; stays one file.
- **No test-only product出口.** New exports (`shellWords`, `blankQuoted`, `withoutHeredocs`,
  `findInterpreterBodies`, `findDeleteTargets`, `volatileRoots`, `classifyDeleteTarget`) are all
  consumed by `gates.mjs` except `shellWords`, which is asserted directly by the new tests. That
  matches the module's established seam — `gates.mjs`'s header declares "every function is a pure
  function so node --test can verify it directly" — so one directly-tested pure function is the
  pattern, not a hook.
- **DRY.** The segment walk was extracted (`walkCommands`) the moment a second consumer
  (interpreter bodies for shape recursion) appeared, instead of duplicating the walk. The two
  flag-scan loops (delete verbs vs interpreter flags) read different positions and were left
  separate deliberately.
- **Changed assertions are re-covered, not dropped.** `pi-extension.test.mjs` changed 2
  expectations (`/tmp/x` and `C:\temp` now allowed) with the contract change stated in a comment
  naming the measurement. The dangerous half of those exact cases moved to the new file with
  target-level precision (`/etc` blocked, `C:\Windows\System32` blocked, `~/Documents` blocked).

## Spec (judge-mode acceptance criteria)

- **False positives → ~zero — covered by measurement, not Sparring.** Same corpus, same scanner:
  before `114/41823 (0.27%)`, after `4/42282 (0.01%)`. The 4 residuals were judged individually
  and all are true positives: a shared public dir, a Downloads/agent-tree cleanup, a literal
  `rm -rf /dev/null` (deletes the device node — the gate caught a genuine mistake), and an
  off-tree absolute build-output path the old gate also blocked. The old gate additionally
  blocked a `git commit` whose message merely mentioned the pattern — filed as evidence, not
  exaggeration.
- **Zero adversarial loss — covered.** `D:/Temp/gate-adversarial.mjs`: must-block 37/37
  (roots, home, `..` escapes, `sudo`, `find -exec`, `xargs`, interpreter bodies, assigned-vs-
  unassigned variables), must-allow 12/12. Four genuine leaks found *during* this work (relative
  `..` escape, Windows backslash tokenization, quote-early-close, segment skip after `;`) were
  fixed in the diff and each pinned with a regression test — the rewrite is safer than the rule
  it replaced, not just less annoying.
- **A2 invariant holds — covered.** `decideToolCall({bash, 'rm -rf /'})` still returns
  `{block: true, terminate: false}`; the no-terminate assertions in `pi-extension.test.mjs` are
  untouched.
- **Other shape rules untouched — covered.** `mkfs`, `dd … of=/dev/`, fork bomb,
  `--no-preserve-root` all still fire on executed text (6/6 wiring-adjacent assertions green);
  heredoc/quote/comment awareness was *extended* to them (one data/command boundary), which
  removed 4 more corpus blocks with zero true-positive loss.
- **Scope creep:** none. No retry/timeout/compaction/quota/baseUrl change; no other client
  touched (Pi-extension-only files); no VERSION bump (release action, not taken).

## Verification evidence (real runs, post-commit tree)

- `node --test pi-gate-targets + pi-extension`: **29/29 pass**.
- `node gate-adversarial.mjs`: **37/37 block, 12/12 allow**.
- `node final-residual.mjs` over live `~/.pi/agent/sessions`: **scanned=42282 blocked=4**.
- `node --test test-suite-wiring`: **6/6 pass**.
- `npm run test:affected` (final tree): **2356 tests, 2347 pass, 0 fail** (9 skipped, pre-existing).

## Summary

Standards: 0 blocking findings (1 advisory: 465-line file vs 400-line soft budget, rationale
recorded above). Spec: 0 findings. Merge door: **two-way** — pure local files under
`packages/aios-pi/` + tests, no shared state, no migration, revert is one `git revert`; blast
radius is the Pi extension only, and installed copies keep running the old gate until update, so
no existing user changes behavior at merge time. Verdict `pass` — the gate-rewrite slice is
closed to the same evidence standard as work-1…work-4.
