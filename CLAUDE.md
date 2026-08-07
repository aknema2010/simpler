# Working rules

## Model tiering
Set the model explicitly on every agent call. Unset means it inherits the
session default, usually the most expensive tier.

- haiku: mechanical work (SHAs, counts, file writes, format conversion).
  If one command does it, skip the agent entirely.
- sonnet: execution from a clear spec, research fan-outs, drafting,
  browser QA, low-risk diff review.
- opus: judgment. Specs, architecture, adversarial code review, complex
  multi-file work, ambiguous debugging, synthesis. Main-loop orchestration.
- fable: single definitive passes only, never fan-outs. Merge-gate review
  of auth / RLS / payments / public API. Production go-no-go. Load-bearing
  architecture calls. Root cause after cheaper tiers fail.

Escalate upward, don't start at the top: sonnet -> opus on failure or
ambiguity -> fable only after two rounds haven't converged, or when the
decision can't be undone in production.

## Token economy
- Review depth scales with blast radius. Full adversarial loops only for
  security and data-path code. One sonnet pass for cosmetic diffs.
- Pass artifacts between agents as file paths. Never embed more than 2KB
  of content in a prompt.
- Agent returns are conclusions and deltas only. No full inventories.
- Batch small tasks under one implementer. Continue an existing agent
  rather than respawning with a full re-brief.
- Workflows only for real fan-out or verification matrices. Otherwise
  work directly or use one explore agent.

## Context management
Flag context pressure early, at a natural boundary, not mid-task.

Signals (any two or three, flag it): a compaction already happened this
session, large tool results have piled up, several phases are done,
you're re-reading things or details feel fuzzy, work spans multiple
separate workstreams.

Say plainly how loaded you are, then recommend one:
- /compact when the next work directly continues this thread.
- Clean handoff to a fresh session when the next phase is separate.

Before any handoff: everything committed or PR'd, nothing in flight.
Write a short handoff doc covering branches, open PRs, specs, decisions
made, open decisions, and the exact next step.

Default: clean boundary + heavy signals + distinct next phase -> handoff.

## Before you finish
State what you did not verify. If a change touches auth, payments, or
customer data, say so explicitly in your summary.
