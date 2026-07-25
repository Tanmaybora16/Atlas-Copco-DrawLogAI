# Atlas Copco DrawLogAI: Phase 14 & 15 - Feature Mapping & Change Impact

This document catalogs the system features, their code-level mappings, and a change impact analysis detailing dependencies and regression risks for **Atlas Copco DrawLogAI**.

---

## 1. Feature Inventory & Code Mapping

---

### A. Feature 1: User Authentication & Security
* **Purpose:** Handles administrator/designer authentication and password self-service recovery.
* **Frontend Files:**
  * Component: [admin-login.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/admin-login/admin-login.component.ts)
  * Component: [forgot-password.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/forgot-password/forgot-password.component.ts)
  * Component: [change-password.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/change-password/change-password.component.ts)
  * Service: [auth.service.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/auth.service.ts)
  * Interceptor: [auth.interceptor.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/auth.interceptor.ts)
  * Guard: [auth.guard.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/auth.guard.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `admin_login`, `forgot_password_initiate`, `forgot_password_verify`, `forgot_password_reset`, `change_password`)
* **API Endpoints:**
  * `POST /admin-login`
  * `POST /auth/forgot-password/initiate`
  * `POST /auth/forgot-password/verify`
  * `POST /auth/forgot-password/reset`
  * `POST /auth/change-password`
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `bcrypt`, `secrets`, `smtplib`, `sessionStorage`

---

### B. Feature 2: Employee Account Administration
* **Purpose:** Provides user CRUD tools for HR managers, enabling account creation and deactivation.
* **Frontend Files:**
  * Component: [employee.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/employee/employee.component.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `add_employee`, `edit_employee`, `delete_employee`, `fetch_all_employees`)
* **API Endpoints:**
  * `GET /fetch-all-employees`
  * `POST /add-employee`
  * `POST/PUT /edit-employee`
  * `DELETE /delete-employee/<emp_id>`
* **Database Tables:** `users`, `login_otp`
* **Dependencies:** `bcrypt`, `smtplib`, Forms Module

---

### C. Feature 3: Organization Structure Management
* **Purpose:** Enables administrators to define divisions, Product Companies (PCs), and teams.
* **Frontend Files:**
  * Component: [structure.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/structure/structure.component.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `get_divisions`, `add_division`, `delete_division`, `get_pcs`, `add_pc`, `delete_pc`, `get_teams`, `add_team`, `delete_team`)
* **API Endpoints:**
  * `GET` / `POST` / `DELETE` on `/api/structure/divisions`
  * `GET` / `POST` / `DELETE` on `/api/structure/pcs`
  * `GET` / `POST` / `DELETE` on `/api/structure/teams`
* **Database Tables:** `structure_divisions`, `structure_pcs`, `structure_teams`
* **Dependencies:** `pymysql`

---

### D. Feature 4: Drawing Registration & Batch Submission
* **Purpose:** Allows designers to upload multiple drawing PDFs, validate file naming formats, and auto-increment revisions.
* **Frontend Files:**
  * Component: [submission.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/submission/submission.component.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `submit_batch`, `extract_drawing_id_from_name`, `extract_revision_from_name`)
* **API Endpoints:**
  * `POST /submit-batch`
  * `GET /get-employees`
  * `GET /get-employee/<emp_id>`
* **Database Tables:** `users`, `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `pymysql`, `smtplib`, SweetAlert2

---

### E. Feature 5: AI-Assisted Drawing Audit Log
* **Purpose:** Extract annotations from PDFs, classify notes using machine learning models, and log audited drawings.
* **Frontend Files:**
  * Component: [uploads.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/uploads/uploads.component.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `upload_file`, `submit_data`, `extract_annotations`, `predict_error`)
* **API Endpoints:**
  * `POST /upload`
  * `POST /submit`
  * `GET /prefill-upload`
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`, `error_codes`, `revision_error_codes`
* **Dependencies:** `fitz` (PyMuPDF), `joblib` (Classifier and Vectorizer), Scikit-Learn

---

### F. Feature 6: Interactive Canvas Markup & Baking
* **Purpose:** Web-based interface to draw freehand vectors, place text notes/stamps, and bake annotations into PDFs.
* **Frontend Files:**
  * Component: [canvas.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/canvas/canvas.component.ts)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `view_pdf`, `download_pdf`, `download_annotated_pdf`, `upload_annotated_pdf`, `save_annotations`, `load_annotations`)
* **API Endpoints:**
  * `GET /drawings/<drawing_id>/<revision>/pdf/view`
  * `GET /drawings/<drawing_id>/<revision>/pdf/download`
  * `POST /drawings/<drawing_id>/<revision>/pdf/annotated/download`
  * `POST /drawings/<drawing_id>/<revision>/pdf/annotated/upload`
  * `GET` / `POST` on `/annotations/<drawing_id>`
* **Database Tables:** `drawings`, `drawing_revisions`, `drawing_files`
* **Dependencies:** `pdfjs-dist` (PDF.js worker), `fitz` (PyMuPDF)

---

### G. Feature 7: Quality Analytics Reports & Dashboards
* **Purpose:** Aggregates database audit records to serve Quality KPI dashboards, charts, and Excel spreadsheets.
* **Frontend Files:**
  * Component: [reports.component.ts](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/reports/reports.component.ts)
  * Chart Components: [report-dashboard](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/report-dashboard/), [report-table](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/report-table/), [bar-chart](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/bar-chart/), [column-chart](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/column-chart/), [line-chart](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components/line-chart/)
* **Backend Files:**
  * Controller: [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) (functions: `overview_dashboard`, `monthly_drawing_status`, `monthly_error_report`, `trend_error_report`, `employee_drawing_status`, `error_summary`, `task_report`, `task_summary`, `get_employee_ids`, `get_drawing_ids`, `get_task_numbers`)
* **API Endpoints:**
  * `GET /api/overview-dashboard`
  * `GET /api/monthly-drawing-status`
  * `GET /api/monthly-error-report`
  * `GET /api/trend-error-report`
  * `GET /api/employee-drawing-status`
  * `GET /api/error-summary`
  * `GET /api/task-report`
  * `GET /api/task-summary`
  * `GET /api/employees-dropdown`
  * `GET /api/drawings-dropdown`
  * `GET /api/tasks-dropdown`
* **Database Tables:** `drawings`, `drawing_revisions`, `revision_error_codes`, `error_codes`, `users`
* **Dependencies:** `pymysql`, Chart.js

---

## 2. Change Impact Analysis (Regression Assessment)

This section maps out what breaks and which endpoints/pages are affected if a core module is modified.

```mermaid
graph TD
    classDef danger fill:#fee2e2,stroke:#ef4444,stroke-width:2px;
    classDef warning fill:#ffedd5,stroke:#f97316,stroke-width:2px;

    UserSchema[1. Modify User Schema / Auth]:::danger
    DrawingStorage[2. Modify Drawing Storage System]:::danger
    MLModels[3. Re-train / Re-compile ML models]:::warning
    CanvasLayer[4. Modify Canvas coordinates / annotations JSON]:::warning
    ReportsAggregation[5. Modify Reports SQL queries]:::warning

    UserSchema -->|Breaks| LoginFlow[Login & Passwords resets]
    UserSchema -->|Affects APIs| AuthAPIs[/admin-login, /auth/*, /add-employee]
    UserSchema -->|Affects Pages| LoginPage[Login, ForgotPassword, Employee, Structure]
    UserSchema -->|Affects Tables| UserTable[(users, login_otp)]

    DrawingStorage -->|Breaks| BlobSave[PDF upload & PDF view]
    DrawingStorage -->|Affects APIs| SubmitAPIs[/submit, /submit-batch, /drawings/*/download]
    DrawingStorage -->|Affects Pages| SubmissionPage[Submission, Uploads, Canvas, Requests]
    DrawingStorage -->|Affects Tables| DrawingTable[(drawings, drawing_revisions, drawing_files)]

    MLModels -->|Breaks| AnnotationParse[AI error classification]
    MLModels -->|Affects APIs| UploadAPI[/upload]
    MLModels -->|Affects Pages| UploadsPage[Uploads Page]
    MLModels -->|Affects Tables| ErrorTables[(error_codes, revision_error_codes)]

    CanvasLayer -->|Breaks| AnnotationLoading[Saving Canvas edits & Baking checkmarks]
    CanvasLayer -->|Affects APIs| CanvasAPIs[/annotations/*, /drawings/*/pdf/annotated/*]
    CanvasLayer -->|Affects Pages| CanvasPage[Canvas Page]
    CanvasLayer -->|Affects Tables| AnnotationFiles[(disk json files)]

    ReportsAggregation -->|Breaks| QualityCharts[Dashboard visual stats]
    ReportsAggregation -->|Affects APIs| ReportAPIs[/api/overview-dashboard, /api/*-report]
    ReportsAggregation -->|Affects Pages| ReportsPage[Reports Page]
```

### A. Modifying User Schemas or Authentication Code
* **What Breaks:** All user login actions, password resets, employee list loads, and session validations.
* **APIs Affected:** `/admin-login`, `/auth/*`, `/add-employee`, `/edit-employee`, `/delete-employee`, `/fetch-all-employees`.
* **Pages Affected:** `AdminLoginComponent`, `ForgotPasswordComponent`, `EmployeeComponent`, `StructureComponent`.
* **Tables Affected:** `users`, `login_otp`.

### B. Modifying Drawing Files Storage (DB BLOBs or Disk Paths)
* **What Breaks:** Batch submissions, uploads audits, canvas PDF renders, and downloads.
* **APIs Affected:** `/submit`, `/submit-batch`, `/prefill-upload`, `/drawings/<id>/<rev>/pdf/*`.
* **Pages Affected:** `SubmissionComponent`, `UploadsComponent`, `CanvasComponent`, `RequestsComponent`.
* **Tables Affected:** `drawings`, `drawing_revisions`, `drawing_files`.

### C. Modifying or Re-compiling ML Model Pickles
* **What Breaks:** Extracting and classifying error codes from PDF files during uploads.
* **APIs Affected:** `/upload`.
* **Pages Affected:** `UploadsComponent` (disables AI error categorization, requiring users to log errors manually).
* **Tables Affected:** `error_codes`, `revision_error_codes`.

### D. Modifying Canvas Coordinates or Annotations JSON Structure
* **What Breaks:** Loading annotations, saving markups, and baking check/cross shapes onto PDF bytes.
* **APIs Affected:** `/annotations/<drawing_id>`, `/drawings/<drawing_id>/<revision>/pdf/annotated/*`.
* **Pages Affected:** `CanvasComponent`.
* **Database/Storage Impact:** Wipes or corrupts annotation history JSON files under `uploads/annotations/`.

### E. Modifying Dashboard Aggregation Queries
* **What Breaks:** Data aggregation on dashboards and charts, resulting in empty metrics.
* **APIs Affected:** `/api/overview-dashboard`, `/api/monthly-drawing-status`, `/api/monthly-error-report`, `/api/trend-error-report`, `/api/employee-drawing-status`, `/api/task-report`.
* **Pages Affected:** `ReportsComponent`, `ReportDashboardComponent`, `ReportTableComponent`.
* **Tables Affected:** `drawing_revisions`, `revision_error_codes`, `users`.
