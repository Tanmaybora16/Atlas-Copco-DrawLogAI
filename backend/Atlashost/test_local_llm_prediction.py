import json
import io
import os
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as drawlog_app


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self.rows

    def fetchone(self):
        if self.executed and "information_schema.tables" in self.executed[-1][0]:
            return (1,)
        return None


class FakeDB:
    def __init__(self, rows):
        self.fake_cursor = FakeCursor(rows)

    def cursor(self):
        return self.fake_cursor

    def close(self):
        pass

    def commit(self):
        self.committed = True


class FeedbackEndpointCursor:
    def __init__(self, role="employee", participant=True):
        self.role = role
        self.participant = participant
        self.sql = ""

    def __enter__(self): return self
    def __exit__(self, *_args): return False

    def execute(self, sql, params=None):
        self.sql = " ".join(sql.split())

    def fetchone(self):
        if "information_schema.tables" in self.sql: return (1,)
        if "FROM users WHERE emp_id" in self.sql:
            return (10, "EMP_10", self.role, 1)
        if "FROM drawings d JOIN drawing_revisions" in self.sql:
            return (20, 10 if self.participant else 30, 10 if self.participant else 30)
        return None

    def fetchall(self):
        if "FROM reviewer_error_feedback" in self.sql:
            if "ec.code IS NOT NULL" in self.sql:
                return [
                    ("Confirmed comment", "P28", "P29", "P29", "corrected", "DR_1", 1, None, 1),
                    ("Needs review comment", "P28", None, None, "needs_review", "DR_1", 1, None, 0),
                    ("Inactive label comment", "P28", None, "P999", "corrected", "DR_2", 2, None, 0),
                ]
            if "JOIN error_codes ec" in self.sql:
                return [("Dimension absent", "P28", "P29", "P29", "accepted_ai", "ollama", "model-v1", None)]
            return [("Dimension absent", "P28", "P29", "P29", "accepted_ai", "ollama", "model-v1", None)]
        return []


class FeedbackEndpointDB:
    def __init__(self, cursor): self.fake_cursor = cursor
    def cursor(self): return self.fake_cursor
    def close(self): pass


class FeedbackWorkflowTests(unittest.TestCase):
    def _client(self, cursor, token=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return drawlog_app.app.test_client(), headers

    def _token(self, emp="EMP_10", role="employee"):
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}):
            return drawlog_app.issue_api_session(emp, role)

    def test_history_requires_session_and_scopes_to_revision_participants(self):
        cursor = FeedbackEndpointCursor()
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=FeedbackEndpointDB(cursor)):
            client, _ = self._client(cursor)
            self.assertEqual(client.get("/api/drawings/DR_1/1/feedback").status_code, 401)
            token = self._token()
            response = client.get("/api/drawings/DR_1/1/feedback", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["feedback"][0]["final_code"], "P29")

    def test_history_denies_nonparticipant(self):
        cursor = FeedbackEndpointCursor(participant=False)
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=FeedbackEndpointDB(cursor)):
            client = drawlog_app.app.test_client()
            token = self._token()
            response = client.get("/api/drawings/DR_1/1/feedback", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 403)

    def test_export_is_admin_only_and_contains_training_template_headers(self):
        cursor = FeedbackEndpointCursor(role="admin")
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=FeedbackEndpointDB(cursor)):
            client = drawlog_app.app.test_client()
            token = self._token(role="admin")
            response = client.get("/api/reviewer-feedback/export.csv", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("gold_code", response.get_data(as_text=True).splitlines()[0])
        self.assertIn("accepted_ai", response.get_data(as_text=True))
        self.assertIn("review_decision IN ('accepted_ai', 'corrected', 'kept_classifier')", cursor.sql)
        self.assertIn("ec.is_active = 1", cursor.sql)

    def test_export_denies_non_admin(self):
        cursor = FeedbackEndpointCursor(role="employee")
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=FeedbackEndpointDB(cursor)):
            client = drawlog_app.app.test_client()
            token = self._token()
            response = client.get("/api/reviewer-feedback/export.csv", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 403)

    def test_audit_export_keeps_excluded_rows_and_reasons(self):
        cursor = FeedbackEndpointCursor(role="admin")
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "feedback-test-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=FeedbackEndpointDB(cursor)):
            client = drawlog_app.app.test_client()
            token = self._token(role="admin")
            response = client.get("/api/reviewer-feedback/audit.csv", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        body = response.get_data(as_text=True)
        self.assertIn("dataset_status,exclusion_reason", body.splitlines()[0])
        self.assertIn("unreviewed_or_removed", body)
        self.assertIn("invalid_or_inactive_final_code", body)
        self.assertEqual(len(body.splitlines()), 4)


class LegacySubmitCursor:
    def __init__(self):
        self.lastrowid = 4
        self.executed = []

    def execute(self, sql, params=None):
        self.sql = " ".join(sql.split())
        self.params = params
        self.executed.append((self.sql, params))

    def fetchone(self):
        if "SELECT id FROM users WHERE emp_id" in self.sql:
            return (1,)
        if "SELECT id, name FROM users WHERE emp_id" in self.sql:
            return (2, "Reviewer")
        if "SELECT id FROM drawings WHERE drawing_no" in self.sql:
            return (3,)
        if "SELECT id FROM drawing_revisions" in self.sql:
            return (4,)
        if "SELECT id FROM error_codes WHERE code" in self.sql:
            return (5,)
        if "SELECT email, name FROM users WHERE id" in self.sql:
            return ("creator@example.invalid", "Creator")
        return None

    def fetchall(self):
        if "SELECT code FROM error_codes WHERE is_active" in self.sql:
            return [("P28",)]
        return []


class LegacySubmitDB:
    def __init__(self):
        self.fake_cursor = LegacySubmitCursor()
        self.committed = False

    def cursor(self):
        return self.fake_cursor

    def commit(self):
        self.committed = True

    def close(self):
        pass


class FakeOllamaResponse:
    def __init__(self, content):
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps({"message": {"content": self.content}}).encode("utf-8")


class LocalLLMPredictionTests(unittest.TestCase):
    def test_valid_catalog_code_is_parsed(self):
        result = drawlog_app.parse_local_llm_prediction(
            '{"code":"P28","explanation":"Dimension is missing.","needs_human_review":false}',
            {"P28"},
        )
        self.assertEqual(result["code"], "P28")
        self.assertFalse(result["needs_human_review"])

    def test_ollama_request_uses_enum_schema_and_returns_description(self):
        catalog = [{"code": "P28", "description": "Dimensions available"}]
        response = FakeOllamaResponse(
            '{"code":"P28","explanation":"A basic dimension is missing.","needs_human_review":false}'
        )
        with patch.object(drawlog_app, "select_candidate_codes", return_value=catalog), patch.object(
            urllib.request, "urlopen", return_value=response
        ) as open_url:
            prediction = drawlog_app.predict_with_local_ollama("Dimension missing", catalog)
        request = open_url.call_args.args[0]
        request_data = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request_data["format"]["properties"]["code"]["enum"], ["P28", None])
        self.assertEqual(prediction["code"], "P28")
        self.assertEqual(prediction["description"], "Dimensions available")
        self.assertEqual(prediction["status"], "suggested")

    def test_unknown_code_fails_closed(self):
        result = drawlog_app.parse_local_llm_prediction(
            '{"code":"P999","explanation":"Made up code","needs_human_review":false}',
            {"P28"},
        )
        self.assertIsNone(result["code"])
        self.assertTrue(result["needs_human_review"])

    def test_missing_fields_and_malformed_json_need_review(self):
        for response in ('{"code":"P28"}', 'not json'):
            result = drawlog_app.parse_local_llm_prediction(response, {"P28"})
            self.assertIsNone(result["code"])
            self.assertTrue(result["needs_human_review"])

    def test_comment_batch_deduplicates_model_calls(self):
        db = FakeDB([("P28", "Basic dimensions available")])
        fake_result = {
            "comment": "Dimension missing", "existing_classifier_code": "P28",
            "ai_suggested_code": "P28", "official_description": "Basic dimensions available",
            "explanation": "A dimension is missing.", "status": "suggested",
            "needs_human_review": False, "classifier_model_version": "test",
            "ai_model_version": "test-model",
        }
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "test-signing-key"}), \
             patch.object(drawlog_app, "connect_to_db", return_value=db), patch.object(
            drawlog_app, "predict_comment_with_catalog", return_value=fake_result
        ) as predict:
            response = drawlog_app.app.test_client().post(
                "/api/ai/predict-local",
                json={"comments": ["Dimension missing", "Dimension missing", "  "]},
            )
        self.assertEqual(response.status_code, 200)
        predictions = response.get_json()["predictions"]
        self.assertEqual(predict.call_count, 1)
        self.assertEqual([row["status"] for row in predictions], ["suggested", "suggested", "needs_review"])

    def test_ollama_timeout_is_structured_unavailable(self):
        db = FakeDB([("P28", "Basic dimensions available")])
        for failure in (URLError("offline"), TimeoutError("timeout")):
            with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": "test-signing-key"}), \
                 patch.object(drawlog_app, "connect_to_db", return_value=db), patch.object(
                urllib.request, "urlopen", side_effect=failure
            ):
                response = drawlog_app.app.test_client().post(
                    "/api/ai/predict-local", json={"comment": "Dimension missing"}
                )
            self.assertEqual(response.status_code, 200)
            prediction = response.get_json()
            self.assertEqual(prediction["status"], "unavailable")
            self.assertTrue(prediction["needs_human_review"])
            self.assertIsNone(prediction["ai_suggested_code"])

    def test_empty_comment_is_needs_review_and_bad_request_shape_rejected(self):
        db = FakeDB([("P28", "Basic dimensions available")])
        with patch.object(drawlog_app, "connect_to_db", return_value=db):
            client = drawlog_app.app.test_client()
            empty = client.post("/api/ai/predict-local", json={"comment": " "})
            missing = client.post("/api/ai/predict-local", json={})
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.get_json()["status"], "needs_review")
        self.assertEqual(missing.status_code, 400)

    def test_feedback_accept_classifier_and_correction_need_no_ai_token(self):
        common = {"comment": "Dimension missing", "classifier_prediction": "P28"}
        accepted = drawlog_app.validate_review_feedback(
            [{**common, "final_code": "P28"}], {"P28", "P30"}, {"P28"}
        )
        corrected = drawlog_app.validate_review_feedback(
            [{**common, "final_code": "P30"}], {"P28", "P30"}, {"P28"}
        )
        self.assertEqual(accepted[0]["decision"], "kept_classifier")
        self.assertIsNone(accepted[0]["ai_suggestion"])
        self.assertEqual(accepted[0]["prediction_method"], "tfidf-logistic-regression")
        self.assertEqual(corrected[0]["decision"], "corrected")
        self.assertIsNone(corrected[0]["ai_suggestion"])

    def test_feedback_rejects_non_catalog_original_and_final_codes(self):
        base = {"comment": "Dimension missing", "classifier_prediction": "P28", "final_code": "P28"}
        with self.assertRaisesRegex(ValueError, "original classifier prediction"):
            drawlog_app.validate_review_feedback([base], {"P30"}, {"P28"})
        with self.assertRaisesRegex(ValueError, "final code"):
            drawlog_app.validate_review_feedback(
                [{**base, "final_code": "P999"}], {"P28", "P30"}, {"P28"}
            )

    def test_duplicate_feedback_upsert_does_not_overwrite_original_prediction(self):
        cursor = FakeCursor([])
        item = {"comment": "Dimension missing", "classifier_prediction": "P28", "ai_suggestion": None,
                "final_code": "P28", "decision": "kept_classifier", "prediction_method": "tfidf-logistic-regression",
                "model_version": drawlog_app.CLASSIFIER_MODEL_VERSION, "explanation": ""}
        drawlog_app.persist_review_feedback(cursor, 7, [item])
        sql, params = cursor.executed[0]
        self.assertIn("ON DUPLICATE KEY UPDATE", sql)
        update_clause = sql.split("ON DUPLICATE KEY UPDATE", 1)[1]
        self.assertNotIn("classifier_prediction =", update_clause)
        self.assertNotIn("ai_suggestion =", update_clause)
        self.assertEqual(params[0], 7)
        self.assertEqual(params[4], "P28")
        self.assertIsNone(params[5])

    def test_submit_route_rejects_invalid_review_code(self):
        db = FakeDB([("P28",)])
        payload = {
            "form_data": {"designNo": "123", "reviewerName": "EMP_2", "revisionNo": "1",
                          "reviewedDate": "2026-10-28", "drawingType": "Test", "creatorId": "EMP_1",
                          "division": "D", "pc": "PC"},
            "extracted_comments": ["Dimension missing"],
            "classifier_model_version": drawlog_app.CLASSIFIER_MODEL_VERSION,
            "review_feedback": [{"comment": "Dimension missing", "classifier_prediction": "P28",
                                  "final_code": "P999"}],
        }
        with patch.object(drawlog_app, "connect_to_db", return_value=db):
            response = drawlog_app.app.test_client().post("/submit", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("active error-code catalog", response.get_json()["error"])

    def test_legacy_submit_payload_still_uses_existing_route(self):
        db = LegacySubmitDB()
        payload = {
            "form_data": {"designNo": "123", "reviewerName": "EMP_2", "revisionNo": "1",
                          "reviewedDate": "2026-10-28", "drawingType": "Test", "creatorId": "EMP_1",
                          "division": "D", "pc": "PC", "decision": "reject"},
            "extracted_comments": ["Dimension missing"], "predicted_errors": ["P28"],
        }
        with patch.object(drawlog_app, "connect_to_db", return_value=db), patch.object(
            drawlog_app, "send_email", return_value=None
        ):
            response = drawlog_app.app.test_client().post("/submit", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(db.committed)

    def test_submit_persists_classifier_feedback_without_ai_or_signing_key(self):
        db = LegacySubmitDB()
        payload = {
            "form_data": {"designNo": "123", "reviewerName": "EMP_2", "revisionNo": "1",
                          "reviewedDate": "2026-10-28", "drawingType": "Test", "creatorId": "EMP_1",
                          "division": "D", "pc": "PC", "decision": "approve"},
            "extracted_comments": ["Dimension missing"],
            "predicted_errors": ["P28"],
            "classifier_model_version": drawlog_app.CLASSIFIER_MODEL_VERSION,
            "review_feedback": [{"comment": "Dimension missing", "classifier_prediction": "P28",
                                  "final_code": "P28"}],
        }
        with patch.dict(os.environ, {"AI_FEEDBACK_SIGNING_KEY": ""}), \
             patch.object(drawlog_app, "connect_to_db", return_value=db), \
             patch.object(drawlog_app, "table_exists", return_value=True), \
             patch.object(drawlog_app, "predict_error", return_value=["P28"]), \
             patch.object(drawlog_app, "authenticated_user", return_value={"id": 2, "emp_id": "EMP_2", "role": "employee"}), \
             patch.object(drawlog_app, "send_email", return_value=None):
            response = drawlog_app.app.test_client().post("/submit", json=payload)
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertTrue(db.committed)
        insert = next((entry for entry in db.fake_cursor.executed
                       if "INSERT INTO reviewer_error_feedback" in entry[0]), None)
        self.assertIsNotNone(insert)
        self.assertEqual(insert[1][4], "P28")
        self.assertIsNone(insert[1][5])
        self.assertEqual(insert[1][7], "kept_classifier")
        self.assertEqual(insert[1][8], "tfidf-logistic-regression")

    def test_legacy_submit_rejects_codes_outside_active_catalog(self):
        db = LegacySubmitDB()
        payload = {
            "form_data": {"designNo": "123", "reviewerName": "EMP_2", "revisionNo": "1",
                          "reviewedDate": "2026-10-28", "drawingType": "Test", "creatorId": "EMP_1",
                          "division": "D", "pc": "PC"},
            "predicted_errors": ["P999"],
        }
        with patch.object(drawlog_app, "connect_to_db", return_value=db):
            response = drawlog_app.app.test_client().post("/submit", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(db.committed)

    def test_upload_response_remains_backward_compatible(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as temp_dir, \
             patch.object(drawlog_app, "UPLOAD_FOLDER", temp_dir), \
             patch.object(drawlog_app, "connect_to_db", return_value=FakeDB([])), \
             patch.object(drawlog_app, "extract_annotations", return_value=["Dimension missing"]), \
             patch.object(drawlog_app, "predict_error", return_value=["P28"]):
            response = drawlog_app.app.test_client().post(
                "/upload", data={"file": (io.BytesIO(b"fake pdf"), "drawing.pdf")}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["predicted_errors"], ["P28"])
        self.assertEqual(response.get_json()["extracted_comments"], ["Dimension missing"])


if __name__ == "__main__":
    unittest.main()
