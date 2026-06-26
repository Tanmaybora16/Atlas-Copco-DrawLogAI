# Atlas Copco DrawLogAI: Phase 5 - Backend & AI Engine Deep Analysis

This document provides a comprehensive analysis of the Flask-based backend server, its startup process, middleware logic, database transactions management, and detailed API documentation for **Atlas Copco DrawLogAI**.

---

## 1. System Runtime & Architecture Core

### A. Framework
* **Flask (Python 3.8+):** Light-weight microframework.
* **WSGI Server (Waitress):** Run as a multi-threaded Python WSGI container (`threads=4`) in production.
* **Windows Integration (`pywin32` / `win32serviceutil`):** Hosted directly inside a dedicated Windows Service (`FlaskService`) to ensure automatic restarts and persistence on Windows Server.

### B. Entry Point & Startup Process
1. **Windows Service startup** triggers `flask-service.py` to spawn `wsgi.py`.
2. **Buffer Configuration:** Standard outputs are set to unbuffered mode to ensure logs print immediately:
   ```python
   sys.stdout.reconfigure(line_buffering=True)
   sys.stderr.reconfigure(line_buffering=True)
   ```
3. **Environment Loading:** The server searches for `.env` files in parent/sibling paths, reads keys line-by-line, strips quotes, and writes configurations to `os.environ`.
4. **Machine Learning Model Initialization:** Serialized files are loaded into memory using `joblib` at startup:
   * `tfidf_vectorizer.pkl` -> loaded as `tfidf_vectorizer`
   * `error_code_classifier_model.pkl` -> loaded as `model`
5. **Port Binding:** Waitress binds to socket `127.0.0.1:5000`.

### C. Middleware (Flask Hooks)
* **`before_request` Hook:** Triggered before routing executes. Spawns a database connection using `pymysql.connect` with retries, configures session character sets, defines strict SQL modes, and caches the database connection under global context `g.db`.
* **`teardown_request` Hook:** Triggered after the request loop terminates. Cleans up thread space by executing `.close()` on context database connections.

### D. Architectural Patterns (Controllers, Services, Repositories)
* Due to the microservice architecture, API routing, database updates, ML inference, and notifications dispatch are unified inside the main [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) controller. Data accesses are written as raw MySQL strings via `pymysql.cursors`.

### E. Authentication & Authorization
* **Authentication:** Password validation is handled using `bcrypt.checkpw()` against cryptographically hashed database strings (`password_hash` in the `users` table). 
* **Session Lifecycles:** The Flask API remains state-less. Requests are validated on-demand, and authentication tokens are verified by Angular router guards.
* **OTP Engine:** Password resets generate a 4-digit code (`secrets.randbelow(9000) + 1000`), hash it using `bcrypt`, commit it to the database table `login_otp` with an expiration window set to `NOW() + 5 minutes`, and clear the OTP record immediately upon consumption.

---

## 2. API Endpoint Documentation

---

### A. Authentication & Security Endpoints

#### 1. User Login (`POST /admin-login`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  { "username": "EMP_101", "password": "securepassword" }
  ```
* **Response JSON (Success - 200):**
  ```json
  {
    "success": true,
    "status": "OK",
    "access_type": "HR",
    "name": "John Doe",
    "message": "Login Successful"
  }
  ```
* **Business Logic:** Looks up active accounts in `users` matching the username. Validates passwords using `bcrypt.checkpw()`. Maps database role `admin` to the access string `HR`, and any other role to `Employee`.
* **Database Tables:** `users`
* **Dependencies:** `bcrypt`, `pymysql`

#### 2. Initiate Password Reset (`POST /auth/forgot-password/initiate`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  { "emp_id": "EMP_101", "email": "johndoe@atlascopco.com" }
  ```
* **Response JSON (Success - 200):**
  ```json
  { "success": true, "message": "OTP sent to your registered email." }
  ```
* **Business Logic:** Cross-checks active user accounts and emails. Generates a random 4-digit OTP, hashes it using `bcrypt`, upserts it to `login_otp` (valid for 5 minutes), and emails it to the user.
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `secrets`, `bcrypt`, `smtplib`

#### 3. Verify OTP Reset Code (`POST /auth/forgot-password/verify`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  { "emp_id": "EMP_101", "otp": "1234" }
  ```
* **Response JSON (Success - 200):**
  ```json
  { "success": true, "message": "OTP verified" }
  ```
* **Business Logic:** Queries non-expired active OTPs linked to the user. Validates the input code against the stored database hash using `bcrypt`.
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `bcrypt`

#### 4. Complete Password Reset (`POST /auth/forgot-password/reset`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "emp_id": "EMP_101",
    "otp": "1234",
    "new_password": "NewSecurePassword1!",
    "confirm_password": "NewSecurePassword1!"
  }
  ```
* **Response JSON (Success - 200):**
  ```json
  { "success": true, "message": "Password updated successfully" }
  ```
* **Business Logic:** Re-validates the OTP. Checks the new password against database history (prevents reuse). Updates `users.password_hash` with the new bcrypt string, deletes the consumed OTP record, and sends a confirmation email.
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `bcrypt`, `re` (password complexity checks), `smtplib`

#### 5. Change Password (`POST /auth/change-password`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "emp_id": "EMP_101",
    "current_password": "OldPassword1!",
    "new_password": "NewSecurePassword2!",
    "confirm_password": "NewSecurePassword2!"
  }
  ```
* **Response JSON (Success - 200):**
  ```json
  { "success": true, "message": "Password updated successfully" }
  ```
* **Business Logic:** Accessible only within active sessions. Verifies current password hash in the `users` table. Checks new password formatting rules, hashes the new password, updates the DB, and emails confirmation notes.
* **Database Tables:** `users`
* **Dependencies:** `bcrypt`, `re`, `smtplib`

---

### B. Drawing & Audit Workflow Endpoints

#### 6. Extract PDF annotations & Classify (`POST /upload`)
* **Method:** `POST`
* **Request Content Type:** `multipart/form-data`
* **Payload:** File input key `file` (containing the PDF).
* **Response JSON (Success - 200):**
  ```json
  {
    "message": "File processed successfully",
    "file_name": "9097556546.pdf",
    "file_path": "uploads/9097556546.pdf",
    "extracted_comments": ["dim for hole not shown"],
    "predicted_errors": ["E_101"]
  }
  ```
* **Business Logic:** Validates that the file has a `.pdf` extension. Saves it to disk. Invokes `extract_annotations()` (uses PyMuPDF to parse PDF comments, ignoring system stamps). Sends comments list to `predict_error()` (TF-IDF vectorisation followed by classification).
* **Database Tables:** None
* **Dependencies:** `fitz` (PyMuPDF), `joblib`, `sklearn`

#### 7. Submit Drawing Audit (`POST /submit`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "form_data": {
      "designNo": "9097556546",
      "reviewerName": "EMP_102",
      "revisionNo": "1",
      "reviewedDate": "2026-06-24",
      "drawingType": "Sheet Metal Drawing",
      "creatorId": "EMP_101",
      "division": "Mining",
      "pc": "PC_101",
      "task_number": "T_1001",
      "decision": "approve",
      "comments": "Minor adjustment verified"
    },
    "predicted_errors": ["E_101"],
    "extracted_comments": ["dim for hole not shown"],
    "file_bytes_b64": "<base64_string>",
    "file_path": "uploads/9097556546.pdf"
  }
  ```
* **Response JSON (Success - 200):**
  ```json
  {
    "ok": true,
    "message": "Data saved successfully",
    "drawing_id": "DR_9097556546",
    "revision": 1
  }
  ```
* **Business Logic:** Validates that all required fields are present. Resolves internal database keys for Creator and Reviewer. Creates the drawing entry if it doesn't exist, upserts the revision details, saves the PDF bytes inside `drawing_files`, wipes out old errors for this revision, links new errors inside `revision_error_codes`, commits the transaction, and sends an email notification to the creator.
* **Database Tables:** `users`, `drawings`, `drawing_revisions`, `drawing_files`, `error_codes`, `revision_error_codes`
* **Dependencies:** `base64`, `json`, `smtplib`, `pytz`

#### 8. Batch Drawing Submission (`POST /submit-batch`)
* **Method:** `POST`
* **Request Content Type:** `multipart/form-data`
* **Payload:** File array key `pdfs`, Creator Emp ID, Reviewer Emp ID, Reviewer Email, PC, Drawing Type, Task Number, Comments, client revision number, override flags.
* **Response JSON (Success - 200):**
  ```json
  {
    "success": true,
    "message": "Processed files successfully.",
    "results": [
      { "drawing_id": "DR_9097556546", "revision": 2, "previous_revision": 1, "type": "updated" }
    ],
    "rejected": ["invalidname.pdf"]
  }
  ```
* **Business Logic:** Evaluates filenames. Standard files must start with a 10-digit number. Non-standard files are rejected unless the user explicitly overrides them. Processes valid drawings in a single database transaction loop:
  * For new drawings, creates database entries with revision 1.
  * For existing drawings, reads current maximum revision numbers and auto-increments them (`MAX(revision_no) + 1`).
  * Saves PDF bytes inside `drawing_files` and commits database queries.
  * Dispatches an email summary list to the reviewer.
* **Database Tables:** `users`, `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `smtplib`

#### 9. Prefill Reviewer Form (`GET /prefill-upload`)
* **Method:** `GET`
* **Query Params:** `drawing_id=DR_9097556546`, `revision=1` (optional).
* **Response JSON (Success - 200):**
  ```json
  {
    "ok": true,
    "drawing_id": "DR_9097556546",
    "design_no_plain": "9097556546",
    "revision_no": 1,
    "creator_id": "EMP_101",
    "reviewer_id": "EMP_102",
    "emp_PC": "PC_101",
    "emp_division": "Mining",
    "emp_team": "Team_1",
    "has_pdf": true,
    "Drawing_Type": "Sheet Metal Drawing",
    "reviewed_date": "2026-06-24T16:00:00",
    "task_number": "T_1001"
  }
  ```
* **Business Logic:** Queries the latest revision data (or a specific revision if passed) from database tables and returns creator department information and PDF availability states.
* **Database Tables:** `drawings`, `drawing_revisions`, `users`, `drawing_files`
* **Dependencies:** `pymysql`

---

### C. Canvas & PDF Markups Endpoints

#### 10. Load Drawing PDF Inline (`GET /drawings/<drawing_id>/<int:revision>/pdf/view`)
* **Method:** `GET`
* **Response:** Serve inline PDF binary file stream (`mimetype="application/pdf"`).
* **Business Logic:** Queries the database table `drawing_files` to retrieve the PDF binary BLOB matching the drawing ID and revision number.
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `Response`

#### 11. Download Drawing PDF (`GET /drawings/<drawing_id>/<int:revision>/pdf/download`)
* **Method:** `GET`
* **Response:** Serve PDF file as an attachment (`as_attachment=True`).
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `send_file`

#### 12. Save Canvas Markups JSON (`POST /annotations/<drawing_id>`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "documentId": "DR_9097556546",
    "annotations": [
      { "id": "1", "page": 1, "x": 0.5, "y": 0.4, "type": "text", "text": "Needs review" }
    ]
  }
  ```
* **Response JSON (Success - 200):**
  ```json
  { "ok": true, "message": "Annotations saved" }
  ```
* **Business Logic:** Saves raw annotation coordinates, drawing points, and stamp definitions as a JSON file locally on disk under `uploads/annotations/<drawing_id>.json`.
* **Database Tables:** None
* **Dependencies:** `json`, `secure_filename`

#### 13. Load Canvas Markups JSON (`GET /annotations/<drawing_id>`)
* **Method:** `GET`
* **Response JSON (Success - 200):**
  ```json
  {
    "annotations": [
      { "id": "1", "page": 1, "x": 0.5, "y": 0.4, "type": "text", "text": "Needs review" }
    ]
  }
  ```
* **Business Logic:** Reads JSON files from `uploads/annotations/<drawing_id>.json` and returns the array.
* **Database Tables:** None

#### 14. Bake Canvas Markups onto PDF (`POST /drawings/<drawing_id>/<int:revision>/pdf/annotated/download`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "annotations": [
      { "page": 1, "x": 0.5, "y": 0.4, "type": "stamp", "stampType": "correct" },
      { "page": 1, "x": 0.2, "y": 0.3, "type": "text", "text": "Incorrect angle" }
    ]
  }
  ```
* **Response:** Serves modified PDF with flattened markups as an attachment.
* **Business Logic:** Retrieves the original PDF from database BLOBs. Opens it with PyMuPDF. Evaluates annotation types:
  * For pen paths, draws lines on page shapes.
  * For check/cross symbols, draws shapes directly on the PDF stream (permanently flattened).
  * For text comments and stamps, places interactive `add_freetext_annot` elements on the PDF, allowing them to remain interactive after download.
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `fitz` (PyMuPDF)

#### 15. Upload & Overwrite Stored PDF (`POST /drawings/<drawing_id>/<int:revision>/pdf/annotated/upload`)
* **Method:** `POST`
* **Request Content Type:** `multipart/form-data`
* **Payload:** File input key `file` (the new annotated PDF).
* **Response JSON (Success - 200):**
  ```json
  { "ok": true, "filename": "DR_9097556546-01_annotated.pdf" }
  ```
* **Business Logic:** Overwrites the binary file stored in database table `drawing_files.file_data` for the given drawing revision with the uploaded PDF bytes.
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `pymysql`

---

### D. Administration & Quality Analytics Endpoints

#### 16. Fetch Active Employees (`GET /fetch-all-employees`)
* **Method:** `GET`
* **Response JSON (Success - 200):**
  ```json
  [
    {
      "Emp_ID": "EMP_101",
      "Emp_Name": "John Doe",
      "Emp_Email": "johndoe@atlascopco.com",
      "Emp_Division": "Mining",
      "Emp_PC": "PC_101",
      "Emp_Team": "Team_1"
    }
  ]
  ```
* **Business Logic:** Fetches all active users from the database, mapping schema columns to match old capitalized API key styles for frontend backward compatibility.
* **Database Tables:** `users`

#### 17. Add Employee (`POST /add-employee`)
* **Method:** `POST`
* **Request JSON:**
  ```json
  {
    "Emp_ID": "101",
    "Emp_Name": "John Doe",
    "EMP_Email": "johndoe@atlascopco.com",
    "Emp_Division": "Mining",
    "Emp_PC": "PC_101",
    "Emp_Team": "Team_1"
  }
  ```
* **Response JSON (Success - 201):**
  ```json
  { "success": true, "message": "Employee added successfully" }
  ```
* **Business Logic:** Formats the username as `EMP_<input_id>`. Computes default passwords using the user's email address and hashes it using `bcrypt`. Inserts the user record into the database, commits the query, and triggers welcome credential emails.
* **Database Tables:** `users`
* **Dependencies:** `bcrypt`, `smtplib`

#### 18. Soft Delete Employee (`DELETE /delete-employee/<emp_id>`)
* **Method:** `DELETE`
* **Response JSON (Success - 200):**
  ```json
  { "success": true, "message": "Employee deleted successfully!" }
  ```
* **Business Logic:** Validates the employee identifier structure. Removes pending OTPs linked to the user and updates `users.is_active = FALSE`.
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `re`

#### 19. Quality Overview KPIs (`GET /api/overview-dashboard`)
* **Method:** `GET`
* **Query Params:** `start_date=2026-01-01`, `end_date=2026-06-24` (optional).
* **Response JSON (Success - 200):**
  ```json
  {
    "kpis": { "totalAudits": 45, "passRatio": 80.5, "pendingReviews": 0 },
    "statusDistribution": [
      { "status": "Correct", "count": 36 },
      { "status": "Wrong", "count": 9 }
    ],
    "teamDistribution": [
      { "team": "Team_1", "accept": 10, "reject": 2, "count": 12 }
    ],
    "auditorLeaderboard": [
      { "name": "EMP_102 - Jane Auditor", "count": 45 }
    ],
    "monthlyTrend": [
      { "month": "Jun", "total": 10, "approved": 8, "sort_idx": 6, "pass_ratio": 80.0 }
    ],
    "recentAudits": [
      { "task_no": "T_1001", "task_name": "DR_9097556546", "auditor_name": "Jane Auditor", "decision": "Correct" }
    ]
  }
  ```
* **Business Logic:** Aggregates database records to return quality metrics, status ratios, division distributions, leaderboard details, and recent actions lists.
* **Database Tables:** `drawing_revisions`, `drawings`, `users`
* **Dependencies:** `pymysql`

#### 20. Monthly Drawing Status (`GET /api/monthly-drawing-status`)
* **Method:** `GET`
* **Query Params:** `team=Team_1`, `pc=PC_101`, `start_date=2026-01-01`, `end_date=2026-06-24` (optional).
* **Response JSON (Success - 200):**
  ```json
  {
    "Jun-2026": { "approved": 8, "rejected": 2 }
  }
  ```
* **Business Logic:** Aggregates approved and rejected counts grouped by month. Handles PC filters and falls back to user PC records for legacy drawings.
* **Database Tables:** `drawing_revisions`, `drawings`, `users`

#### 21. Top Error Pareto Metrics (`GET /api/trend-error-report`)
* **Method:** `GET`
* **Query Params:** `team=Team_1`, `pc=PC_101`, `start_date=2026-01-01`, `end_date=2026-06-24`.
* **Response JSON (Success - 200):**
  ```json
  [
    { "error_code": "E_101", "count": 15 }
  ]
  ```
* **Business Logic:** Aggregates error occurrences by error code and returns the top 10 error codes count.
* **Database Tables:** `revision_error_codes`, `error_codes`, `drawing_revisions`, `drawings`, `users`

---

### E. List & Structural Entity Endpoints

#### 22. Divisions API (`GET` / `POST` / `DELETE` on `/api/structure/divisions`)
* **Method:** `GET` | `POST` | `DELETE`
* **POST Request JSON:** `{ "name": "Mining" }`
* **Business Logic:**
  * `GET`: Lists all active divisions.
  * `POST`: Inserts division name. Re-activates soft-deleted division if the name exists.
  * `DELETE`: Deactivates division.
* **Database Tables:** `structure_divisions`

#### 23. Product Companies API (`GET` / `POST` / `DELETE` on `/api/structure/pcs`)
* **Method:** `GET` | `POST` | `DELETE`
* **POST Request JSON:** `{ "name": "PC_101", "division_id": 1 }`
* **Business Logic:** Manages product company listings.
* **Database Tables:** `structure_pcs`

#### 24. Teams API (`GET` / `POST` / `DELETE` on `/api/structure/teams`)
* **Method:** `GET` | `POST` | `DELETE`
* **POST Request JSON:** `{ "name": "Team_1" }`
* **Business Logic:** Manages team listings.
* **Database Tables:** `structure_teams`
