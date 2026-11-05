import csv
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

from feedback_dataset import analyze_rows, validate_rows
from evaluate_error_codes import drawing_separated_holdout, evaluate_split, metrics_for
from train_error_code_candidate import persist_versioned_candidate
from promote_error_code_candidate import main as promotion_main


class FeedbackDatasetTests(unittest.TestCase):
    def row(self, **overrides):
        row = {"_source_row": 2, "_malformed_extra": None, "drawing_id": "D1", "revision": "1",
               "comment": "Diameter tolerance missing", "gold_code": "P28",
               "review_decision": "corrected", "classifier_prediction": "P29",
               "ai_suggestion": "P30", "reviewed_at": "2026-01-01T12:00:00"}
        row.update(overrides)
        return row

    def test_validation_excludes_unreviewed_removed_inactive_missing_and_duplicate_rows(self):
        columns = ["drawing_id", "revision", "comment", "gold_code", "review_decision"]
        rows = [
            self.row(_source_row=2),
            self.row(_source_row=3, review_decision="needs_review"),
            self.row(_source_row=4, review_decision="removed"),
            self.row(_source_row=5, gold_code=""),
            self.row(_source_row=6, gold_code="P999"),
            self.row(_source_row=7, comment="  DIAMETER   TOLERANCE MISSING "),
            self.row(_source_row=8, comment="Other comment", _malformed_extra=["unexpected"]),
        ]
        included, audit, summary = validate_rows(rows, columns, {"P28", "P29", "P30"})
        self.assertEqual(len(included), 1)
        self.assertEqual(len(audit), len(rows))
        self.assertEqual(summary["input_rows"], 7)
        self.assertEqual(summary["duplicate_comment_rows_in_input"], 5)
        self.assertEqual(summary["malformed_rows"], 1)
        reasons = [entry["validation_reason"] for entry in audit]
        self.assertIn("needs_review", reasons)
        self.assertIn("removed", reasons)
        self.assertIn("missing_label", reasons)
        self.assertIn("invalid_or_inactive_label", reasons)
        self.assertTrue(any(reason.startswith("duplicate_example") for reason in reasons))
        self.assertIn("malformed_extra_columns", reasons)

    def test_conflicting_duplicate_comment_labels_are_all_excluded(self):
        columns = ["drawing_id", "revision", "comment", "gold_code", "review_decision"]
        rows = [self.row(_source_row=2), self.row(_source_row=3, drawing_id="D2", gold_code="P29")]
        included, audit, _ = validate_rows(rows, columns, {"P28", "P29"})
        self.assertEqual(included, [])
        self.assertTrue(all(item["validation_reason"] == "duplicate_comment_conflicting_labels" for item in audit))

    def test_analysis_reports_class_counts_and_corrections(self):
        rows = [self.row(), self.row(_source_row=3, drawing_id="D2", comment="Another issue", gold_code="P31")]
        summary = {"input_rows": 2, "included_rows": 2, "excluded_rows": 0, "excluded_by_reason": {},
                   "duplicate_rows_excluded": 0}
        analysis = analyze_rows(rows, summary)
        self.assertEqual(analysis["total_reviewed_comments"], 2)
        self.assertEqual(analysis["valid_error_code_classes"], 2)
        self.assertEqual(analysis["most_frequently_corrected_final_codes"], {"P28": 1, "P31": 1})

    def test_csv_template_read_keeps_unlabeled_row_as_auditable_input(self):
        columns = ["drawing_id", "revision", "comment", "gold_code", "review_decision"]
        rows = [self.row(gold_code="", review_decision="")]
        included, audit, summary = validate_rows(rows, columns, {"P28"})
        self.assertEqual(included, [])
        self.assertEqual(summary["excluded_by_reason"]["unreviewed_or_unknown_decision"], 1)
        self.assertEqual(len(audit), 1)


class EvaluationPipelineTests(unittest.TestCase):
    def test_drawing_split_and_metrics(self):
        rows = [{"drawing_id": f"D{i}", "comment": f"comment class {i % 2}",
                 "gold_code": "P28" if i % 2 else "P29", "ai_suggestion": "P28"}
                for i in range(20)]
        train, test = drawing_separated_holdout(rows, seed=13)
        self.assertTrue({row["drawing_id"] for row in train}.isdisjoint({row["drawing_id"] for row in test}))
        score = metrics_for(["P28", "P29"], ["P28", "P28"])
        self.assertEqual(score["evaluated_examples"], 2)
        self.assertEqual(score["accuracy"], 0.5)
        self.assertIn("macro_f1", score)
        self.assertIn("weighted_f1", score)
        self.assertEqual(len(score["confusion_matrix"]), 2)

    def test_candidate_artifact_has_content_version_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            artifact, manifest_path, manifest = persist_versioned_candidate(
                {"candidate": "fixture"}, folder, {"candidate_is_deployed": False}
            )
            self.assertTrue(artifact.name.endswith(manifest["candidate_version"] + ".joblib"))
            loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertFalse(loaded["candidate_is_deployed"])
            with self.assertRaises(FileExistsError):
                persist_versioned_candidate({"candidate": "fixture"}, folder, {})

    def test_production_promotion_requires_both_approval_flags(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / "baseline-model.pkl"
            vectorizer = Path(folder) / "baseline-vectorizer.pkl"
            model.write_bytes(b"baseline-model")
            vectorizer.write_bytes(b"baseline-vectorizer")
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                promotion_main(["--candidate", str(Path(folder) / "candidate.joblib"),
                                "--model-path", str(model), "--vectorizer-path", str(vectorizer),
                                "--backup-dir", str(Path(folder) / "backup")])
            self.assertEqual(model.read_bytes(), b"baseline-model")
            self.assertEqual(vectorizer.read_bytes(), b"baseline-vectorizer")
            self.assertFalse((Path(folder) / "backup").exists())

    def test_ollama_metrics_use_only_rows_with_stored_suggestion(self):
        rows = [{"drawing_id": f"D{i}", "comment": f"comment {i}", "gold_code": "P28",
                 "ai_suggestion": "P28" if i < 3 else ""} for i in range(12)]
        train, test = drawing_separated_holdout(rows, seed=2)
        results = evaluate_split(train, test, lambda comments: ["P28"] * len(comments), configs=[])
        if any(row["ai_suggestion"] for row in test):
            self.assertIn("stored_ollama_predictions", results)

    def test_fixed_candidate_trains_on_train_drawings_and_scores_holdout(self):
        rows = [{"drawing_id": f"D{i}", "comment": f"missing dimension tolerance case {i}",
                 "gold_code": "P28" if i % 2 else "P29", "ai_suggestion": ""} for i in range(20)]
        train, test = drawing_separated_holdout(rows, test_size=0.3, seed=7)
        results = evaluate_split(train, test, lambda comments: ["P28"] * len(comments),
                                 configs=["word-bigram-balanced"])
        self.assertEqual(results["word-bigram-balanced"]["status"], "evaluated")
        self.assertEqual(results["word-bigram-balanced"]["evaluated_examples"], len(test))
        self.assertTrue({row["drawing_id"] for row in train}.isdisjoint({row["drawing_id"] for row in test}))


if __name__ == "__main__":
    unittest.main()
