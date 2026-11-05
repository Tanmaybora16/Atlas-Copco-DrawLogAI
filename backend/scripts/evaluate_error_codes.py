"""Evaluate fixed TF-IDF/LR candidates, production baseline, and stored Ollama labels."""
import argparse
import json
import os
import sys
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "backend" / "Atlashost"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from feedback_dataset import load_active_catalog, read_dataset, validate_rows, write_csv


CONFIGS = {
    "word-unigram": {"ngram_range": (1, 1), "min_df": 1, "sublinear_tf": True, "C": 1.0, "class_weight": None},
    "word-bigram-balanced": {"ngram_range": (1, 2), "min_df": 1, "sublinear_tf": True, "C": 1.0, "class_weight": "balanced"},
    "word-bigram-regularized": {"ngram_range": (1, 2), "min_df": 1, "sublinear_tf": True, "C": 0.5, "class_weight": None},
}


def drawing_separated_holdout(rows, test_size=0.25, seed=42):
    """Split by drawing so no drawing's examples cross partitions."""
    groups = [str(row["drawing_id"]).strip() for row in rows]
    if len(set(groups)) < 2:
        return [], []
    train_idx, test_idx = next(GroupShuffleSplit(
        n_splits=1, test_size=test_size, random_state=seed
    ).split(rows, groups=groups))
    train = [rows[i] for i in train_idx]
    test = [rows[i] for i in test_idx]
    if {str(row["drawing_id"]).strip() for row in train} & {str(row["drawing_id"]).strip() for row in test}:
        raise AssertionError("Drawing leakage detected in evaluation split")
    return train, test


def build_candidate(config_name):
    config = CONFIGS[config_name]
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=config["ngram_range"], min_df=config["min_df"],
            sublinear_tf=config["sublinear_tf"], max_features=50000,
        )),
        ("classifier", LogisticRegression(
            C=config["C"], class_weight=config["class_weight"],
            max_iter=2000, random_state=42,
        )),
    ])


def metrics_for(gold, predictions):
    labels = sorted(set(gold) | set(predictions))
    precision, recall, f1, support = precision_recall_fscore_support(
        gold, predictions, labels=labels, zero_division=0
    )
    matrix = confusion_matrix(gold, predictions, labels=labels)
    return {
        "evaluated_examples": len(gold),
        "accuracy": accuracy_score(gold, predictions),
        "macro_f1": f1_score(gold, predictions, average="macro", zero_division=0),
        "weighted_f1": f1_score(gold, predictions, average="weighted", zero_division=0),
        "per_class": {
            label: {"precision": float(p), "recall": float(r), "f1": float(f), "support": int(n)}
            for label, p, r, f, n in zip(labels, precision, recall, f1, support)
        },
        "confusion_matrix_labels": labels,
        "confusion_matrix": matrix.tolist(),
        "incorrect": [
            {"gold": expected, "predicted": actual}
            for expected, actual in zip(gold, predictions) if expected != actual
        ],
    }


def evaluate_split(train_rows, test_rows, baseline_predictor, configs=None):
    gold = [row["gold_code"].strip() for row in test_rows]
    comments_train = [row["comment"].strip() for row in train_rows]
    y_train = [row["gold_code"].strip() for row in train_rows]
    results = {}
    baseline = baseline_predictor([row["comment"].strip() for row in test_rows])
    results["production_baseline"] = metrics_for(gold, baseline)
    for name in (CONFIGS if configs is None else configs):
        if len(set(y_train)) < 2:
            results[name] = {"status": "not_trained", "reason": "training partition has fewer than two classes"}
            continue
        candidate = build_candidate(name)
        try:
            candidate.fit(comments_train, y_train)
            predictions = candidate.predict([row["comment"].strip() for row in test_rows]).tolist()
            results[name] = metrics_for(gold, predictions)
            results[name]["status"] = "evaluated"
        except ValueError as error:
            results[name] = {"status": "not_trained", "reason": str(error)}

    ai_indices = [i for i, row in enumerate(test_rows) if str(row.get("ai_suggestion") or "").strip()]
    if ai_indices:
        ai_gold = [gold[i] for i in ai_indices]
        ai_predictions = [str(test_rows[i]["ai_suggestion"]).strip() for i in ai_indices]
        results["stored_ollama_predictions"] = metrics_for(ai_gold, ai_predictions)
        results["stored_ollama_predictions"]["source_note"] = "AI suggestions already present in exported rows; no Ollama calls were made"
    else:
        results["stored_ollama_predictions"] = {"status": "not_available", "reason": "no held-out rows contain an AI suggestion"}
    return results


def _print_summary(report):
    print(f"Validated examples: {report['included_examples']} included; {report['excluded_examples']} excluded")
    print(f"Split: train={report['training_examples']} / test={report['evaluation_examples']} examples; "
          f"{report['training_drawings']} train drawings / {report['evaluation_drawings']} test drawings; seed={report['seed']}")
    if report["evaluation_examples"] < 20:
        print("Too few held-out labels for a meaningful conclusion; treat all metrics as exploratory.")
    for name, result in report["results"].items():
        if result.get("evaluated_examples") is not None:
            print(f"{name}: n={result['evaluated_examples']}, accuracy={result['accuracy']:.3f}, "
                  f"macro-F1={result['macro_f1']:.3f}, weighted-F1={result['weighted_f1']:.3f}")
        else:
            print(f"{name}: {result.get('status')} ({result.get('reason', '')})")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(ROOT / "backend/data/error_code_evaluation_template.csv"))
    parser.add_argument("--catalog", help="Optional catalog JSON snapshot; defaults to configured database")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", help="Optional JSON results path")
    args = parser.parse_args(argv)
    columns, rows = read_dataset(args.input)
    active_codes = load_active_catalog(args.catalog)
    included, audit, validation = validate_rows(rows, columns, active_codes)
    source = Path(args.input).resolve()
    write_csv(source.with_name(source.stem + ".evaluation-audit.csv"), audit,
              columns + ["malformed_extra_values", "validation_status", "validation_reason", "validation_notes"])
    if not included:
        print(f"No valid reviewer-confirmed labels. Input rows={len(rows)}, excluded={validation['excluded_rows']}; see evaluation-audit.csv.")
        return 0

    train_rows, test_rows = drawing_separated_holdout(included, args.test_size, args.seed)
    if not test_rows:
        print(f"Only {len(set(row['drawing_id'] for row in included))} drawing group(s); cannot make a leakage-safe holdout.")
        return 2

    sys.path.insert(0, str(APP_DIR))
    import app as drawlog_app
    results = evaluate_split(train_rows, test_rows, drawlog_app.predict_error)
    report = {
        "input": str(source), "validation": validation,
        "active_catalog_classes": len(active_codes), "included_examples": len(included),
        "excluded_examples": validation["excluded_rows"],
        "training_examples": len(train_rows), "evaluation_examples": len(test_rows),
        "training_drawings": len({r["drawing_id"] for r in train_rows}),
        "evaluation_drawings": len({r["drawing_id"] for r in test_rows}),
        "seed": args.seed, "test_size": args.test_size,
        "production_baseline_version": drawlog_app.CLASSIFIER_MODEL_VERSION,
        "production_baseline_runtime_classes": list(map(str, drawlog_app.model.classes_)),
        "fixed_candidate_configurations": CONFIGS,
        "results": results,
        "no_tuning_on_evaluation_split": True,
    }
    _print_summary(report)
    rendered = json.dumps(report, indent=2, default=list)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
