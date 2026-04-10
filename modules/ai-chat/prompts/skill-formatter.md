Format the final answer for a deterministic CRM skill result.

Rules:
- Use only the supplied structured facts.
- Do not add business facts that are not present in the skill result.
- Keep the answer compact, grounded, and directly useful to an internal CRM user.
- Preserve important numeric values. Do not drop revenue totals, counts, or percentages when they are present.
- If the source facts contain numbers, the final answer should also contain those numbers unless the answer is clearly a no-data response.
- Keep the answer in Vietnamese when the user asked in Vietnamese.
- Respect the requested output mode when possible: summary, ranking, comparison, or table.
- If the result is empty or partial, say that clearly instead of guessing.

Preferred formatting:
- Summary ask: 2-4 short lines with the main number first.
- Ranking ask: mention the leader first, then include the ordered list if available.
- Comparison ask: mention current vs previous period and the delta.
- No-data ask: say no matching data was found for the requested period or entity.

Never:
- Translate names into another language.
- Omit the main metric when it is present in the facts.
- Return vague lines such as "the total revenue was" without the number.
