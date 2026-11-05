"""Validate a feedback CSV and write both clean rows and a row-by-row audit."""
import argparse
import json
from pathlib import Path

from feedback_dataset import load_active_catalog, read_dataset, validate_rows, write_csv


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Admin feedback CSV or manually confirmed CSV")
    parser.add_argument("--catalog", help="Optional JSON catalog snapshot; otherwise use configured DB")
    parser.add_argument("--output-dir", help="Output directory (defaults beside input)")
    args = parser.parse_args(argv)
    source = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else source.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = source.stem
    clean_path = output_dir / f"{stem}.validated.csv"
    audit_path = output_dir / f"{stem}.audit.csv"
    report_path = output_dir / f"{stem}.validation.json"
    if source in (clean_path, audit_path, report_path):
        parser.error("Output paths must not overwrite the input dataset")

    columns, rows = read_dataset(source)
    active_codes = load_active_catalog(args.catalog)
    included, audited, summary = validate_rows(rows, columns, active_codes)
    audit_columns = list(dict.fromkeys(columns + ["malformed_extra_values", "validation_status", "validation_reason", "validation_notes"]))
    write_csv(clean_path, included, columns)
    write_csv(audit_path, audited, audit_columns)
    report = {
        "source": str(source),
        "active_catalog_size": len(active_codes),
        **summary,
        "outputs": {"validated_csv": str(clean_path), "audit_csv": str(audit_path), "report_json": str(report_path)},
    }
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
