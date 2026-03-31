import argparse
import csv
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_FEATURE_DB = BASE_DIR / "data" / "features.db"
DEFAULT_RULES_CSV = BASE_DIR / "shortlist_rules.csv"
ALLOWED_SHORTLISTS = {"newsale", "upsell"}


@dataclass(frozen=True)
class ShortlistRule:
    rule_group: str
    rule_name: str
    shortlist_label: str
    field_name: str
    match_type: str
    match_value: str
    score_delta: int
    priority_order: int
    notes: str


def connect_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def log(message: str) -> None:
    print(f"[shortlist] {message}")


def normalize_spaces(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def normalize_label(value: Any) -> str:
    return normalize_spaces(value).casefold()


def blankish(value: Any) -> bool:
    return normalize_label(value) in {"", "blank", "null", "none"}


def to_float(value: Any) -> float:
    if value is None:
        return 0.0
    text = normalize_spaces(value)
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def eq_match(left: Any, right: str) -> bool:
    if normalize_label(right) == "blank":
        return blankish(left)
    return normalize_label(left) == normalize_label(right)


def in_match(left: Any, right: str) -> bool:
    options = [item for item in (normalize_spaces(part) for part in right.split("|")) if item]
    return any(eq_match(left, option) for option in options)


def range_count_match(value: Any, descriptor: str) -> bool:
    count = int(to_float(value))
    text = normalize_spaces(descriptor)
    if text.endswith("+"):
        return count >= int(text[:-1])
    if "-" in text:
        start_text, end_text = text.split("-", 1)
        return int(start_text) <= count <= int(end_text)
    return count == int(text)


def range_score_match(value: Any, descriptor: str) -> bool:
    score = to_float(value)
    text = normalize_spaces(descriptor)
    if text.endswith("+"):
        return score >= float(text[:-1])
    if "-" in text:
        start_text, end_text = text.split("-", 1)
        return float(start_text) <= score <= float(end_text)
    return score == float(text)


def composite_match(row: sqlite3.Row, descriptor: str) -> bool:
    clauses = [normalize_spaces(part) for part in descriptor.split(";") if normalize_spaces(part)]
    for clause in clauses:
        if "=" not in clause:
            return False
        key, expected = clause.split("=", 1)
        key = normalize_spaces(key)
        expected = normalize_spaces(expected)

        if key.endswith("_not_in"):
            field_name = key[:-7]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if in_match(row[field_name], expected):
                return False
            continue

        if key.endswith("_in"):
            field_name = key[:-3]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if not in_match(row[field_name], expected):
                return False
            continue

        if key.endswith("_gte"):
            field_name = key[:-4]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if to_float(row[field_name]) < float(expected):
                return False
            continue

        if key.endswith("_lte"):
            field_name = key[:-4]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if to_float(row[field_name]) > float(expected):
                return False
            continue

        if key.endswith("_gt"):
            field_name = key[:-3]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if to_float(row[field_name]) <= float(expected):
                return False
            continue

        if key.endswith("_lt"):
            field_name = key[:-3]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            if to_float(row[field_name]) >= float(expected):
                return False
            continue

        if key.endswith("_blank"):
            field_name = key[:-6]
            if field_name not in row.keys():
                raise ValueError(f"Unknown field '{field_name}' in composite rule: {descriptor}")
            expected_blank = normalize_label(expected) in {"1", "true", "yes"}
            if blankish(row[field_name]) != expected_blank:
                return False
            continue

        if key not in row.keys():
            raise ValueError(f"Unknown field '{key}' in composite rule: {descriptor}")
        if not eq_match(row[key], expected):
            return False
    return True


def match_rule(row: sqlite3.Row, rule: ShortlistRule) -> bool:
    value = row[rule.field_name] if rule.field_name in row.keys() else None
    if rule.match_type == "eq":
        return eq_match(value, rule.match_value)
    if rule.match_type == "in":
        return in_match(value, rule.match_value)
    if rule.match_type == "range_count":
        return range_count_match(value, rule.match_value)
    if rule.match_type == "range_score":
        return range_score_match(value, rule.match_value)
    if rule.match_type == "composite":
        return composite_match(row, rule.match_value)
    raise ValueError(f"Unsupported match_type: {rule.match_type}")


def load_rules(rules_csv: Path) -> list[ShortlistRule]:
    required_columns = {
        "rule_group",
        "rule_name",
        "shortlist_label",
        "field_name",
        "match_type",
        "match_value",
        "score_delta",
        "priority_order",
        "is_active",
        "notes",
    }
    with rules_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("shortlist_rules.csv is empty or missing a header.")
        missing_columns = required_columns - set(reader.fieldnames)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"shortlist_rules.csv missing required columns: {missing}")

        rules: list[ShortlistRule] = []
        for raw in reader:
            is_active = normalize_label(raw.get("is_active"))
            if is_active not in {"1", "true", "yes"}:
                continue
            label = normalize_spaces(raw.get("shortlist_label"))
            if label not in ALLOWED_SHORTLISTS:
                raise ValueError(
                    f"Unsupported shortlist_label '{label}' in rule '{raw.get('rule_name')}'."
                )
            rules.append(
                ShortlistRule(
                    rule_group=normalize_spaces(raw.get("rule_group")),
                    rule_name=normalize_spaces(raw.get("rule_name")),
                    shortlist_label=label,
                    field_name=normalize_spaces(raw.get("field_name")),
                    match_type=normalize_spaces(raw.get("match_type")),
                    match_value=normalize_spaces(raw.get("match_value")),
                    score_delta=int(raw.get("score_delta") or 0),
                    priority_order=int(raw.get("priority_order") or 0),
                    notes=normalize_spaces(raw.get("notes")),
                )
            )

    if not rules:
        raise ValueError("No active shortlist rules found in shortlist_rules.csv.")

    supported_types = {"eq", "in", "range_count", "range_score", "composite"}
    seen_priorities: set[int] = set()
    for rule in rules:
        if rule.match_type not in supported_types:
            raise ValueError(
                f"Unsupported match_type '{rule.match_type}' in rule '{rule.rule_name}'."
            )
        if not rule.field_name:
            raise ValueError(f"Rule '{rule.rule_name}' is missing field_name.")
        if rule.priority_order in seen_priorities:
            raise ValueError(f"Duplicate priority_order {rule.priority_order} in shortlist_rules.csv.")
        seen_priorities.add(rule.priority_order)

    return sorted(rules, key=lambda item: (item.priority_order, item.rule_name))


def ensure_shortlist_columns(conn: sqlite3.Connection) -> None:
    existing_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(customer_features)").fetchall()
    }
    required_columns = {
        "primary_shortlist": "TEXT",
        "primary_shortlist_score": "INTEGER",
        "primary_shortlist_reason": "TEXT",
        "primary_shortlist_evidence_json": "TEXT",
        "shortlist_built_at": "TEXT",
    }
    for column_name, column_type in required_columns.items():
        if column_name not in existing_columns:
            log(f"Adding missing column: {column_name}")
            conn.execute(
                f"ALTER TABLE customer_features ADD COLUMN {column_name} {column_type}"
            )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_features_primary_shortlist ON customer_features(primary_shortlist)"
    )
    conn.commit()


def build_reason(rule: ShortlistRule, row: sqlite3.Row) -> str:
    return (
        f"{rule.rule_name} -> {rule.shortlist_label} "
        f"(segment={row['customer_segment']}, score={row['priority_score']}, orders={row['approved_order_count']})"
    )


def build_evidence(rule: ShortlistRule, row: sqlite3.Row) -> str:
    payload = {
        "matched_rule": rule.rule_name,
        "rule_group": rule.rule_group,
        "shortlist_label": rule.shortlist_label,
        "priority_order": rule.priority_order,
        "customer_segment": row["customer_segment"],
        "priority_score": row["priority_score"],
        "approved_order_count": row["approved_order_count"],
        "relation_name": row["relation_name"],
        "funnel_stage": row["funnel_stage"],
        "last_touch_at": row["last_touch_at"],
        "owned_product_names_norm": row["owned_product_names_norm"],
    }
    return json.dumps(payload, ensure_ascii=False)


def shortlist_row(row: sqlite3.Row, rules: list[ShortlistRule], built_at: str) -> tuple[Any, ...]:
    for rule in rules:
        if match_rule(row, rule):
            shortlist_score = int(to_float(row["priority_score"]))
            return (
                rule.shortlist_label,
                shortlist_score,
                build_reason(rule, row),
                build_evidence(rule, row),
                built_at,
                row["id_1"],
            )
    return (None, None, None, None, None, row["id_1"])


def now_iso() -> str:
    from datetime import datetime

    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def segment_customers(feature_db: Path, rules_csv: Path) -> str:
    if not feature_db.exists():
        raise FileNotFoundError(f"features.db not found: {feature_db}")
    if not rules_csv.exists():
        raise FileNotFoundError(f"shortlist_rules.csv not found: {rules_csv}")

    rules = load_rules(rules_csv)
    log(f"Rule CSV: {rules_csv}")
    log(f"Active rules: {len(rules)}")

    built_at = now_iso()
    with connect_db(feature_db) as conn:
        ensure_shortlist_columns(conn)
        rows = conn.execute("SELECT * FROM customer_features").fetchall()
        updates = [shortlist_row(row, rules, built_at) for row in rows]
        conn.executemany(
            """
            UPDATE customer_features
            SET
                primary_shortlist = ?,
                primary_shortlist_score = ?,
                primary_shortlist_reason = ?,
                primary_shortlist_evidence_json = ?,
                shortlist_built_at = ?
            WHERE id_1 = ?
            """,
            updates,
        )
        conn.commit()

        counts = {
            "newsale": conn.execute(
                "SELECT COUNT(*) FROM customer_features WHERE primary_shortlist = 'newsale'"
            ).fetchone()[0],
            "upsell": conn.execute(
                "SELECT COUNT(*) FROM customer_features WHERE primary_shortlist = 'upsell'"
            ).fetchone()[0],
            "null": conn.execute(
                "SELECT COUNT(*) FROM customer_features WHERE primary_shortlist IS NULL"
            ).fetchone()[0],
            "rows": conn.execute("SELECT COUNT(*) FROM customer_features").fetchone()[0],
        }

        invalid_scored_rows = conn.execute(
            """
            SELECT COUNT(*)
            FROM customer_features
            WHERE primary_shortlist IS NOT NULL
              AND primary_shortlist_score IS NULL
            """
        ).fetchone()[0]
        if invalid_scored_rows:
            raise RuntimeError(
                f"Found {invalid_scored_rows} shortlisted rows with NULL primary_shortlist_score."
            )

    log(f"Processed rows: {counts['rows']}")
    log(f"newsale: {counts['newsale']}")
    log(f"upsell: {counts['upsell']}")
    log(f"null: {counts['null']}")
    return "Shortlist update completed."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply CSV-driven shortlist rules to customer_features."
    )
    parser.add_argument(
        "--feature-db",
        default=str(DEFAULT_FEATURE_DB),
        help="Path to features.db.",
    )
    parser.add_argument(
        "--rules-csv",
        default=str(DEFAULT_RULES_CSV),
        help="Path to shortlist_rules.csv.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    message = segment_customers(
        feature_db=Path(args.feature_db),
        rules_csv=Path(args.rules_csv),
    )
    print(message)


if __name__ == "__main__":
    main()
