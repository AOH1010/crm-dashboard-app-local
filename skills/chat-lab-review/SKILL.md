---
name: chat-lab-review
description: Triage failed AI chat testcases from Chat Lab, exported CSV batches, or manual review notes. Use when an agent needs to inspect route, intent, clarify behavior, SQL grounding, formatter quality, and reviewer feedback before changing runtime code.
---

# Chat Lab Review

Use this skill when working from:
- Chat Lab single-case runs
- Chat Lab batch exports
- manual review notes
- `eval-50` scenario datasets

This skill is the review-and-triage layer before deeper fixes in routing, skills, SQL, or formatter behavior.

## Workflow

1. Read [docs/eval/chat-lab-testing-guide.md](../../docs/eval/chat-lab-testing-guide.md).
2. Read [docs/eval/chat-lab-know-how.md](../../docs/eval/chat-lab-know-how.md).
3. Identify the failing `scenario id`, expected outcome, actual outcome, and reviewer note.
4. Triage the failure in this order:
   - route
   - intent
   - clarify
   - SQL/data grounding
   - formatter / final reply quality
5. Fix the narrowest layer that explains the failure.
6. Add or update a regression test when the fix is deterministic enough.
7. If the fix reveals a reusable lesson, append a short verified entry to `docs/eval/chat-lab-know-how.md`.

## Triage Filter

Before editing code, answer these questions:

1. Is the route wrong?
2. Is the primary intent wrong?
3. Is the testcase label using a normalized intent alias?
4. Did the skill resolve the wrong entity, period, or filter?
5. Is SQL wrong, empty, or over-broad?
6. Is the formatter degrading an otherwise correct skill result?
7. Is this a real runtime bug or only a dataset/scoring mismatch?

Do not skip this filter. Many "AI ngu" failures are formatter or scoring failures, not routing failures.

## Where To Look

- Runtime entry: [modules/ai-chat/src/runtime/chat-runtime-v2.js](../../modules/ai-chat/src/runtime/chat-runtime-v2.js)
- Intent classifier: [modules/ai-chat/src/runtime/intent-classifier-v2.js](../../modules/ai-chat/src/runtime/intent-classifier-v2.js)
- Intent catalog: [modules/ai-chat/src/runtime/intent-catalog.js](../../modules/ai-chat/src/runtime/intent-catalog.js)
- Skill registry: [modules/ai-chat/src/runtime/skill-registry.js](../../modules/ai-chat/src/runtime/skill-registry.js)
- Formatter: [modules/ai-chat/src/runtime/skill-response-formatter.js](../../modules/ai-chat/src/runtime/skill-response-formatter.js)
- Prompt files:
  - [modules/ai-chat/prompts/intent-classifier.md](../../modules/ai-chat/prompts/intent-classifier.md)
  - [modules/ai-chat/prompts/skill-formatter.md](../../modules/ai-chat/prompts/skill-formatter.md)

## Common Failure Mapping

- Route wrong, intent wrong:
  - start in `intent-classifier-v2.js`
  - inspect `viewId`, follow-up carry-over, ambiguity threshold

- Route wrong, intent right:
  - inspect `intent-catalog.js` and `skill-registry.js`

- Skill right, SQL wrong:
  - inspect the specific skill handler

- Skill right, SQL right, answer ugly or missing numbers:
  - inspect `skill-response-formatter.js`
  - verify deterministic fallback behavior

- Chat Lab says fail but runtime behavior is actually acceptable:
  - inspect dataset normalization and scorer logic
  - check `normalizedExpectedIntent`

## Regression Rules

- Add tests for deterministic route and intent behavior whenever possible.
- Use Chat Lab manual review for grounding and wording, but do not rely on manual review alone when a deterministic regression test can be added.
- Prefer narrow regression tests named after the actual symptom.

## References

- [references/checklist.md](./references/checklist.md)
- [references/failure-patterns.md](./references/failure-patterns.md)
