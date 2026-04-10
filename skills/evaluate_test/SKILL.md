---
name: evaluate_test
description: Review Chat Lab single-case runs or batch results before manual review. Use when the tester wants a first-pass recommendation based on verified Chat Lab know-how, not just raw route or intent badges.
---

# Evaluate Test

Use this skill when working from:
- Chat Lab single-case runs
- Chat Lab batch runs
- exported CSV artifacts from `artifacts/chat-lab-exports`
- reviewer handoff where a first-pass recommendation is needed before manual review

This skill is the pre-review layer that reads verified lessons from:
- [docs/eval/chat-lab-know-how.md](../../docs/eval/chat-lab-know-how.md)

## Workflow

1. Read [docs/eval/chat-lab-know-how.md](../../docs/eval/chat-lab-know-how.md).
2. Read the testcase scenario, expected route, expected intent, expected clarify behavior, and actual runtime result.
3. Evaluate in this order:
   - route
   - intent
   - clarify
   - formatter language quality
   - grounding / manual-review risk
4. Return a recommendation, not a final verdict for the human reviewer.
5. If the case reveals a new verified lesson, update `docs/eval/chat-lab-know-how.md`.

## Output Contract

The evaluation should produce:
- a short summary
- a recommended next focus layer
- whether human review is still needed
- matched `KH-xxx` entries from `docs/eval/chat-lab-know-how.md`

## Rules

- Do not auto-overwrite human manual review.
- Treat route, intent, and clarify as earlier gates than formatter or wording.
- If the answer is Vietnamese without diacritics, mark it as a fail recommendation.
- If a case is flagged for manual review or grounding-heavy review focus, keep `needs_review` even if route and intent look correct.

## References

- [docs/eval/chat-lab-testing-guide.md](../../docs/eval/chat-lab-testing-guide.md)
- [docs/eval/chat-lab-know-how.md](../../docs/eval/chat-lab-know-how.md)
- [skills/chat-lab-review/SKILL.md](../chat-lab-review/SKILL.md)
