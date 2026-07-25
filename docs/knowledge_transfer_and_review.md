# Atlas Copco DrawLogAI: Phase 17 & 18 - Knowledge Transfer & Senior Review

This document contains onboarding materials, deployment checklists, and an architectural review of **Atlas Copco DrawLogAI**.

---

## 1. Executive Summary

**DrawLogAI** is an engineering drawing quality control and audit log platform. It automates drawing audit workflows for Atlas Copco designers and reviewers. 

The system parses PDF drawing annotations programmatically, classifies feedback comments into standard error codes using machine learning models (TF-IDF + Scikit-Learn classifier), logs audits, and notifies stakeholders via email. Reviewers can also add comments, draw freehand markups, and place stamps on drawings using a web-based canvas interface.

---

## 2. 10-Minute Technical Overview

### A. Core Architecture
DrawLogAI is built on a standard three-tier architecture:
* **Frontend:** An Angular single-page application (v16.1.4). It handles routing, authorization guards, and client-side PDF rendering using `pdf.js`.
* **Backend:** A Flask Python microservice. It handles database transactions, PDF parsing via PyMuPDF (`fitz`), and ML inference via `joblib`.
* **Database:** MySQL database (`atlascopco_drawing_db`).
* **Reverse Proxy:** IIS (Internet Information Services) configured with URL Rewrite and ARR modules, proxying requests to Waitress.

### B. Directory Structure
```
c:/Atlas-Copco-DrawLogAI/
├── backend/Atlashost/
│   ├── app.py                      # Main backend API and controllers
│   ├── tfidf_vectorizer.pkl        # ML Vectorizer
│   └── error_code_classifier_model.pkl # ML Classifier Model
└── frontend/src/app/
    ├── app-routing.module.ts       # Route configurations
    ├── canvas/                     # Interactive drawing component
    ├── submission/                 # Batch drawing uploads component
    └── uploads/                    # Reviewer audit inputs component
```

### C. Database Core Tables
* `users`: Stores employee credentials and roles (`admin`/`HR` or `user`/`Employee`).
* `drawings` & `drawing_revisions`: Tracks drawing metadata and audit lifecycles.
* `drawing_files`: Stores drawing PDFs as binary BLOBs.
* `revision_error_codes`: Maps errors to drawing revisions for dashboard reports.

---

## 3. 30-Minute Deep Dive & Workflow Guide

### A. Relational Data Model
The database uses foreign key cascade constraints:
* Deleting a drawing cascades deletes to `drawing_revisions` and `drawing_files`.
* Deactivating users sets `users.is_active = FALSE` (soft delete) to preserve historical audit logs.

### B. Core Endpoints
1. `POST /admin-login`: Authenticates users and returns roles.
2. `POST /upload`: Extracts PDF comments and runs the ML model to predict error codes.
3. `POST /submit-batch`: Handles batch PDF uploads, validates file names, and sets initial revisions.
4. `POST /submit`: Saves the final audit decision, updates drawing status, and dispatches email notifications.
5. `POST /drawings/<id>/<rev>/pdf/annotated/download`: Bakes markup annotations and stamps onto PDFs using PyMuPDF.

---

## 4. New Developer Onboarding Guide

### A. Local Development Environment Setup
1. **Clone Repository:**
   ```bash
   git clone <repo_url>
   cd Atlas-Copco-DrawLogAI
   ```
2. **Install Frontend Dependencies:**
   Ensure Node.js 18+ is installed:
   ```bash
   cd frontend
   npm install
   ```
3. **Configure Backend Virtual Environment:**
   Ensure Python 3.8+ is installed:
   ```bash
   cd ../backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. **Configure Local Database:**
   * Install MySQL Server 8.0+.
   * Import the database schema:
     ```bash
     mysql -u root -p -e "CREATE DATABASE atlascopco_drawing_db"
     mysql -u root -p atlascopco_drawing_db < DrawLogAI-DB.sql
     ```
5. **Set Environment Variables:**
   Create a `.env` file in `backend/Atlashost/`:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=yourpassword
   DB_NAME=atlascopco_drawing_db
   SECRET_KEY=devsecret
   SMTP_SERVER=localhost
   SMTP_PORT=1025
   ```
6. **Launch local services:**
   * Backend: `python app.py` (starts on port 5000).
   * Frontend: `npm run start` (starts on port 4200).

---

## 5. Deployment Checklists

### A. Pre-Release Checklist
* [ ] Verify that all unit tests pass.
* [ ] Confirm that `environment.prod.ts` API URL points to the production server: `https://drawlogai.atlascopco.group/api`.
* [ ] Backup the production MySQL database:
  ```bash
  mysqldump -u root -p atlascopco_drawing_db > pre_release_backup.sql
  ```
* [ ] Clone active production directories on the server as backups.

### B. Release Checklist
* [ ] Compile the frontend code: `npm run build --prod`.
* [ ] Create `dist.zip` from the output directory.
  > [!IMPORTANT]  
  > **Do not include `web.config` in this zip package** to avoid overwriting server-side IIS configurations.
* [ ] Copy `dist.zip` to the server and extract it to the IIS directory.
* [ ] If the backend changed, copy files to the server directory, activate the virtual environment, and install dependencies (`pip install -r requirements.txt`).
* [ ] Restart the Waitress Windows Service:
  ```powershell
  python flask-service.py restart
  ```
* [ ] Verify system health endpoints: `https://drawlogai.atlascopco.group/api/health`.

### C. Rollback Checklist
* [ ] Stop the IIS Application Pool.
* [ ] Rename the active `frontend` folder to `frontend_failed`.
* [ ] Restore the pre-release backup folder to `frontend`.
* [ ] Restart the IIS Application Pool.
* [ ] If the database schema was modified, restore the database backup:
  ```bash
  mysql -u root -p atlascopco_drawing_db < pre_release_backup.sql
  ```
* [ ] Restart the Waitress Windows service.

---

## 6. Senior Architect Review & Technical Debt Audit

### Finding 1: Lack of Backend Authentication (Critical)
* **Severity:** **CRITICAL**
* **Impact:** The backend APIs lack authentication checks. Anyone with network access to the server can query endpoints to delete employees, modify database records, or extract private user data without authorization.
* **Remediation:** Implement JWT token validation or HTTP-Only Secure Cookies, verifying signatures on the server for all requests in `@app.before_request`.

### Finding 2: Client-Side Authorization Bypass (High)
* **Severity:** **HIGH**
* **Impact:** Route guards (`AuthGuard`) depend on local variables stored in `sessionStorage`. Users can easily bypass security checks by modifying role values in the browser console.
* **Remediation:** Implement server-side role validation (RBAC) to ensure unauthorized users cannot query restricted API endpoints.

### Finding 3: Database Storage Constraints (High)
* **Severity:** **HIGH**
* **Impact:** PDF files are stored directly as `LONGBLOB` fields in the `drawing_files` table. As the volume of drawings grows, this will degrade database performance and increase database size rapidly.
* **Remediation:** Migrate PDF storage to a secure file storage server (e.g. AWS S3 or a local NAS share), and store only file paths in the database.

### Finding 4: Large File-Level Monolith (`app.py`) (Medium)
* **Severity:** **MEDIUM**
* **Impact:** The backend is implemented as a single, large monolith file ([app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) has 3788 lines). This makes the code difficult to maintain and test.
* **Remediation:** Refactor `app.py` into separate controllers, services, and database repository modules.

### Finding 5: Lack of Automated CI/CD Pipelines (Medium)
* **Severity:** **MEDIUM**
* **Impact:** Manual build and deployment processes are error-prone and slow.
* **Remediation:** Configure CI/CD pipelines (e.g. GitHub Actions, GitLab CI, or Jenkins) to automate building, testing, packaging, and deployment to the server.
