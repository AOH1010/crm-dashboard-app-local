---
name: continuity
description: Maintain and consult the shared repo continuity file so any agent can continue, resume, pick up where work left off, or hand off work without rebuilding context. Use whenever working in this repository on anything beyond a trivial one-file reply, especially when the user asks to continue previous work, resume from earlier progress, read old context, avoid starting over, perform multi-step refactors, debug interrupted work, or prepare a handoff for another agent.
---

# Continuity

Use `docs/continuity.md` as the canonical shared memory file for this repository.

## Workflow

1. Read `docs/continuity.md` before doing substantial work.
2. Follow the `Required Reading` section in `docs/continuity.md` before touching AI chat, Chat Lab, eval datasets, or related docs.
3. If `docs/continuity.md` is missing, create it from `references/continuity-template.md`.
4. Update the file after context-building when you understand the task shape.
5. Update the file again after meaningful implementation, cleanup, or debugging milestones.
6. Update the file one last time before finishing the turn if the repo state changed or the next agent would benefit.

## Required Updates

Keep updates concise, factual, and easy to skim.

- Refresh `Current Objective` when the task focus changes.
- Refresh `Current State` when architecture, paths, scripts, or runtime behavior changes.
- Refresh `Recent Changes` with the highest-signal implementation notes only.
- Refresh `Validation` with commands actually run and whether they passed.
- Refresh `Open Issues` and `Next Steps` when something remains unresolved.

## Writing Rules

- Prefer bullets over paragraphs.
- Record paths and commands exactly when they matter.
- Record decisions, not every thought.
- Record blockers, quirks, and environment issues that could waste the next agent's time.
- Do not paste large logs.
- Do not store secrets, tokens, or sensitive values.
- Do not rewrite the whole file every time when a small update will do.

## When To Update Immediately

- After renaming or moving paths.
- After introducing or deleting scripts, skills, tools, or modules.
- After changing the local-run workflow.
- After discovering a hidden environment issue, lock, port conflict, or dependency quirk.
- Before stopping work with partial progress still in flight.

## References

- Use `references/continuity-template.md` for the expected file shape.
- Use `docs/continuity.md` as the live document.
