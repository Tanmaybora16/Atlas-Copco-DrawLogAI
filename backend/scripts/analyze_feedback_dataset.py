"""Report label distribution, corrections, duplicate comments and class imbalance."""
import argparse
import json
from pathlib import Path

from feedback_dataset import analyze_rows, load_active_catalog, read_dataset, validate_rows


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Raw or validated feedback CSV")
    parser.add_argument("--catalog", help="Optional active catalog JSON; otherwise use configured DB")
    parser.add_argument("--output", help="Optional JSON report path")
    args = parser.parse_args(argv)
    columns, rows = read_dataset(args.input)
    codes = load_active_catalog(args.catalog)
    included, _audit, validation = validate_rows(rows, columns, codes)
    report = analyze_rows(included, validation, all_rows=rows)
    report["source"] = str(Path(args.input).resolve())
    report["active_catalog_size"] = len(codes)
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
