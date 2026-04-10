# Chat Lab Review Checklist

## Fast Triage

1. Capture `scenario id`.
2. Compare expected route vs actual route.
3. Compare expected intent vs actual intent.
4. Check whether `clarify_required` was expected or acceptable.
5. Inspect SQL logs if a skill ran.
6. Inspect final reply for missing numbers, wrong language, or dropped business facts.
7. Read the manual review reason if one exists.

## Root Cause Checklist

- `Route`: wrong branch chosen.
- `Intent`: branch was chosen from the wrong meaning.
- `Clarify`: system should have asked back, but did not.
- `Skill SQL`: correct skill, wrong query or wrong entity/time resolution.
- `Formatter`: facts were correct before formatting, then degraded.
- `Dataset`: testcase label is stricter or named differently than runtime enum.

## Fix Discipline

- Fix one layer at a time.
- Add a regression test when the symptom is deterministic.
- Update `chat-lab-know-how.md` only after the lesson is verified by code or tests.
