# Atlas Copco DrawLogAI: Phase 3 - Project Structure Analysis

This document provides a detailed breakdown of the file and folder architecture for the **Atlas Copco DrawLogAI** codebase. For each folder, we analyze its purpose, dependencies, file contents, importance level, and the risk/impact of modifications on the production environment.

---

## 1. Project Directory Tree

Below is the high-level tree structure of the repository.

```
c:/Atlas-Copco-DrawLogAI/
├── .agents/                        # Workspace rules & agent configurations
│   └── AGENTS.md                   # Custom constraints for LLM tools
├── backend/                        # Flask Backend Application Root
│   ├── .env.example                # Example environment variables template
│   ├── requirements.txt            # Python pip dependencies
│   ├── Dockerfile                  # Container configurations
│   └── Atlashost/                  # Main Flask application directory
│       ├── app.py                  # Core backend logic & endpoints (150KB)
│       ├── .env                    # Active production configurations (git-ignored)
│       ├── tfidf_vectorizer.pkl    # Serialized ML vectorizer
│       ├── error_code_classifier_model.pkl # Serialized ML classifier
│       └── uploads/                # Directory containing uploaded PDFs
│           └── annotations/        # Stored canvas annotations (JSON)
├── frontend/                       # Angular Frontend Application Root
│   ├── angular.json                # Angular CLI configuration
│   ├── package.json                # NPM package definitions
│   ├── tsconfig.json               # TypeScript base compiler settings
│   ├── dist.zip                    # Compressed production-built bundle (No web.config!)
│   └── src/                        # Frontend source code
│       ├── main.ts                 # App bootstrapping entrypoint
│       ├── styles.scss             # Global Sass styles
│       ├── index.html              # Main HTML container
│       ├── assets/                 # SVGs, icons, and static assets
│       ├── environments/           # Angular environment configurations
│       └── app/                    # Angular modules and components
│           ├── app.module.ts       # Main Angular module declarations
│           ├── app-routing.module.ts # Client routing guard mappings
│           ├── auth.service.ts     # User authentication service
│           ├── auth.interceptor.ts # HTTP JWT interceptor middleware
│           ├── auth.guard.ts       # Route protection guards
│           ├── admin-login/        # Login interface
│           ├── submission/         # Batch drawing submission form
│           ├── uploads/            # Reviewer PDF upload & classification tool
│           ├── canvas/             # Interactive PDF drawing board (PDF.js)
│           ├── requests/           # Review lists for creators/reviewers
│           ├── reports/            # Dashboard and chart pages
│           ├── structure/          # Division, PC, and Team management
│           ├── employee/           # User administration component
│           └── components/         # Reusable dashboard UI controls
│               ├── header/         # Global navigation bar
│               ├── footer/         # Global footer
│               ├── report-dashboard/ # Charts controller dashboard
│               ├── report-table/   # Tabular quality statistics
│               └── (charts)/       # Bar, line, and column chart wrappers
└── DrawLogAI-DB.sql                # Production MySQL Database Schema dump
```

---

## 2. Directory Analysis Table

| Folder Link | Purpose | Primary Dependencies | Key Files | Importance Level | Can Modify in Production? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[.agents](file:///c:/Atlas-Copco-DrawLogAI/.agents)** | Custom environment configurations & workspace constraints. | None. | `AGENTS.md` | Low | **No** (It enforces critical deployment rules, like omitting `web.config` in builds). |
| **[backend](file:///c:/Atlas-Copco-DrawLogAI/backend)** | Root of the Flask server environment. | Docker, Python. | `requirements.txt`, `Dockerfile`, `.env.example` | High | **No** (Direct changes to configuration templates or lockfiles require server process rebuilds/re-deployments). |
| **[backend/Atlashost](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost)** | Main backend package housing Flask endpoints and ML models. | `fitz` (PyMuPDF), `pymysql`, `joblib`, `bcrypt`, `flask_cors`. | [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py), `error_code_classifier_model.pkl`, `tfidf_vectorizer.pkl`, `.env` | Critical | **No** (This runs the entire server API. Changing code directly will cause live server crashes or database connection drops). |
| **[backend/Atlashost/uploads](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/uploads)** | Stores uploaded drawings (PDFs) temporarily during analysis. | OS filesystem. | Multiples of uploaded PDFs (e.g., `DR_*.pdf`). | Low | **Yes** (Contains temporary files. Safe to prune, though deleting active items could break canvas retrieval if not stored in the DB). |
| **[backend/Atlashost/uploads/annotations](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/uploads/annotations)** | Persisted JSON coordinates and text for the canvas drawing views. | JSON parser. | `DR_*.json` | Medium | **Yes, with caution** (Modifying files changes saved canvas notes. Pruning will cause designers/reviewers to lose their drawn canvas history). |
| **[frontend](file:///c:/Atlas-Copco-DrawLogAI/frontend)** | Node.js project wrapper for the client application. | NPM, Angular CLI. | `package.json`, `angular.json`, `dist.zip`, `nginx.conf`, `Dockerfile` | High | **No** (Modifying package configuration files breaks the build pipeline. `dist.zip` should only be updated by compiling the new code). |
| **[frontend/src](file:///c:/Atlas-Copco-DrawLogAI/frontend/src)** | Client application code root. | Angular compiler. | `index.html`, `main.ts`, `styles.scss` | High | **No** (Requires building via `npm run build` to push changes to the server). |
| **[frontend/src/assets](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/assets)** | Static resources, SVGs, corporate logos, and templates. | Browser asset loaders. | SVGs, images (`logo.png`, `IQPulse.png`), Excel templates (`*.xlsx`). | Medium | **Yes** (Static resources only. Replacing images or templates will immediately update visual assets on the next build). |
| **[frontend/src/environments](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/environments)** | Environment targets for builds. | None. | `environment.ts` (dev API url), `environment.development.ts` | Medium | **No** (Specifies backend API paths. Setting a wrong URL routes frontend components to invalid servers). |
| **[frontend/src/app](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app)** | Core logic of the client application. | RxJS, Angular HttpClient. | `app.module.ts`, `app-routing.module.ts`, `auth.service.ts` | Critical | **No** (Any modifications here require compilation and will break client pages if compilation fails). |
| **[frontend/src/app/admin-login](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/admin-login)** | Portal authentication view. | `AuthService`, Forms. | `admin-login.component.ts` | High | **No** (Direct impact on login ability. If code breaks, users cannot log in). |
| **[frontend/src/app/submission](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/submission)** | Page for designer batch-uploads. | `HttpClient`, SweetAlert2. | `submission.component.ts` | High | **No** (Controls drawing entry. Breaking changes will disable drawing uploads). |
| **[frontend/src/app/uploads](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/uploads)** | Form for reviewer audit inputs. | `HttpClient`, SweetAlert2. | `uploads.component.ts` | High | **No** (Funnels drawing feedback. Breaking this stops reviewers from completing audits). |
| **[frontend/src/app/canvas](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/canvas)** | Interactive drawing viewer and editing environment. | `pdfjs-dist` (PDF.js), HTML5 Canvas. | `canvas.component.ts` | High | **No** (Controls drawing annotations. Broken components disable check/cross stamp placement). |
| **[frontend/src/app/requests](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/requests)** | Views for pending drawing lists. | Router. | `requests.component.ts` | Medium | **No** (Users will not be able to locate drawings requiring review). |
| **[frontend/src/app/reports](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/reports)** | Parent container for dashboard pages. | Chart components. | `reports.component.ts` | Medium | **No** (Quality visual summaries won't show). |
| **[frontend/src/app/structure](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/structure)** | Division and PC mapping configuration tool. | `HttpClient`. | `structure.component.ts` | Medium | **No** (Disables organizational unit management). |
| **[frontend/src/app/employee](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/employee)** | Employee list management panel. | `HttpClient`. | `employee.component.ts` | Medium | **No** (HR will be unable to add or edit user accounts). |
| **[frontend/src/app/components](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/components)** | Reusable UI dashboard controls. | Chart.js / standard inputs. | Chart components (`line-chart`, `column-chart`, `date-picker`, `forgot-password`, `header`). | High | **No** (These elements provide the layouts, headers, footers, and charts across reports. Breaking them breaks general UI). |

---

## 3. Explanations of Major Folders

### A. backend/Atlashost
* **System Importance:** Critical (Backend core).
* **Role:** This folder is the heart of the backend server. It hosts the Flask API file [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) which handles all request routing, database connection lifecycles, transactional database updates (inserting drawings, saving PDF bytes, updating statuses), SMTP emailing, and encryption. 
* **Modifications Risk:** Highest. Any changes in code, syntax, database connection hooks, or dependencies here will prevent API routes from running, completely rendering the client application inoperable.

### B. backend/Atlashost/uploads
* **System Importance:** Low (Storage container).
* **Role:** Stores PDF files that have been processed or uploaded. It acts as a local disk cache for drawing files.
* **Modifications Risk:** Low. Modifying files here will not crash the app code. However, deleting drawings from this folder may lead to empty view errors on the frontend unless the files are pulled directly from the SQL database longblob tables.

### C. backend/Atlashost/uploads/annotations
* **System Importance:** Medium (Design History).
* **Role:** Stores reviewer annotations for each drawing as standardized JSON streams. The coordinates, page numbers, text comments, pen paths, and stamps are saved here to preserve edit history.
* **Modifications Risk:** Medium. Deleting these JSON files will permanently wipe out saved annotations on the canvas, showing the clean original PDF drawing without review notes.

### D. frontend/src/app
* **System Importance:** Critical (Frontend Core).
* **Role:** Contains modules, core services, guards, interceptors, routing definitions, and UI components. All components communicate via Angular's dependency injection system, and route constraints are guarded by the `AuthGuard`.
* **Modifications Risk:** High. Modifying files here requires compilation. A syntax error, broken service inject, or wrong API path will crash the frontend build process or lead to blank screens.

### E. frontend/src/app/canvas
* **System Importance:** High (Interactive Component).
* **Role:** Houses the PDF.js drawing board wrapper. It manages HTML5 canvas drawing layers, mouse positioning, pen-stroke coordinate arrays, and text annotations inputs.
* **Modifications Risk:** High. If files are corrupted, reviewers will be unable to load drawings, view PDF pages, draw checkmarks, or save stamps.

### F. frontend/src/app/components
* **System Importance:** High (Layout & Charts Component).
* **Role:** Holds reusable components like the navigation header, footer, date selectors, reset passwords panels, and chart wrappers (Bar, Column, Line charts) that feed reports dashboards.
* **Modifications Risk:** High. Breaking any child folder here (e.g. `header/` or `forgot-password/`) breaks the template inheritance across all pages, crashing multiple screens.
