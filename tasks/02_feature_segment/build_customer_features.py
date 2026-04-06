import argparse
import csv
import hashlib
import html
import json
import math
import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
TASK_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TASK_DIR.parents[1]
DEFAULT_SOURCE_DB = PROJECT_ROOT / "data" / "crm.db"
DEFAULT_FEATURE_DB = PROJECT_ROOT / "data" / "features.db"
DEFAULT_RULES_CSV = TASK_DIR / "rules" / "priority_score_rules.csv"
INTERACTION_RE = re.compile(r"^\[(?P<ts>[^\]]+)\]\s*(?P<actor>[^:]+):\s*(?P<content>.*)$")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class Rule:
    rule_group: str
    condition_label: str
    field_name: str
    match_type: str
    match_value: str
    score_delta: int
    funnel_stage: str
    priority_order: int
    notes: str


def connect_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_spaces(value: str) -> str:
    return SPACE_RE.sub(" ", value).strip()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = html.unescape(str(value))
    text = text.replace("&nbsp;", " ")
    text = TAG_RE.sub(" ", text)
    text = text.replace("---", "\n")
    return normalize_spaces(text)


def normalize_label(value: Any) -> str:
    return normalize_spaces(str(value or "")).casefold()


def blankish(value: Any) -> bool:
    return normalize_label(value) == ""


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    text = normalize_spaces(str(value))
    if not text:
        return None

    formats = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def iso_or_blank(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else ""


def max_datetime(*values: Any) -> datetime | None:
    parsed = [parse_datetime(value) for value in values]
    parsed = [value for value in parsed if value is not None]
    return max(parsed) if parsed else None


def normalize_dimension(value: Any, blank_token: str = "blank") -> str:
    text = normalize_spaces(str(value or ""))
    return text if text else blank_token


def normalize_industry(value: Any) -> str:
    text = normalize_dimension(value)
    aliases = {
        "NhÃ  cung cáº¥p/Ä‘áº¡i lÃ­": "NhÃ  cung cáº¥p/Ä‘áº¡i lÃ½",
        "Thi cÃ´ng xÃ¢y dá»±ng": "XÃ¢y dá»±ng",
    }
    return aliases.get(text, text)


def derive_industry_group(industry_name_norm: str) -> str:
    if industry_name_norm == "blank":
        return "blank"
    core_fit = {
        "Ná»™i tháº¥t",
        "Gáº¡ch",
        "XÃ¢y dá»±ng",
        "Kiáº¿n trÃºc sÆ°",
        "NhÃ  cung cáº¥p/Ä‘áº¡i lÃ½",
        "Váº­t liá»‡u xÃ¢y dá»±ng",
    }
    return industry_name_norm if industry_name_norm in core_fit else "other"


def derive_source_group(source_name: str) -> str:
    label = normalize_label(source_name)
    if not label:
        return "blank"
    if "website" in label or "phá»…u marketing" in label or "chat gpt" in label:
        return "inbound"
    if "affiliate" in label or "giá»›i thiá»‡u" in label:
        return "referral"
    if "vietbuild" in label or "event" in label:
        return "event"
    if "facebook" in label or "zalo" in label or "tiktok" in label:
        return "social"
    if "sale tá»± kiáº¿m" in label or "Ä‘i thá»‹ trÆ°á»ng" in label:
        return "outbound"
    return "other"


def extract_interactions(raw_text: Any) -> tuple[list[dict[str, Any]], str]:
    text = html.unescape(str(raw_text or ""))
    text = text.replace("&nbsp;", " ")
    text = TAG_RE.sub(" ", text)
    lines = [line.strip() for line in text.splitlines()]

    events: list[dict[str, Any]] = []
    for line in lines:
        normalized_line = normalize_spaces(line.replace("---", " "))
        if not normalized_line:
            continue
        match = INTERACTION_RE.match(normalized_line)
        if match:
            ts_text = normalize_spaces(match.group("ts"))
            actor = normalize_spaces(match.group("actor"))
            content = normalize_spaces(match.group("content"))
            events.append(
                {
                    "timestamp": parse_datetime(ts_text),
                    "timestamp_raw": ts_text,
                    "actor": actor,
                    "content": content,
                }
            )
            continue
        if events:
            events[-1]["content"] = normalize_spaces(
                f"{events[-1]['content']} {normalized_line}"
            )

    events.sort(key=lambda item: item["timestamp"] or datetime.min, reverse=True)
    clean_lines = [
        f"[{event['timestamp_raw']}] {event['actor']}: {event['content']}"
        for event in events
        if event["actor"] or event["content"]
    ]
    return events, "\n".join(clean_lines)


def extract_keywords(text: str) -> list[str]:
    patterns = {
        "demo": r"\bdemo\b",
        "bÃ¡o giÃ¡": r"bÃ¡o giÃ¡",
        "quan tÃ¢m": r"quan tÃ¢m",
        "gia háº¡n": r"gia háº¡n",
        "tÃ¡i kÃ½": r"tÃ¡i kÃ½|tÃ¡i kÃ­",
        "khÃ´ng nghe mÃ¡y": r"khÃ´ng nghe mÃ¡y",
        "add zalo": r"add zalo|zalo",
        "gá»i láº¡i": r"gá»i láº¡i|liÃªn há»‡ láº¡i|háº¹n",
    }
    lowered = normalize_label(text)
    return [label for label, pattern in patterns.items() if re.search(pattern, lowered)]


def summarize_history(
    events: list[dict[str, Any]], order_count: int, approved_order_count: int
) -> str:
    if not events:
        if order_count:
            return f"No interaction log. Orders={order_count}, approved_orders={approved_order_count}."
        return "No interaction log."

    latest = events[0]
    latest_ts = latest["timestamp_raw"] or "unknown_time"
    latest_actor = latest["actor"] or "unknown_actor"
    latest_content = latest["content"][:160]
    recent_notes = "; ".join(event["content"][:80] for event in events[:3] if event["content"])
    return (
        f"Latest interaction {latest_ts} by {latest_actor}: {latest_content}. "
        f"Recent notes: {recent_notes}. "
        f"Orders={order_count}, approved_orders={approved_order_count}."
    )


def parse_products_json(raw_value: Any) -> list[str]:
    if blankish(raw_value):
        return []
    try:
        items = json.loads(raw_value)
    except (TypeError, json.JSONDecodeError):
        return []

    products: list[str] = []
    for item in items or []:
        name = normalize_spaces(str((item or {}).get("product_name") or ""))
        if name:
            products.append(name)
    return products


def build_order_aggregates(source_db: Path) -> dict[str, dict[str, Any]]:
    aggregates: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "order_count": 0,
            "approved_order_count": 0,
            "cancelled_order_count": 0,
            "pending_order_count": 0,
            "approved_revenue": 0.0,
            "total_paid_amount": 0.0,
            "last_order_date": None,
            "owned_products": set(),
        }
    )

    with connect_db(source_db) as conn:
        rows = conn.execute(
            """
            SELECT id_1, status_label, payment_status, real_amount, order_date, products_json
            FROM orders
            """
        ).fetchall()

    for row in rows:
        customer_id = normalize_spaces(str(row["id_1"] or ""))
        if not customer_id:
            continue
        item = aggregates[customer_id]
        item["order_count"] += 1

        status_label = normalize_spaces(str(row["status_label"] or ""))
        payment_status = normalize_spaces(str(row["payment_status"] or ""))
        amount = float(row["real_amount"] or 0.0)

        order_dt = parse_datetime(row["order_date"])
        if order_dt and (item["last_order_date"] is None or order_dt > item["last_order_date"]):
            item["last_order_date"] = order_dt

        if status_label == "ÄÃ£ duyá»‡t":
            item["approved_order_count"] += 1
            item["approved_revenue"] += amount
            for product_name in parse_products_json(row["products_json"]):
                item["owned_products"].add(product_name)
        elif status_label == "ÄÃ£ há»§y":
            item["cancelled_order_count"] += 1
        elif status_label == "Chá» duyá»‡t":
            item["pending_order_count"] += 1

        if payment_status == "ÄÃ£ thu":
            item["total_paid_amount"] += amount

    for item in aggregates.values():
        approved = item["approved_order_count"]
        pending = item["pending_order_count"]
        cancelled = item["cancelled_order_count"]
        total = item["order_count"]
        if approved > 0:
            item["order_status_profile"] = "has_approved"
        elif total == 0:
            item["order_status_profile"] = "no_orders"
        elif pending > 0 and cancelled == 0 and pending == total:
            item["order_status_profile"] = "only_pending"
        elif cancelled > 0 and cancelled == total:
            item["order_status_profile"] = "only_cancelled"
        else:
            item["order_status_profile"] = "mixed_non_approved"

        owned_products = sorted(item["owned_products"])
        item["owned_product_names_norm"] = " | ".join(owned_products) if owned_products else "blank"
        item["has_orders"] = 1 if total > 0 else 0
        item["last_order_date"] = iso_or_blank(item["last_order_date"])

    return aggregates


def percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * q
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return sorted_values[int(pos)]
    fraction = pos - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction


def build_revenue_quartiles(order_aggregates: dict[str, dict[str, Any]]) -> dict[str, str]:
    positive_values = sorted(
        item["approved_revenue"]
        for item in order_aggregates.values()
        if item["approved_revenue"] > 0
    )
    if not positive_values:
        return {}

    p50 = percentile(positive_values, 0.50)
    p75 = percentile(positive_values, 0.75)
    quartiles: dict[str, str] = {}
    for customer_id, item in order_aggregates.items():
        revenue = item["approved_revenue"]
        if revenue <= 0:
            quartiles[customer_id] = "none"
        elif revenue >= p75:
            quartiles[customer_id] = "top_25"
        elif revenue >= p50:
            quartiles[customer_id] = "q25_50"
        else:
            quartiles[customer_id] = "lower_50"
    return quartiles


def load_rules(rules_csv: Path) -> list[Rule]:
    rules: list[Rule] = []
    with rules_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            is_active = normalize_spaces(str(raw.get("is_active") or "0"))
            if is_active not in {"1", "true", "True"}:
                continue
            rules.append(
                Rule(
                    rule_group=normalize_spaces(raw.get("rule_group") or ""),
                    condition_label=normalize_spaces(raw.get("condition_label") or ""),
                    field_name=normalize_spaces(raw.get("field_name") or ""),
                    match_type=normalize_spaces(raw.get("match_type") or ""),
                    match_value=normalize_spaces(raw.get("match_value") or ""),
                    score_delta=int(raw.get("score_delta") or 0),
                    funnel_stage=normalize_spaces(raw.get("funnel_stage") or ""),
                    priority_order=int(raw.get("priority_order") or 0),
                    notes=normalize_spaces(raw.get("notes") or ""),
                )
            )
    rules.sort(key=lambda rule: (rule.priority_order, rule.condition_label))
    return rules


def validate_rules(rules: list[Rule]) -> None:
    supported_match_types = {"eq", "in", "contains", "range_days", "range_count", "composite"}
    errors: list[str] = []
    seen_priorities: set[int] = set()

    if not rules:
        errors.append("No active rules found in priority_score_rules.csv.")

    for rule in rules:
        if rule.match_type not in supported_match_types:
            errors.append(
                f"Unsupported match_type '{rule.match_type}' in rule '{rule.condition_label}'."
            )
        if not rule.field_name:
            errors.append(f"Missing field_name in rule '{rule.condition_label}'.")
        if rule.priority_order in seen_priorities:
            errors.append(f"Duplicate priority_order {rule.priority_order}.")
        seen_priorities.add(rule.priority_order)

    if errors:
        raise ValueError("\n".join(errors))


def eq_match(left: Any, right: str) -> bool:
    if right == "blank":
        return blankish(left) or normalize_label(left) == "blank"
    return normalize_label(left) == normalize_label(right)


def in_match(left: Any, right: str) -> bool:
    options = [normalize_spaces(item) for item in right.split("|") if normalize_spaces(item)]
    return any(eq_match(left, option) for option in options)


def contains_match(left: Any, right: str) -> bool:
    haystack = normalize_label(left)
    if not haystack:
        return False
    patterns = [normalize_spaces(item) for item in right.split("|") if normalize_spaces(item)]
    return any(normalize_label(pattern) in haystack for pattern in patterns)


def range_days_match(value: Any, descriptor: str, reference_date: date) -> bool:
    dt = parse_datetime(value)
    if dt is None:
        return descriptor == "90+"
    days = (reference_date - dt.date()).days
    if descriptor.endswith("+"):
        return days >= int(descriptor[:-1])
    start_text, end_text = descriptor.split("-", 1)
    return int(start_text) <= days <= int(end_text)


def range_count_match(value: Any, descriptor: str) -> bool:
    count = int(value or 0)
    if descriptor.endswith("+"):
        return count >= int(descriptor[:-1])
    return count == int(descriptor)


def composite_match(row: dict[str, Any], descriptor: str, reference_date: date) -> bool:
    clauses = [normalize_spaces(item) for item in descriptor.split(";") if normalize_spaces(item)]
    for clause in clauses:
        if "=" not in clause:
            return False
        key, expected = clause.split("=", 1)
        key = normalize_spaces(key)
        expected = normalize_spaces(expected)

        if key.endswith("_in"):
            field_name = key[:-3]
            if not in_match(row.get(field_name, ""), expected):
                return False
            continue

        if key.endswith("_gte"):
            field_name = key[:-4]
            if float(row.get(field_name, 0) or 0) < float(expected):
                return False
            continue

        if key == "updated_within_days":
            updated_at = parse_datetime(row.get("updated_at_1"))
            if updated_at is None:
                return False
            if (reference_date - updated_at.date()).days > int(expected):
                return False
            continue

        if key.endswith("_within_days"):
            field_name = key[: -len("_within_days")]
            dt = parse_datetime(row.get(field_name))
            if dt is None:
                return False
            if (reference_date - dt.date()).days > int(expected):
                return False
            continue

        if not eq_match(row.get(key, ""), expected):
            return False
    return True


def apply_rules(row: dict[str, Any], rules: list[Rule], reference_date: date) -> tuple[int, str, str]:
    score = 0
    funnel_stage = "unclassified"
    hits: list[dict[str, Any]] = []

    for rule in rules:
        value = row.get(rule.field_name)
        matched = False

        if rule.match_type == "eq":
            matched = eq_match(value, rule.match_value)
        elif rule.match_type == "in":
            matched = in_match(value, rule.match_value)
        elif rule.match_type == "contains":
            matched = contains_match(value, rule.match_value)
        elif rule.match_type == "range_days":
            matched = range_days_match(value, rule.match_value, reference_date)
        elif rule.match_type == "range_count":
            matched = range_count_match(value, rule.match_value)
        elif rule.match_type == "composite":
            matched = composite_match(row, rule.match_value, reference_date)

        if not matched:
            continue

        score += rule.score_delta
        if rule.funnel_stage:
            funnel_stage = rule.funnel_stage
        hits.append(
            {
                "rule_group": rule.rule_group,
                "condition_label": rule.condition_label,
                "score_delta": rule.score_delta,
                "priority_order": rule.priority_order,
            }
        )

    score = max(0, min(100, score))
    return score, funnel_stage, json.dumps(hits, ensure_ascii=False)


def derive_customer_segment(funnel_stage: str, approved_order_count: int, relation_name: str) -> str:
    if normalize_label(relation_name) in {
        normalize_label("RÃ¡c"),
        normalize_label("Sai ThÃ´ng Tin"),
        normalize_label("Tháº¥t báº¡i"),
        normalize_label("KhÃ´ng tiáº¿p cáº­n Ä‘Æ°á»£c"),
    }:
        return "lost_or_invalid"
    if approved_order_count > 0:
        return "existing_customer"
    if funnel_stage == "proposal":
        return "hot_lead"
    if funnel_stage == "demo":
        return "demo_lead"
    if funnel_stage in {"qualified", "contacting", "new"}:
        return "active_lead"
    if funnel_stage == "inactive":
        return "nurture"
    return "unclassified"


def build_feature_row(
    customer: sqlite3.Row,
    order_info: dict[str, Any],
    revenue_quartile: str,
    rules: list[Rule],
    reference_date: date,
    built_at: str,
) -> tuple[Any, ...]:
    events, interaction_clean = extract_interactions(customer["latest_interaction"])
    last_interaction_at = iso_or_blank(events[0]["timestamp"]) if events else ""
    last_actor = events[0]["actor"] if events else ""
    interaction_keywords = extract_keywords(interaction_clean)
    last_touch_at = iso_or_blank(
        max_datetime(customer["updated_at_1"], last_interaction_at, order_info["last_order_date"])
    )

    industry_name_norm = normalize_industry(customer["industry_name"])
    relation_name_norm = normalize_dimension(customer["relation_name"])
    source_name = normalize_dimension(customer["account_source_full_name"])
    province_norm = normalize_dimension(customer["province_name"])
    industry_group = derive_industry_group(industry_name_norm)

    feature_context = {
        "relation_name": customer["relation_name"] or "",
        "last_touch_at": last_touch_at,
        "interaction_clean": interaction_clean,
        "approved_order_count": order_info["approved_order_count"],
        "order_status_profile": order_info["order_status_profile"],
        "approved_revenue_quartile": revenue_quartile,
        "industry_name": industry_name_norm,
        "industry_group": industry_group,
        "account_source_full_name": source_name,
        "updated_at_1": customer["updated_at_1"] or "",
        "owned_product_names_norm": order_info["owned_product_names_norm"],
    }

    priority_score, funnel_stage, rule_hits_json = apply_rules(
        feature_context,
        rules,
        reference_date,
    )
    customer_segment = derive_customer_segment(
        funnel_stage,
        order_info["approved_order_count"],
        str(customer["relation_name"] or ""),
    )

    return (
        normalize_spaces(str(customer["id_1"] or "")),
        customer["title"] or "",
        customer["phone_office"] or "",
        customer["email"] or "",
        customer["industry_name"] or "",
        industry_name_norm,
        industry_group,
        customer["mgr_display_name"] or "",
        customer["relation_name"] or "",
        relation_name_norm,
        customer["account_source_full_name"] or "",
        derive_source_group(source_name),
        customer["province_name"] or "",
        province_norm,
        customer["latest_interaction"] or "",
        interaction_clean,
        json.dumps(interaction_keywords, ensure_ascii=False),
        len(events),
        last_interaction_at,
        last_actor,
        summarize_history(
            events,
            order_info["order_count"],
            order_info["approved_order_count"],
        ),
        order_info["has_orders"],
        order_info["order_count"],
        order_info["approved_order_count"],
        order_info["cancelled_order_count"],
        order_info["pending_order_count"],
        order_info["approved_revenue"],
        order_info["total_paid_amount"],
        revenue_quartile,
        order_info["last_order_date"],
        order_info["order_status_profile"],
        order_info["owned_product_names_norm"],
        customer["created_at_1"] or "",
        customer["updated_at_1"] or "",
        last_touch_at,
        funnel_stage,
        customer_segment,
        priority_score,
        rule_hits_json,
        built_at,
        None,
        None,
        None,
        None,
        None,
    )


def init_feature_db(feature_db: Path) -> None:
    feature_db.parent.mkdir(parents=True, exist_ok=True)
    with connect_db(feature_db) as conn:
        conn.executescript(
            """
            DROP TABLE IF EXISTS customer_features;
            DROP TABLE IF EXISTS feature_build_meta;

            CREATE TABLE customer_features (
                id_1 TEXT PRIMARY KEY,
                title TEXT,
                phone_office TEXT,
                email TEXT,
                industry_name TEXT,
                industry_name_norm TEXT,
                industry_group TEXT,
                mgr_display_name TEXT,
                relation_name TEXT,
                relation_name_norm TEXT,
                account_source_full_name TEXT,
                source_group TEXT,
                province_name TEXT,
                province_norm TEXT,
                latest_interaction_raw TEXT,
                interaction_clean TEXT,
                interaction_keywords TEXT,
                interaction_count INTEGER,
                last_interaction_at TEXT,
                last_actor TEXT,
                relationship_history_summary TEXT,
                has_orders INTEGER,
                order_count INTEGER,
                approved_order_count INTEGER,
                cancelled_order_count INTEGER,
                pending_order_count INTEGER,
                approved_revenue REAL,
                total_paid_amount REAL,
                approved_revenue_quartile TEXT,
                last_order_date TEXT,
                order_status_profile TEXT,
                owned_product_names_norm TEXT,
                created_at_1 TEXT,
                updated_at_1 TEXT,
                last_touch_at TEXT,
                funnel_stage TEXT,
                customer_segment TEXT,
                priority_score INTEGER,
                priority_rule_hits_json TEXT,
                built_at TEXT,
                primary_shortlist TEXT,
                primary_shortlist_score INTEGER,
                primary_shortlist_reason TEXT,
                primary_shortlist_evidence_json TEXT,
                shortlist_built_at TEXT
            );

            CREATE TABLE feature_build_meta (
                meta_key TEXT PRIMARY KEY,
                meta_value TEXT NOT NULL
            );

            CREATE INDEX idx_features_priority_score ON customer_features(priority_score);
            CREATE INDEX idx_features_customer_segment ON customer_features(customer_segment);
            CREATE INDEX idx_features_funnel_stage ON customer_features(funnel_stage);
            CREATE INDEX idx_features_last_touch_at ON customer_features(last_touch_at);
            CREATE INDEX idx_features_primary_shortlist ON customer_features(primary_shortlist);
            """
        )


def get_existing_meta(feature_db: Path) -> dict[str, str]:
    if not feature_db.exists():
        return {}
    try:
        with connect_db(feature_db) as conn:
            rows = conn.execute(
                "SELECT meta_key, meta_value FROM feature_build_meta"
            ).fetchall()
    except sqlite3.DatabaseError:
        return {}
    return {row["meta_key"]: row["meta_value"] for row in rows}


def get_build_inputs(source_db: Path, rules_csv: Path) -> dict[str, str]:
    return {
        "source_db_path": str(source_db),
        "source_db_mtime_ns": str(source_db.stat().st_mtime_ns),
        "source_db_size": str(source_db.stat().st_size),
        "rules_csv_path": str(rules_csv),
        "rules_sha256": file_sha256(rules_csv),
    }


def determine_build_mode(
    source_db: Path, feature_db: Path, rules_csv: Path, force: bool
) -> tuple[str, str, dict[str, str], dict[str, str]]:
    current_inputs = get_build_inputs(source_db, rules_csv)
    meta = get_existing_meta(feature_db)

    if force or not feature_db.exists():
        reason = "forced rebuild requested" if force else "features.db does not exist"
        return "full", reason, current_inputs, meta
    if not meta or not meta.get("built_at"):
        return "full", "feature_build_meta is missing or incomplete", current_inputs, meta
    if meta.get("rules_sha256") != current_inputs["rules_sha256"]:
        return "full", "priority_score_rules.csv changed", current_inputs, meta
    if meta.get("source_db_path") != current_inputs["source_db_path"]:
        return "full", "source_db path changed", current_inputs, meta
    if meta.get("rules_csv_path") != current_inputs["rules_csv_path"]:
        return "full", "rules_csv path changed", current_inputs, meta
    if (
        meta.get("source_db_mtime_ns") == current_inputs["source_db_mtime_ns"]
        and meta.get("source_db_size") == current_inputs["source_db_size"]
    ):
        return "skip", "source DB and rule CSV are unchanged", current_inputs, meta
    return "incremental", "source DB changed while rule CSV is unchanged", current_inputs, meta


def load_customers(source_db: Path) -> list[sqlite3.Row]:
    with connect_db(source_db) as conn:
        return conn.execute("SELECT * FROM customers").fetchall()


def load_feature_snapshot(feature_db: Path) -> dict[str, sqlite3.Row]:
    with connect_db(feature_db) as conn:
        rows = conn.execute(
            """
            SELECT
                id_1,
                title,
                phone_office,
                email,
                industry_name,
                mgr_display_name,
                relation_name,
                account_source_full_name,
                province_name,
                latest_interaction_raw,
                created_at_1,
                updated_at_1,
                order_count,
                approved_order_count,
                cancelled_order_count,
                pending_order_count,
                approved_revenue,
                total_paid_amount,
                approved_revenue_quartile,
                last_order_date,
                order_status_profile,
                owned_product_names_norm
            FROM customer_features
            """
        ).fetchall()
    return {row["id_1"]: row for row in rows}


def write_meta(feature_db: Path, metadata: dict[str, str]) -> None:
    with connect_db(feature_db) as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO feature_build_meta(meta_key, meta_value)
            VALUES(?, ?)
            """,
            list(metadata.items()),
        )
        conn.commit()


def customer_source_changed(customer: sqlite3.Row, feature_row: sqlite3.Row) -> bool:
    field_pairs = [
        ("title", "title"),
        ("phone_office", "phone_office"),
        ("email", "email"),
        ("industry_name", "industry_name"),
        ("mgr_display_name", "mgr_display_name"),
        ("relation_name", "relation_name"),
        ("account_source_full_name", "account_source_full_name"),
        ("province_name", "province_name"),
        ("latest_interaction", "latest_interaction_raw"),
        ("created_at_1", "created_at_1"),
        ("updated_at_1", "updated_at_1"),
    ]
    for source_field, feature_field in field_pairs:
        if normalize_spaces(str(customer[source_field] or "")) != normalize_spaces(
            str(feature_row[feature_field] or "")
        ):
            return True
    return False


def order_snapshot_changed(
    feature_row: sqlite3.Row, order_info: dict[str, Any], revenue_quartile: str
) -> bool:
    comparisons = [
        ("order_count", int(feature_row["order_count"] or 0), int(order_info["order_count"] or 0)),
        (
            "approved_order_count",
            int(feature_row["approved_order_count"] or 0),
            int(order_info["approved_order_count"] or 0),
        ),
        (
            "cancelled_order_count",
            int(feature_row["cancelled_order_count"] or 0),
            int(order_info["cancelled_order_count"] or 0),
        ),
        (
            "pending_order_count",
            int(feature_row["pending_order_count"] or 0),
            int(order_info["pending_order_count"] or 0),
        ),
        (
            "approved_revenue",
            float(feature_row["approved_revenue"] or 0.0),
            float(order_info["approved_revenue"] or 0.0),
        ),
        (
            "total_paid_amount",
            float(feature_row["total_paid_amount"] or 0.0),
            float(order_info["total_paid_amount"] or 0.0),
        ),
        (
            "last_order_date",
            normalize_spaces(str(feature_row["last_order_date"] or "")),
            normalize_spaces(str(order_info["last_order_date"] or "")),
        ),
        (
            "order_status_profile",
            normalize_spaces(str(feature_row["order_status_profile"] or "")),
            normalize_spaces(str(order_info["order_status_profile"] or "")),
        ),
        (
            "owned_product_names_norm",
            normalize_spaces(str(feature_row["owned_product_names_norm"] or "")),
            normalize_spaces(str(order_info["owned_product_names_norm"] or "")),
        ),
        (
            "approved_revenue_quartile",
            normalize_spaces(str(feature_row["approved_revenue_quartile"] or "")),
            normalize_spaces(str(revenue_quartile or "")),
        ),
    ]
    return any(left != right for _, left, right in comparisons)


def detect_incremental_changes(
    customers: list[sqlite3.Row],
    feature_snapshot: dict[str, sqlite3.Row],
    order_aggregates: dict[str, dict[str, Any]],
    revenue_quartiles: dict[str, str],
) -> tuple[dict[str, sqlite3.Row], set[str], set[str]]:
    default_order_info = {
        "order_count": 0,
        "approved_order_count": 0,
        "cancelled_order_count": 0,
        "pending_order_count": 0,
        "approved_revenue": 0.0,
        "total_paid_amount": 0.0,
        "last_order_date": "",
        "order_status_profile": "no_orders",
        "owned_product_names_norm": "blank",
        "has_orders": 0,
    }

    source_customers: dict[str, sqlite3.Row] = {}
    changed_ids: set[str] = set()
    for customer in customers:
        customer_id = normalize_spaces(str(customer["id_1"] or ""))
        if not customer_id:
            continue
        source_customers[customer_id] = customer
        feature_row = feature_snapshot.get(customer_id)
        if feature_row is None:
            changed_ids.add(customer_id)
            continue

        order_info = order_aggregates.get(customer_id, default_order_info)
        revenue_quartile = revenue_quartiles.get(customer_id, "none")
        if customer_source_changed(customer, feature_row) or order_snapshot_changed(
            feature_row, order_info, revenue_quartile
        ):
            changed_ids.add(customer_id)

    deleted_ids = set(feature_snapshot) - set(source_customers)
    return source_customers, changed_ids, deleted_ids


def validate_feature_db(source_db: Path, feature_db: Path) -> None:
    errors: list[str] = []
    with connect_db(source_db) as source_conn, connect_db(feature_db) as feature_conn:
        customer_count = source_conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        feature_count = feature_conn.execute("SELECT COUNT(*) FROM customer_features").fetchone()[0]
        duplicate_ids = feature_conn.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT id_1, COUNT(*) AS c
                FROM customer_features
                GROUP BY id_1
                HAVING c > 1
            )
            """
        ).fetchone()[0]
        null_scores = feature_conn.execute(
            "SELECT COUNT(*) FROM customer_features WHERE priority_score IS NULL"
        ).fetchone()[0]
        null_segments = feature_conn.execute(
            "SELECT COUNT(*) FROM customer_features WHERE customer_segment IS NULL OR TRIM(customer_segment) = ''"
        ).fetchone()[0]

    if customer_count != feature_count:
        errors.append(f"Feature row count mismatch: customers={customer_count}, features={feature_count}.")
    if duplicate_ids:
        errors.append(f"Duplicate id_1 found in features.db: {duplicate_ids}.")
    if null_scores:
        errors.append(f"priority_score is NULL for {null_scores} rows.")
    if null_segments:
        errors.append(f"customer_segment is blank for {null_segments} rows.")

    if errors:
        raise RuntimeError("\n".join(errors))


def build_customer_features(
    source_db: Path, feature_db: Path, rules_csv: Path, force: bool = False
) -> str:
    if not source_db.exists():
        raise FileNotFoundError(f"Source DB not found: {source_db}")
    if not rules_csv.exists():
        raise FileNotFoundError(f"Rules CSV not found: {rules_csv}")

    rules = load_rules(rules_csv)
    validate_rules(rules)

    build_mode, build_reason, build_inputs, existing_meta = determine_build_mode(
        source_db, feature_db, rules_csv, force
    )
    print(f"[customer_features] Mode: {build_mode}")
    print(f"[customer_features] Reason: {build_reason}")
    if build_mode == "skip":
        validate_feature_db(source_db, feature_db)
        return "features.db is already up to date."

    order_aggregates = build_order_aggregates(source_db)
    revenue_quartiles = build_revenue_quartiles(order_aggregates)
    customers = load_customers(source_db)
    reference_date = date.today()
    built_at = now_iso()
    default_order_info = {
        "order_count": 0,
        "approved_order_count": 0,
        "cancelled_order_count": 0,
        "pending_order_count": 0,
        "approved_revenue": 0.0,
        "total_paid_amount": 0.0,
        "last_order_date": "",
        "order_status_profile": "no_orders",
        "owned_product_names_norm": "blank",
        "has_orders": 0,
    }

    insert_sql = """
        INSERT OR REPLACE INTO customer_features (
            id_1, title, phone_office, email, industry_name, industry_name_norm,
            industry_group, mgr_display_name, relation_name, relation_name_norm,
            account_source_full_name, source_group, province_name, province_norm,
            latest_interaction_raw, interaction_clean, interaction_keywords,
            interaction_count, last_interaction_at, last_actor,
            relationship_history_summary, has_orders, order_count,
            approved_order_count, cancelled_order_count, pending_order_count,
            approved_revenue, total_paid_amount, approved_revenue_quartile,
            last_order_date, order_status_profile, owned_product_names_norm,
            created_at_1, updated_at_1, last_touch_at, funnel_stage,
            customer_segment, priority_score, priority_rule_hits_json, built_at,
            primary_shortlist, primary_shortlist_score, primary_shortlist_reason,
            primary_shortlist_evidence_json, shortlist_built_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
        )
    """

    if build_mode == "full":
        rows_to_insert: list[tuple[Any, ...]] = []
        for customer in customers:
            customer_id = normalize_spaces(str(customer["id_1"] or ""))
            order_info = order_aggregates.get(customer_id, default_order_info)
            rows_to_insert.append(
                build_feature_row(
                    customer,
                    order_info,
                    revenue_quartiles.get(customer_id, "none"),
                    rules,
                    reference_date,
                    built_at,
                )
            )

        init_feature_db(feature_db)
        with connect_db(feature_db) as conn:
            conn.executemany(insert_sql, rows_to_insert)
            conn.commit()

        metadata = {
            "built_at": built_at,
            **build_inputs,
            "customer_count": str(len(customers)),
            "feature_count": str(len(rows_to_insert)),
            "last_build_mode": "full",
            "last_upsert_count": str(len(rows_to_insert)),
            "last_delete_count": "0",
        }
        write_meta(feature_db, metadata)
        validate_feature_db(source_db, feature_db)
        return f"Built customer_features for {len(rows_to_insert)} customers."

    try:
        feature_snapshot = load_feature_snapshot(feature_db)
    except sqlite3.DatabaseError:
        print("[customer_features] Existing features.db is unreadable. Falling back to full rebuild.")
        init_feature_db(feature_db)
        return build_customer_features(source_db, feature_db, rules_csv, force=True)

    source_customers, changed_ids, deleted_ids = detect_incremental_changes(
        customers,
        feature_snapshot,
        order_aggregates,
        revenue_quartiles,
    )

    rows_to_upsert = [
        build_feature_row(
            source_customers[customer_id],
            order_aggregates.get(customer_id, default_order_info),
            revenue_quartiles.get(customer_id, "none"),
            rules,
            reference_date,
            built_at,
        )
        for customer_id in sorted(changed_ids)
    ]

    with connect_db(feature_db) as conn:
        if rows_to_upsert:
            conn.executemany(insert_sql, rows_to_upsert)
        if deleted_ids:
            placeholders = ",".join("?" for _ in deleted_ids)
            conn.execute(
                f"DELETE FROM customer_features WHERE id_1 IN ({placeholders})",
                tuple(sorted(deleted_ids)),
            )
        conn.commit()

    print(
        "[customer_features] Incremental diff: "
        f"changed={len(rows_to_upsert)}, deleted={len(deleted_ids)}, unchanged={len(customers) - len(rows_to_upsert)}"
    )

    metadata = {
        "built_at": built_at,
        **build_inputs,
        "customer_count": str(len(customers)),
        "feature_count": str(len(customers)),
        "last_build_mode": "incremental",
        "last_upsert_count": str(len(rows_to_upsert)),
        "last_delete_count": str(len(deleted_ids)),
        "previous_built_at": existing_meta.get("built_at", ""),
    }
    write_meta(feature_db, metadata)
    validate_feature_db(source_db, feature_db)
    return (
        "Incremental update completed: "
        f"upserted {len(rows_to_upsert)} customers, deleted {len(deleted_ids)} customers."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build customer_features into a dedicated SQLite database."
    )
    parser.add_argument(
        "--source-db",
        default=str(DEFAULT_SOURCE_DB),
        help="Path to the source crm.db file.",
    )
    parser.add_argument(
        "--feature-db",
        default=str(DEFAULT_FEATURE_DB),
        help="Path to the output features.db file.",
    )
    parser.add_argument(
        "--rules-csv",
        default=str(DEFAULT_RULES_CSV),
        help="Path to priority_score_rules.csv.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild features.db even if source DB and rule hash are unchanged.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    message = build_customer_features(
        source_db=Path(args.source_db),
        feature_db=Path(args.feature_db),
        rules_csv=Path(args.rules_csv),
        force=args.force,
    )
    print(message)


if __name__ == "__main__":
    main()

