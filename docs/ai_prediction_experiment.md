# Error-code prediction experiment

## What is confirmed in this repository

- The current Flask prediction path extracts PDF annotation strings in `extract_annotations()`, transforms them with the TF-IDF vectorizer, and calls the Logistic Regression model in `predict_error()` (`backend/Atlashost/app.py`). `/upload` still returns its original `extracted_comments` and `predicted_errors` fields; it now also returns a classifier artifact fingerprint.
- The loaded model is a `LogisticRegression`; its serialized classes are `P1, P11, P12, P13, P14, P15, P16, P17, P18, P19, P2, P20, P22, P23, P24, P26, P27, P28, P29, P3, P30, P31, P32, P33, P34, P35, P36, P37, P38, P39, P4, P40, P41, P46, P47, P48, P49, P4a, P5, P50, P51, P57, P58, P59, P6, P7, P70, P8, P9` (49 labels). The checked-in artifacts were created with scikit-learn 1.4.2; the current environment is 1.7.2 and warns about that mismatch. The files are not rewritten by this feature.
- `primary_checklist.json` contains `seq_nr`, standard references and drawing-type applicability fields. Its sequence identifiers are not model classes or database IDs. Several descriptions resemble the UI descriptions, but no explicit crosswalk is present.
- `training_mapping.json` maps numeric strings to training topic names. Application code uses this for training recommendations; no code establishes it as the classifier label map.
- Database `error_codes.id` is a numeric surrogate primary key, while `error_codes.code` is the displayed code string. No repository code or schema maps those IDs to `Pxx` values. The checklist sequence fields (for example `"1.0"` and `"4a"`) likewise have no declared join to classifier labels or database IDs. Matching text in some descriptions is not a verified identifier mapping.
- Schema documents describe `error_codes(code, description, is_active)` and `revision_error_codes(revision_id, error_code_id)`. The running database was not queried. The `error_codes` table is the current operational catalog source in the API, but it is **not yet verified as the authoritative master**: `/submit` historically inserted any unknown submitted string into it, and the reviewer and report UI description maps are not identical.
- No verified labeled evaluation dataset or model training script was found. Do not interpret existing model outputs, checklist sequence numbers or training-topic IDs as ground truth.

The LLM path uses only active database catalog entries and a small candidate subset selected using the existing vectorizer's description similarity plus current classifier classes. It does not send the complete checklist or `training_mapping.json` because their mapping to error-code labels is unverified. It returns no confidence score.

## Prediction and review flow

1. `/upload` remains the baseline PDF extraction and classifier route.
2. The Angular review screen calls `GET /api/error-codes` and then posts all comments to `POST /api/ai/predict-local`. Duplicate comments are evaluated once per request.
3. The UI keeps classifier output and LLM output separate. Reviewers can accept the LLM suggestion, select another active catalog code, mark the row for review, or remove/restore the comment. The official code description is sourced from the API; the model explanation is shown separately.
4. `/submit` keeps the legacy payload shape for old clients, but now checks its codes against active database rows too. For the new UI it also accepts per-comment `review_feedback`. Before writing, it checks codes against active database rows, checks that the classifier artifact version has not changed, and recomputes the baseline on the server. Final codes continue to be written to `revision_error_codes`.
5. `reviewer_error_feedback` stores the original comment, first-seen classifier prediction and AI suggestion, final code, decision, model identifier, optional explanation, authenticated reviewer ID and review time. A unique revision/comment key makes retries update the final choice without overwriting the original predictions.
6. The login endpoint issues an eight-hour signed bearer token when `AI_FEEDBACK_SIGNING_KEY` is configured. The Angular interceptor sends it to the backend. Feedback history checks the database user is the drawing creator or assigned reviewer (admins can view); CSV export is limited to database admins. Browser-only session data is not accepted as proof of identity by these APIs.

## Required database migration

The configured database was checked read-only on 2026-11-03. `reviewer_error_feedback` was absent, so this migration is **pending** and feedback persistence/history/export are not live there yet. No schema changes were run. The active catalog query returned active `Pxx` string labels (including codes the current classifier does not predict); the feedback migration is unrelated to those catalog rows. Have the database owner review and apply after backup:

```sql
SOURCE backend/migrations/20261028_create_reviewer_error_feedback.sql;
```

Or from PowerShell in the repository root, with the approved database values substituted and the password entered at the prompt:

```powershell
mysql --host=<approved-db-host> --user=<approved-db-user> --password <approved-db-name> < backend\migrations\20261028_create_reviewer_error_feedback.sql
```

The migration only creates a new table, with foreign keys to `drawing_revisions` and `users`. It does not modify existing data or tables. The Angular page checks `feedback_ready`; it prevents feedback submission until this migration has been applied. The migration has not been applied, so a real feedback save/read round trip has not been verified.

## Feedback history and evaluation export

- `GET /api/drawings/<drawing_no>/<revision>/feedback` returns the revision's feedback only to its active creator, assigned reviewer, or an admin. It requires the bearer token returned by `/admin-login`.
- `GET /api/reviewer-feedback/export.csv` is admin-only. It exports only rows whose final code is still active and whose decision is `accepted_ai`, `corrected`, or `kept_classifier`. Rows marked `needs_review` or `removed` are excluded. Export columns match the evaluator's input (`drawing_id`, `comment`, `gold_code`) and include decision/provenance columns too.
- The Angular feedback-history panel loads for a drawing/revision route; an admin can download the CSV there. The CSV can be passed directly to the evaluator:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\evaluate_error_codes.py --input path\to\reviewer-confirmed-error-codes.csv
```

The evaluator requires at least two drawing groups for its leakage-safe holdout and the active catalog. It scores stored Ollama suggestions when present, makes no Ollama network calls, and does not retrain the classifier.

## Data validation, analysis, evaluation and controlled retraining

No reviewer feedback export or verified labeled dataset is present in the repository, and the feedback table is absent in the configured database. The checked-in CSV is a blank template. Do not fill `gold_code` from a prediction; enter a code only after a human has confirmed it. The current export uses `review_decision` values `accepted_ai`, `corrected`, or `kept_classifier`; manually labeled rows must explicitly use `manual_confirmed`.

The admin **Export full audit (CSV)** includes reviewed, unreviewed, removed and inactive-code rows, with row-level eligibility/reason fields. The normal confirmed-example export remains training-safe. Validation writes three outputs (a validated CSV, a full audit CSV, and a JSON count report); excluded records are retained in the audit with reasons. Exact duplicate comments are reported and later copies excluded; if the same normalized comment has conflicting labels, every copy is excluded for human resolution. The current active catalog is read from the configured database, or an approved JSON catalog snapshot can be passed with `--catalog`.

```powershell
# Get the admin audit CSV from the UI, then validate every row against the active catalog.
backend\.venv\Scripts\python.exe backend\scripts\validate_feedback_dataset.py --input path\to\reviewer-feedback-audit.csv --output-dir backend\data\validated

# Report reviewed/unique examples, label distribution, corrections, duplicates, missing labels and imbalance.
backend\.venv\Scripts\python.exe backend\scripts\analyze_feedback_dataset.py --input backend\data\validated\reviewer-feedback-audit.audit.csv --output backend\data\validated\label-analysis.json

# Compare baseline, three fixed TF-IDF/Logistic Regression configurations, and stored Ollama predictions.
backend\.venv\Scripts\python.exe backend\scripts\evaluate_error_codes.py --input backend\data\validated\reviewer-feedback-audit.validated.csv --output backend\data\validated\evaluation.json

# Train and test a separate candidate. It fits only the training drawings and never changes the baseline.
backend\.venv\Scripts\python.exe backend\scripts\train_error_code_candidate.py --input backend\data\validated\reviewer-feedback-audit.validated.csv --config word-bigram-balanced --output-dir backend\models\candidates
```

The split is deterministic and grouped by drawing. The TF-IDF configurations are fixed in the script before looking at evaluation results; the evaluation partition is never used to fit vectorizers/classifiers or tune parameters. Ollama is not called during evaluation: its stored suggestion is scored only where one already exists. Per-class precision/recall, accuracy, macro-F1, weighted-F1, confusion matrices, evaluated counts and mistakes are recorded. Fewer than 20 held-out labels are exploratory; candidate creation requires `--approve-small-sample` in that case. A single drawing cannot be split safely. There is no measured accuracy result until verified data is available.

Candidate joblib artifacts and JSON manifests are content-versioned and saved separately under the ignored `backend/models/candidates/` path. The manifest records the data hash, split, model configuration, baseline fingerprint and both metric reports. No candidate is automatically promoted.

After an authorized reviewer has examined the dataset and candidate metrics, promotion is an explicit operation. Use the actual content-versioned artifact and a new backup directory. The command requires both approval flags and preserves the existing classifier and vectorizer in that backup before swapping either artifact:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\promote_error_code_candidate.py `
  --candidate backend\models\candidates\error-code-candidate-<version>.joblib `
  --model-path backend\Atlashost\error_code_classifier_model.pkl `
  --vectorizer-path backend\Atlashost\tfidf_vectorizer.pkl `
  --backup-dir backend\models\rollback\<change-id> `
  --confirm-candidate-evaluated --approve-production-overwrite
```

The command was not run. To roll back a promoted version, restore both artifacts from the recorded backup directory, then restart Flask:

```powershell
Copy-Item -LiteralPath backend\models\rollback\<change-id>\error_code_classifier_model.pkl -Destination backend\Atlashost\error_code_classifier_model.pkl -Force
Copy-Item -LiteralPath backend\models\rollback\<change-id>\tfidf_vectorizer.pkl -Destination backend\Atlashost\tfidf_vectorizer.pkl -Force
```

Never promote based only on a small or selectively chosen sample. The production artifacts remain the baseline until the team approves a candidate and its evaluation.

## Configuration and run

The backend reads existing `.env` settings and supports:

```text
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_CHAT_URL=http://127.0.0.1:11434/api/chat
OLLAMA_TIMEOUT_SECONDS=30
AI_FEEDBACK_SIGNING_KEY=<random-secret-at-least-32-bytes>
```

Generate a signing key once and store it in the backend `.env` file (or set it in the backend process environment). Keep the same key on every backend worker; do not commit or log it. It signs each AI suggestion and short-lived login session. Without this key, AI and the new authenticated feedback APIs are unavailable; the baseline classifier and legacy submit path remain available.

Timeouts are bounded to 1–120 seconds. The local model must already be available in Ollama. Ollama failures return `unavailable` with `needs_human_review=true`; they do not select an arbitrary code.

From the repository root:

```powershell
backend\.venv\Scripts\python.exe backend\Atlashost\app.py
cd frontend
npm start
```

## Evaluation

The only evaluation input is a blank template: `backend/data/error_code_evaluation_template.csv`. Add only reviewer-confirmed labels, with columns `drawing_id,comment,gold_code`; never copy predictions into `gold_code`.

```powershell
backend\.venv\Scripts\python.exe backend\scripts\evaluate_error_codes.py --input backend\data\error_code_evaluation_template.csv
```

The script uses a deterministic drawing-group holdout (seed 42 by default), evaluates both methods on the same held-out comments, reports accuracy, per-code precision/recall when a code has at least two gold examples, a confusion matrix and errors. It requires the database catalog and local Ollama. It does not train or overwrite a model. Fewer than 20 held-out examples are explicitly marked exploratory; the current template has no labels, so there are no accuracy results yet.

## Open decisions

1. Confirm and clean/lock down the authoritative error-code catalog. Until then, API validation is against active `error_codes` rows, not an independently verified engineering master.
2. Confirm whether the project owner can provide a human-labeled historical evaluation set and a reliable reviewer identity claim from backend authentication.
3. Review the scikit-learn model/runtime version mismatch before relying on baseline comparisons.
