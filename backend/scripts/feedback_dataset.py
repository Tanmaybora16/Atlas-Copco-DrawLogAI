"""Shared validation and analysis for reviewer-confirmed prediction exports."""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "backend" / "Atlashost"
CONFIRMED_DECISIONS = {"accepted_ai", "corrected", "kept_classifier", "manual_confirmed"}
REQUIRED_COLUMNS = {"drawing_id", "revision", "comment", "gold_code", "review_decision"}


def normalize_comment(comment):
    return re.sub(r"\s+", " ", (comment or "").strip()).casefold()


def read_dataset(path):
    with open(path, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        fields = list(reader.fieldnames or [])
        rows = []
        for source_row, raw in enumerate(reader, start=2):
            extra = raw.pop(None, None)
            rows.append({"_source_row": source_row, "_malformed_extra": extra,
                         "malformed_extra_values": json.dumps(extra, ensure_ascii=False) if extra else "", **raw})
    return fields, rows


def load_active_catalog(catalog_file=None):
    """Load an explicit catalog snapshot or read active rows from the configured DB."""
    if catalog_file:
        with open(catalog_file, encoding="utf-8") as source:
            raw = json.load(source)
        entries = raw.get("codes", raw) if isinstance(raw, dict) else raw
        if not isinstance(entries, list):
            raise ValueError("Catalog JSON must be a list or an object with a 'codes' list")
        codes = set()
        for item in entries:
            if isinstance(item, str):
                codes.add(item.strip())
            elif isinstance(item, dict) and item.get("is_active", True):
                code = str(item.get("code") or "").strip()
                if code:
                    codes.add(code)
        return codes

    sys.path.insert(0, str(APP_DIR))
    import app as drawlog_app
    db = drawlog_app.connect_to_db()
    if db is None:
        raise RuntimeError("Could not connect to configured database for active error-code catalog")
    try:
        with db.cursor() as cursor:
            cursor.execute("SELECT code FROM error_codes WHERE is_active = 1 ORDER BY code")
            return {str(row[0]).strip() for row in cursor.fetchall() if row and row[0]}
    finally:
        db.close()


def _row_problems(row, columns, active_codes):
    missing_columns = sorted(REQUIRED_COLUMNS - set(columns))
    if missing_columns:
        return ["missing_required_columns:" + ",".join(missing_columns)]
    problems = []
    if row.get("_malformed_extra"):
        problems.append("malformed_extra_columns")
    if any(row.get(field) is None for field in REQUIRED_COLUMNS):
        problems.append("malformed_missing_cells")
    if not str(row.get("drawing_id") or "").strip():
        problems.append("missing_drawing_reference")
    if not str(row.get("revision") or "").strip():
        problems.append("missing_revision_reference")
    comment = str(row.get("comment") or "").strip()
    if not comment:
        problems.append("missing_comment")
    elif len(comment) > 4000:
        problems.append("comment_exceeds_4000_characters")
    label = str(row.get("gold_code") or "").strip()
    if not label:
        problems.append("missing_label")
    elif label not in active_codes:
        problems.append("invalid_or_inactive_label")
    decision = str(row.get("review_decision") or "").strip().lower()
    if decision in {"removed", "needs_review"}:
        problems.append(decision)
    elif decision not in CONFIRMED_DECISIONS:
        problems.append("unreviewed_or_unknown_decision")
    timestamp = str(row.get("reviewed_at") or "").strip()
    if timestamp:
        try:
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            try:
                date.fromisoformat(timestamp)
            except ValueError:
                problems.append("malformed_review_timestamp")
    return list(dict.fromkeys(problems))


def validate_rows(rows, columns, active_codes):
    """Return included unique labels plus an audit row for every input record."""
    audit = []
    eligible = []
    for row in rows:
        problems = _row_problems(row, columns, active_codes)
        if problems:
            audit.append({**row, "validation_status": "excluded", "validation_reason": ";".join(problems)})
        else:
            eligible.append(row)

    labels_by_comment = defaultdict(set)
    for row in eligible:
        labels_by_comment[normalize_comment(row["comment"])].add(row["gold_code"].strip())

    first_by_key = {}
    included = []
    for row in eligible:
        normalized = normalize_comment(row["comment"])
        if len(labels_by_comment[normalized]) > 1:
            audit.append({**row, "validation_status": "excluded", "validation_reason": "duplicate_comment_conflicting_labels"})
            continue
        key = (normalized, row["gold_code"].strip())
        if key in first_by_key:
            audit.append({**row, "validation_status": "excluded", "validation_reason": f"duplicate_example_of_row_{first_by_key[key]}"})
            continue
        first_by_key[key] = row["_source_row"]
        included.append(row)
        audit.append({**row, "validation_status": "included", "validation_reason": "reviewer_confirmed_valid_label"})

    included.sort(key=lambda item: item["_source_row"])
    audit.sort(key=lambda item: item["_source_row"])
    reasons = Counter(
        reason for item in audit if item["validation_status"] == "excluded"
        for reason in item["validation_reason"].split(";")
    )
    duplicate_occurrences = Counter(
        normalize_comment(row.get("comment") or "") for row in rows
        if normalize_comment(row.get("comment") or "")
    )
    duplicate_comment_rows = sum(max(0, count - 1) for count in duplicate_occurrences.values())
    invalid_prediction_rows = sum(
        1 for row in rows
        if any(str(row.get(field) or "").strip() and str(row.get(field)).strip() not in active_codes
               for field in ("classifier_prediction", "ai_suggestion"))
    )
    for item in audit:
        notes = []
        for field in ("classifier_prediction", "ai_suggestion"):
            value = str(item.get(field) or "").strip()
            if value and value not in active_codes:
                notes.append(f"{field}_not_active_or_unknown:{value}")
        normalized_comment = normalize_comment(item.get("comment") or "")
        if normalized_comment and duplicate_occurrences[normalized_comment] > 1:
            notes.append("comment_repeats_in_input")
        item["validation_notes"] = ";".join(notes)
    summary = {
        "input_rows": len(rows),
        "included_rows": len(included),
        "excluded_rows": len(audit) - len(included),
        "excluded_by_reason": dict(sorted(reasons.items())),
        "duplicate_rows_excluded": sum(count for reason, count in reasons.items() if reason.startswith("duplicate_")),
        "duplicate_comment_rows_in_input": duplicate_comment_rows,
        "malformed_rows": sum(
            1 for item in audit
            if any(reason.startswith("malformed_") for reason in item["validation_reason"].split(";"))
        ),
        "rows_with_invalid_or_inactive_predictions": invalid_prediction_rows,
    }
    return included, audit, summary


def analyze_rows(rows, validation_summary, all_rows=None):
    all_rows = all_rows if all_rows is not None else rows
    comment_counts = Counter(normalize_comment(row.get("comment") or "") for row in all_rows if normalize_comment(row.get("comment") or ""))
    code_counts = Counter(row["gold_code"].strip() for row in rows)
    correction_rows = [row for row in rows if str(row.get("review_decision", "")).strip().lower() == "corrected"]
    corrected = Counter(row["gold_code"].strip() for row in correction_rows)
    corrected_from = Counter(str(row.get("classifier_prediction") or "<missing>").strip() for row in correction_rows)
    transitions = Counter((str(row.get("classifier_prediction") or "<missing>").strip(), row["gold_code"].strip()) for row in correction_rows)
    counts = sorted(code_counts.values())
    imbalance = (max(counts) / min(counts)) if counts and min(counts) else None
    return {
        "validation": validation_summary,
        "total_feedback_records": len(all_rows),
        "total_reviewed_comments": sum(str(row.get("review_decision") or "").strip().lower() in CONFIRMED_DECISIONS | {"removed"} for row in all_rows),
        "unreviewed_comments": sum(str(row.get("review_decision") or "").strip().lower() in {"", "needs_review"} for row in all_rows),
        "unique_normalized_comments": len(comment_counts),
        "missing_label_records": validation_summary.get("excluded_by_reason", {}).get("missing_label", 0),
        "duplicate_example_records_excluded": validation_summary.get("duplicate_rows_excluded", 0),
        "duplicate_comment_rows_in_input": validation_summary.get("duplicate_comment_rows_in_input", 0),
        "valid_error_code_classes": len(code_counts),
        "comments_per_code": dict(sorted(code_counts.items())),
        "most_frequently_corrected_final_codes": dict(corrected.most_common()),
        "most_frequently_corrected_from_codes": dict(corrected_from.most_common()),
        "correction_transitions_from_to": {f"{source}->{target}": count for (source, target), count in transitions.most_common()},
        "class_imbalance_max_to_min_ratio": imbalance,
        "largest_class_count": max(counts) if counts else 0,
        "smallest_class_count": min(counts) if counts else 0,
    }


def write_csv(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") if row.get(key) is not None else "" for key in columns})
