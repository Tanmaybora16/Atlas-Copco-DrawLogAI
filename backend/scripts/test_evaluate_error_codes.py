import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluate_error_codes import drawing_separated_holdout


class EvaluationSplitTests(unittest.TestCase):
    def test_holdout_keeps_drawings_separate_and_is_repeatable(self):
        rows = [
            {"drawing_id": f"D{i}", "comment": f"comment {i}", "gold_code": "P28"}
            for i in range(12)
        ]
        train, test = drawing_separated_holdout(rows, seed=19)
        train_again, test_again = drawing_separated_holdout(rows, seed=19)
        self.assertTrue({r["drawing_id"] for r in train}.isdisjoint({r["drawing_id"] for r in test}))
        self.assertEqual(train, train_again)
        self.assertEqual(test, test_again)

    def test_single_drawing_cannot_be_split_without_leakage(self):
        rows = [{"drawing_id": "D1", "comment": "one", "gold_code": "P28"}]
        self.assertEqual(drawing_separated_holdout(rows), ([], []))


if __name__ == "__main__":
    unittest.main()
