# Atlas Copco DrawLogAI: Phase 8 - Configuration Analysis

This document provides a configuration audit for **Atlas Copco DrawLogAI**. We analyze every configuration file across the backend, frontend, database connection layers, and deployment servers.

> [!IMPORTANT]
> Files labeled as **CRITICAL** risk level can completely disable or crash the production environment if misconfigured.

---

## 1. Summary of Production-Crashing Configuration Files

The following files are the most critical configuration nodes. A single syntax error or typo in these files will cause immediate production downtime:
1. **[.env](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/.env) (Backend Credentials):** If database connections fail, the Flask service crashes or refuses to start.
2. **`web.config` (IIS Rules - Managed on VM Server):** Overwriting or modifying this file on the server with duplicate MIME configurations or syntax errors will cause IIS to return `500 Server Configuration Error` for all incoming web requests.
3. **[angular.json](file:///c:/Atlas-Copco-DrawLogAI/frontend/angular.json) (Build Configuration):** Typos in configuration pathways will break the Angular build pipeline, halting frontend deployments.

---

## 2. Comprehensive Configuration Audits

---

### A. [.env](file:///c:/Atlas-Copco-DrawLogAI/backend/Atlashost/.env)
* **Purpose:** Sets environment-specific variables including database connection details and SMTP ports.
* **Production Impact:** **Extreme.** Read during server initialization to connect to the database.
* **Risk Level:** **CRITICAL**
* **Safe Changes:** 
  * Updating SMTP servers address (`SMTP_SERVER=smtp.company.com`).
  * Changing email addresses (`EMAIL_SENDER=reporting@company.com`).
  * Modifying database timeouts.
* **Dangerous Changes:**
  * Changing `DB_HOST` to a wrong IP.
  * Modifying database names (`DB_NAME`) or usernames (`DB_USER`) incorrectly.
  * Adding spaces around key-value pairs without quotes (e.g. `DB_USER = root` instead of `DB_USER=root`).

---

### B. `web.config` (Active on Windows IIS Server)
* **Purpose:** Instructs IIS how to handle requests, rewrite Angular client-side routes, and proxy API traffic to Waitress.
* **Production Impact:** **Extreme.** Governs all external web access.
* **Risk Level:** **CRITICAL**
* **Safe Changes:**
  * Adjusting client caching rules for static assets (CSS, JS).
* **Dangerous Changes:**
  * Adding duplicate MIME mappings (e.g., adding `.json` mapping when IIS already defines it) will throw an IIS configuration error.
  * Breaking the Application Request Routing (ARR) rewrite paths, which will cause API calls to return `404 Not Found`.

---

### C. [docker-compose.yml](file:///c:/Atlas-Copco-DrawLogAI/docker-compose.yml)
* **Purpose:** Defines container networks, volumes, and environments for local containerized deployment.
* **Production Impact:** **High** (in containerized setups; low in IIS deployments).
* **Risk Level:** **High**
* **Safe Changes:**
  * Exposing different external port mappings (e.g. changing `4200:80` to `8080:80`).
  * Changing environment variable values.
* **Dangerous Changes:**
  * Modifying YAML indentation (causes execution errors).
  * Deleting volume bindings (e.g. `db_data:/var/lib/mysql`) which will result in data loss when containers restart.

---

### D. [package.json](file:///c:/Atlas-Copco-DrawLogAI/frontend/package.json)
* **Purpose:** Manages Angular application package dependencies, runtime requirements, and script targets.
* **Production Impact:** **High.** Governs dependency verification and builds.
* **Risk Level:** **High**
* **Safe Changes:**
  * Adding project shortcuts to scripts (e.g. `"prod-build": "ng build --configuration production"`).
  * Updating version meta tags.
* **Dangerous Changes:**
  * Altering framework core package versions (e.g. `@angular/core`), which can cause compiler compilation mismatches.
  * Deleting script hooks necessary for standard builds.

---

### E. [requirements.txt](file:///c:/Atlas-Copco-DrawLogAI/backend/requirements.txt)
* **Purpose:** Defines the Python package versions required for the Flask server.
* **Production Impact:** **High.** Read by the pip package manager during setup.
* **Risk Level:** **High**
* **Safe Changes:**
  * Appending security linters or logging libraries.
* **Dangerous Changes:**
  * Changing critical library versions (such as `scikit-learn` or `joblib`) to versions that are incompatible with the serialized models (`error_code_classifier_model.pkl`), which will cause model load failures on startup.

---

### F. [angular.json](file:///c:/Atlas-Copco-DrawLogAI/frontend/angular.json)
* **Purpose:** Configures build targets, source directory hierarchies, asset folders, and compilation rules for the Angular CLI.
* **Production Impact:** **High.** Governs how JavaScript modules are optimized and bundled.
* **Risk Level:** **High**
* **Safe Changes:**
  * Registering static files inside the `assets` arrays.
  * Adding style path files to target compilation arrays.
* **Dangerous Changes:**
  * Deleting output path configurations (`outputPath`), which will break the target deployment copy scripts.
  * Changing compilation optimization rules to incorrect syntax variables.

---

### G. [tsconfig.json](file:///c:/Atlas-Copco-DrawLogAI/frontend/tsconfig.json)
* **Purpose:** Configures TypeScript compilation options for Angular components.
* **Production Impact:** **Medium.** Used during compilation to convert TS to JS.
* **Risk Level:** **Medium**
* **Safe Changes:**
  * Defining custom path aliases.
* **Dangerous Changes:**
  * Changing target standards (e.g. `ES2022` to `ES5`) or turning off strict typing options, which can introduce runtime issues.

---

### H. [nginx.conf](file:///c:/Atlas-Copco-DrawLogAI/frontend/nginx.conf)
* **Purpose:** Configures the Nginx web server inside Docker deployments.
* **Production Impact:** **Low** (only active if deployed via Docker containers; production uses IIS).
* **Risk Level:** **Medium**
* **Safe Changes:**
  * Modifying access log configurations.
* **Dangerous Changes:**
  * Deleting the `try_files $uri $uri/ /index.html` fallback rule, which will break page reloading on all routes.
