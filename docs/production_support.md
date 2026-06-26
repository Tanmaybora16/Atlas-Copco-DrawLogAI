# Atlas Copco DrawLogAI: Phase 16 - Production Support Guide

This document acts as an operational support runbook for **Atlas Copco DrawLogAI**, detailing the diagnostic, mitigation, and verification steps for common production issues.

---

## 1. Login Failures
* **Symptoms:** 
  * Users submit credentials on the `/admin-login` screen and receive a "Connection timeout" or red error popup: `Invalid Credentials` or `Internal Server Error`.
* **Root Causes:**
  * **1. Offline DB:** The backend cannot connect to MySQL to verify hashes.
  * **2. Wrong credentials:** Input username/password mismatch.
  * **3. Soft-deactivated account:** The user account has `is_active = FALSE` in the DB.
* **Diagnosis Process:**
  1. Open server Event Viewer (`eventvwr.msc`) -> Applications logs. Check for connection timeout prints: `Database connection failed`.
  2. If the DB is running, query the user profile directly:
     ```sql
     SELECT is_active, password_hash FROM users WHERE emp_id = 'EMP_ID';
     ```
  3. If no row is returned, the user does not exist. If `is_active` is 0, the account is disabled.
* **Fix Process:**
  * **If DB offline:** Restart the MySQL Service (`services.msc` -> `MySQL80` -> Start).
  * **If Account disabled:** Re-activate the employee record via the HR console, or directly in the DB:
    ```sql
    UPDATE users SET is_active = TRUE WHERE emp_id = 'EMP_ID';
    ```
  * **If Password lost:** Initiate the OTP forgot-password recovery flow, or generate a new bcrypt password hash and update the DB record.
* **Verification Steps:**
  1. Attempt to log in with the employee ID at the `/admin-login` interface. Verify redirection occurs to `/uploads` or `/reports`.

---

## 2. Database Connection Failures
* **Symptoms:**
  * Web requests return `HTTP 500 Internal Server Error`.
  * Server logs print:
    ```
    [ERROR] Database connection failed after retries
    ```
* **Root Causes:**
  * **1. Database stopped:** The MySQL server process crashed or was stopped.
  * **2. Configuration mismatch:** Host, port, username, or password changed without updating the `.env` file.
  * **3. Packet size limitation:** Queries containing large drawing PDF bytes exceed MySQL configuration limits (`max_allowed_packet`).
* **Diagnosis Process:**
  1. Log in to the VM server (`10.91.17.78`).
  2. Verify if the MySQL port `3306` is open:
     ```cmd
     netstat -ano | findstr 3306
     ```
  3. Attempt a manual connection via the command line:
     ```cmd
     mysql -u root -p
     ```
  4. Check the MySQL error log (configured in `my.ini`) for memory exhaust warnings or crash prints.
* **Fix Process:**
  * **If service stopped:** Start `MySQL80` in the Services console.
  * **If credentials mismatch:** Edit the backend `.env` file (`C:\inetpub\atlascopco-app\backend\Atlashost\.env`) with the correct variables and restart the WSGI server.
  * **If packet limit exceeded:** Open `my.ini` (typically `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`), locate `max_allowed_packet`, change it to `64M` or higher, and restart MySQL.
* **Verification Steps:**
  1. Trigger the health check route: `curl http://127.0.0.1:5000/health`.
  2. Verify it returns `{"status":"ok"}`.

---

## 3. Server / Waitress Service Downtime
* **Symptoms:**
  * Client API calls return `502 Bad Gateway` or connection timeouts.
  * Navigating to `https://drawlogai.atlascopco.group/api/health` returns `502`.
* **Root Causes:**
  * **1. Service stopped:** The `AtlascopcoFlaskService` service stopped or crashed.
  * **2. Port conflict:** Another application bound to port `5000`, preventing Waitress from starting.
* **Diagnosis Process:**
  1. Open Task Manager and check if `python.exe` is running in the background.
  2. Check if port 5000 is occupied by another process:
     ```cmd
     netstat -ano | findstr 5000
     ```
  3. Check the Windows Event Viewer -> Application logs for traceback messages from `AtlascopcoFlaskService`.
* **Fix Process:**
  * **If service stopped:** Start the service in the services console, or run:
    ```powershell
    python flask-service.py start
    ```
  * **If port conflict exists:** Locate the conflicting process ID (`PID`) from the `netstat` output and terminate it, or change the port binding configuration in `wsgi.py` and restart the service.
* **Verification Steps:**
  1. Open a browser and navigate to the health check endpoint:
     ```
     https://drawlogai.atlascopco.group/api/health
     ```
  2. Verify it returns `{"status":"ok"}`.

---

## 4. Frontend Build Failures
* **Symptoms:**
  * Compiling the code via `npm run build --prod` fails with syntax errors, TypeScript warnings, or build errors.
* **Root Causes:**
  * **1. Syntax errors:** Typo or compile errors in Angular TypeScript files.
  * **2. Mismatched packages:** Dependencies in `package.json` are missing or incompatible with the installed Node.js version.
  * **3. Path resolve issues:** Broken imports or missing asset directories.
* **Diagnosis Process:**
  1. Review the compiler output trace. Locate the exact file and line number where the compilation failed.
  2. Check for type errors:
     ```bash
     npx tsc --noEmit
     ```
* **Fix Process:**
  * **If syntax error:** Resolve the code error in the specified file.
  * **If package resolution issues:** Delete `node_modules` and `package-lock.json`, and run a clean install:
    ```bash
    npm cache clean --force
    npm install
    ```
* **Verification Steps:**
  1. Run `npm run build --prod` and verify it compiles successfully without errors, creating a `dist/` directory.

---

## 5. IIS Deployment Failures
* **Symptoms:**
  * Accessing the domain returns `500.19 Server Configuration Error` or a 404 page for subroutes.
* **Root Causes:**
  * **1. web.config overwrite:** The deployment package overwrote the server's `web.config`, introducing duplicate MIME configurations or breaking proxy paths.
  * **2. ARR Module disabled:** Application Request Routing is disabled, breaking proxy rewrites.
* **Diagnosis Process:**
  1. Check the IIS error code (e.g., 500.19 points to configuration conflicts).
  2. Review the `web.config` file on the server. Look for duplicate mappings (e.g. `.json`).
  3. Verify ARR status in IIS Manager.
* **Fix Process:**
  * **If MIME duplicate conflict:** Open the local `web.config` on the server and remove duplicate lines under `<staticContent>` (such as duplicate `.json` or `.woff` definitions).
  * **If URL Rewrite is broken:** Ensure URL Rewrite and ARR modules are installed on the server, open ARR proxy settings, and check "Enable proxy".
* **Verification Steps:**
  1. Access the web app in your browser and reload pages (e.g. `/requests`). Verify it does not return a 404 or configuration error.

---

## 6. API Internal Failures (500 Error)
* **Symptoms:**
  * Review submissions, file uploads, or reporting requests return `500 Internal Server Error`.
* **Root Causes:**
  * **1. Uncaught backend exception:** Syntax errors or runtime issues in `app.py`.
  * **2. Missing PDF library:** Missing server libraries (such as `fitz` or `joblib`).
* **Diagnosis Process:**
  1. Open Event Viewer -> Windows Logs -> Application on the server.
  2. Search for Python stack trace messages and locate the file and line number where the error occurred.
* **Fix Process:**
  * **If code error:** Fix the bug in [app.py](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/app.py) and restart the service.
  * **If missing library:** Activate the virtual environment and reinstall packages:
    ```cmd
    venv\Scripts\activate
    pip install -r requirements.txt
    ```
* **Verification Steps:**
  1. Re-trigger the failed API request on the client interface and verify it completes successfully (returning `HTTP 200`).

---

## 7. User Access / Permission Redirection Failures
* **Symptoms:**
  * Users are redirected back to `/admin-login` immediately after entering credentials.
  * Users are redirected to unexpected dashboards.
* **Root Causes:**
  * **1. Role mismatch:** The database role (`admin` or `user`) does not match the frontend Angular router guards configuration expectations.
  * **2. Session expiry:** The client's system clock is out of sync, triggering client-side session timeout checks.
* **Diagnosis Process:**
  1. Log in and inspect `sessionStorage` variables in the browser developer console (Application -> Session Storage).
  2. Verify the `accessType` value matches the expected role (`HR` or `Employee`).
  3. Check the `users.role` value in the database.
* **Fix Process:**
  * **If database role mismatch:** Update the database record:
    ```sql
    UPDATE users SET role = 'admin' WHERE emp_id = 'EMP_ID'; -- for HR
    ```
  * **If client clock issue:** Synchronize the client's system clock with an internet time server.
* **Verification Steps:**
  1. Clear browser session storage and attempt to log in. Verify the user is redirected to the correct dashboard.
