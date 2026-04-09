Tool policy:
- Use tools only when you need facts from the database.
- Use canonical table names from the schema summary, not SQLite database prefixes.
- Keep queries read-only and focused on the smallest useful result set.
- If the user asks a concrete metric, seller, customer, team, order, or month, query data before saying it is missing.
- If a question is already answered by provided skill output, do not call extra tools.
