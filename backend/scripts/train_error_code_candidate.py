"""Train and evaluate a candidate model without touching production artifacts."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

import joblib

from evaluate_error_codes import CONFIGS, APP_DIR, ROOT, build_candidate, drawing_separated_holdout, metrics_for
from feedback_dataset import load_active_catalog, read_dataset, validate_rows, write_csv


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def persist_versioned_candidate(model, output_dir, manifest):
    """Store a content-addressed candidate and refuse to replace any existing file."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".joblib", dir=output_dir, delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        joblib.dump(model, temp_path)
        data = temp_path.read_bytes()
        artifact_hash = hashlib.sha256(data).hexdigest()
        version = artifact_hash[:16]
        artifact_path = output_dir / f"error-code-candidate-{version}.joblib"
        manifest_path = output_dir / f"error-code-candidate-{version}.json"
        manifest = {**manifest, "candidate_version": version, "artifact_sha256": artifact_hash}
        if artifact_path.exists() or manifest_path.exists():
            raise FileExistsError(f"Candidate version already exists; refusing overwrite: {version}")
        with open(artifact_path, "xb") as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        try:
            with open(manifest_path, "x", encoding="utf-8") as target:
                json.dump(manifest, target, indent=2)
        except Exception:
            artifact_path.unlink(missing_ok=True)
            raise
        return artifact_path, manifest_path, manifest
    finally:
        temp_path.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Feedback CSV; labels must be reviewer-confirmed")
    parser.add_argument("--catalog", help="Optional active catalog JSON snapshot")
    parser.add_argument("--config", choices=sorted(CONFIGS), default="word-bigram-balanced")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", default=str(ROOT / "backend/models/candidates"))
    parser.add_argument("--approve-small-sample", action="store_true",
                        help="Allow candidate creation with fewer than 20 held-out labels (still exploratory)")
    args = parser.parse_args(argv)

    source = Path(args.input).resolve()
    columns, rows = read_dataset(source)
    active_codes = load_active_catalog(args.catalog)
    included, audit, validation = validate_rows(rows, columns, active_codes)
    write_csv(source.with_name(source.stem + ".training-audit.csv"), audit,
              columns + ["malformed_extra_values", "validation_status", "validation_reason", "validation_notes"])
    if not included:
        parser.error("No valid reviewer-confirmed examples remain after validation")
    train_rows, test_rows = drawing_separated_holdout(included, args.test_size, args.seed)
    if not test_rows:
        parser.error("At least two distinct drawing groups are required for a leakage-safe holdout")
    if len(test_rows) < 20 and not args.approve_small_sample:
        parser.error(f"Only {len(test_rows)} held-out examples; inspect the data and pass --approve-small-sample to create an exploratory candidate")
    if len({row["gold_code"] for row in train_rows}) < 2:
        parser.error("Training split needs at least two confirmed error-code classes")

    model = build_candidate(args.config)
    model.fit([row["comment"].strip() for row in train_rows], [row["gold_code"].strip() for row in train_rows])
    predictions = model.predict([row["comment"].strip() for row in test_rows]).tolist()
    evaluation = metrics_for([row["gold_code"].strip() for row in test_rows], predictions)

    import sys
    sys.path.insert(0, str(APP_DIR))
    import app as drawlog_app
    baseline = drawlog_app.predict_error([row["comment"].strip() for row in test_rows])
    baseline_metrics = metrics_for([row["gold_code"].strip() for row in test_rows], baseline)
    manifest_base = {
        "created_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "source_dataset_sha256": sha256_file(source),
        "training_examples": len(train_rows), "evaluation_examples": len(test_rows),
        "training_drawings": sorted({row["drawing_id"] for row in train_rows}),
        "evaluation_drawings": sorted({row["drawing_id"] for row in test_rows}),
        "split_seed": args.seed, "test_size": args.test_size,
        "active_catalog_classes": len(active_codes), "validation_summary": validation,
        "config_name": args.config, "config": CONFIGS[args.config],
        "production_baseline_version": drawlog_app.CLASSIFIER_MODEL_VERSION,
        "candidate_metrics": evaluation, "production_baseline_metrics": baseline_metrics,
        "candidate_is_deployed": False,
        "small_sample_exploratory": len(test_rows) < 20,
        "promotion_requires_explicit_approval": True,
    }
    artifact, manifest_file, manifest = persist_versioned_candidate(model, args.output_dir, manifest_base)
    print(json.dumps({"candidate_artifact": str(artifact), "manifest": str(manifest_file),
                      "candidate_version": manifest["candidate_version"],
                      "candidate_metrics": evaluation, "production_baseline_metrics": baseline_metrics}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
