# Atlas Copco DrawLogAI: Phase 11 - Error Handling Analysis

This document provides a technical audit of exception handling, transaction consistency, log sanitization, and error recovery flows for **Atlas Copco DrawLogAI**. 

---

## 1. Backend Exception Handling & Robustness

### A. Database Retry Mechanism
The backend includes a retry loop in `connect_to_db()` to handle database initialization delays (e.g. during server reboots):
```python
def connect_to_db():
    for i in range(10):  # retry logic
        try:
            db = pymysql.connect(
                host=os.getenv("DB_HOST", "localhost"),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASSWORD", ""),
                database=os.getenv("DB_NAME", "atlascopco_drawing_db"),
                connect_timeout=5,
                autocommit=False,
                charset='utf8mb4',
                init_command="SET sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'",
            )
            print("[SUCCESS] Database connected")
            return db
        except Exception as e:
            print("[WAITING] Connecting to database...", e)
            time.sleep(3)

    print("[ERROR] Database connection failed after retries")
    return None
```
* **Retry Scope:** Retries connecting to the database 10 times with a 3-second delay between attempts before returning a failure code.

### B. Error Log Sanitization (`dbg_fail`)
To prevent leaking sensitive information in production (such as database credentials, internal server paths, or stack traces), the backend routes error responses through a sanitization function:
```python
DEBUG_RETURN_ERRORS = False  # Set False in production to prevent leaking raw exceptions

def dbg_fail(step, err, extra=None, code=500):
    msg = f"{step}: {err}"
    print(msg)  # Printed to server-side stdout logs
    if extra:
        print("extra:", extra)
    if DEBUG_RETURN_ERRORS:
        return jsonify({"ok": False, "where": step, "error": str(err), "extra": extra}), code
    return jsonify({"error": "Internal Server Error"}), 500
```
* **Production Behavior:** Standard errors are printed to stdout (captured by server logs). However, the client only receives a generic `{"error": "Internal Server Error"}` with an HTTP 500 status, preventing information leakage vulnerabilities (CWE-209).

### C. Transaction Rollback Strategy
API endpoints executing multiple database writes (such as `/submit` and `/submit-batch`) wrap database calls in `try-except` blocks. If any operation fails (e.g., file insert, error mapping, status update), the transaction rolls back:
```python
except Exception as e:
    try:
        if hasattr(g, 'db'):
            g.db.rollback()
    except Exception:
        pass
```
* **Data Consistency:** Prevents database corruption or orphan records by rolling back partially executed queries.

### D. Non-Fatal Exception Handling
* **Email Failures:** SMTP failures (e.g., mail server offline or port blockages) are caught and logged as warnings:
  ```python
  except Exception as e:
      print("[WARNING] email-send failed:", e)
  ```
  This ensures drawing reviews can still be committed to the database even if notifications fail.
* **Welcome Credentials Emails:** Caught during employee creations, logging warnings without aborting user account setup.

### E. File Path Traversal Protection
The backend validates file paths before reading files to prevent Directory Traversal attacks (CWE-22 / CWE-23):
```python
resolved_path = os.path.realpath(file_path)
resolved_upload_folder = os.path.realpath(UPLOAD_FOLDER)
if not resolved_path.startswith(resolved_upload_folder + os.path.sep) and resolved_path != resolved_upload_folder:
    return dbg_fail("pdf-load", "Path traversal detected", extra={"file_path": file_path}, code=400)
```
* **Action:** Rejects requests with an HTTP 400 status if the file path points outside the designated uploads folder.

---

## 2. Frontend Exception Handling

### A. HTTP Request Interception
The frontend handles session expirations via the [AuthInterceptor](file:///c:/Atlas-Copco-DrawLogAI/frontend/src/app/auth.interceptor.ts):
```typescript
if (!this.authService.isLoggedIn()) {
  this.router.navigate(['/admin-login']).then(() => {
    window.location.reload();
  });
  return throwError(() => new Error('Session Expired'));
}
```
* **Action:** Cancels the request and redirects the user to the login screen.

### B. Client-Side Input Validation
* Form components validate fields (such as Employee ID formats, password complexity, and design numbers) before sending data, reducing invalid requests to the server.

### C. Visual User Feedback
* HTTP subscription errors are caught and displayed using SweetAlert2 popup boxes to provide clear user feedback:
  ```typescript
  error: (err) => {
    const msg = err?.error?.message || 'Submission failed. Please try again.';
    Swal.fire({ icon: 'error', title: 'Submission Failed', text: msg });
  }
  ```

---

## 3. Common Production Failures & Diagnostics

Below is a troubleshooting guide for common production errors.

### 1. IIS Returns "502 Bad Gateway"
* **Symptom:** API calls return HTTP 502.
* **Cause:** The Python backend service (`AtlascopcoFlaskService`) is offline or Waitress crashed.
* **Remediation:** Check service status in Windows Service Manager or restart the service using PowerShell:
  ```powershell
  python flask-service.py restart
  ```

### 2. Client Receives "Internal Server Error" (500) during upload
* **Symptom:** Uploading a PDF returns HTTP 500.
* **Cause:** The ML model (`error_code_classifier_model.pkl`) or vectorizer (`tfidf_vectorizer.pkl`) is missing, corrupt, or incompatible with the installed Python libraries.
* **Remediation:** Verify that Python library versions in `requirements.txt` match the model's build environment.

### 3. Client Receives "Internal Server Error" (500) on Database Queries
* **Symptom:** Logins or database queries return HTTP 500.
* **Cause:** MySQL Server is offline or credentials in `.env` are incorrect.
* **Remediation:** Verify that MySQL is running on port 3306 and check `.env` connection settings.

### 4. IIS Returns "500 Server Configuration Error"
* **Symptom:** The site fails to load, returning HTTP 500.
* **Cause:** A duplicate MIME mapping in `web.config` conflicts with existing IIS configurations on the server.
* **Remediation:** Edit `web.config` on the VM server to remove duplicate MIME mappings (e.g. `.json`).

### 5. Drawing Submissions Fail with "Invalid Naming"
* **Symptom:** A SweetAlert warning flags drawing submissions as skipped.
* **Cause:** The uploaded PDF filename does not start with a 10-digit number.
* **Remediation:** Rename the file to match standard formats (e.g. `9096998745-01.pdf`) or select "Non Standard Drawing Accept" to override.

### 6. Drawing Audits Complete, but No Notification Emails are Sent
* **Symptom:** Audits complete successfully, but creators do not receive email alerts.
* **Cause:** The SMTP mail server is offline or blocking connection ports.
* **Remediation:** Verify SMTP server addresses and port settings in `.env` and check the server's stdout logs for mail errors.

### 7. Canvas Component Displays Mock Layout
* **Symptom:** The canvas displays a placeholder screen with "Could not load PDF from server".
* **Cause:** The database was unable to serve the PDF blob from the `drawing_files` table.
* **Remediation:** Check database logs to ensure the file BLOB size does not exceed the database configuration's `max_allowed_packet` size.
