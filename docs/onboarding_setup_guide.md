# Onboarding & Database Setup Guide: Atlas Copco DrawLogAI

Welcome to the team! This guide provides a "step-by-step, spoon-fed" walkthrough to help you set up the development environment, import the database, connect the components, and run the **DrawLogAI** portal locally.

---

## 1. System Overview
The application consists of three primary components:
1. **Frontend:** Angular application (runs on port `4200` by default).
2. **Backend:** Python Flask API server (runs on port `5000` by default).
3. **Database:** MySQL Server (runs on port `3306` by default).

---

## Phase 1: Exporting the Database (From the Original Machine)
If you need to retrieve the latest copy of the database from an existing developer machine:

1. Open your Command Prompt (cmd).
2. Navigate to the MySQL `bin` directory (adjust version `8.0` if you have a different version installed):
   ```cmd
   cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"
   ```
3. Run `mysqldump` to export the database structure and data to a file (e.g., `AtlasDB.sql`):
   ```cmd
   mysqldump -u root -pSatara12@ atlascopco_drawing_db > "C:\ATLAS\AtlasDB.sql"
   ```
4. Find the generated `AtlasDB.sql` in `C:\ATLAS\` and share it with the new team members.

---

## Phase 2: Installing Prerequisites (On the New Developer's Machine)
Before setting up the project, install the following runtimes:

1. **Python (version 3.10.x):**
   * Download and install from [python.org](https://www.python.org/downloads/).
   * **IMPORTANT:** Make sure to check the box **"Add Python to PATH"** during installation.
2. **Node.js (version 18.x or 20.x):**
   * Download and install the LTS version from [nodejs.org](https://nodejs.org/).
3. **MySQL Server & Workbench:**
   * Download and install MySQL Community Server from [dev.mysql.com](https://dev.mysql.com/downloads/installer/).
   * Remember the root password you configure during installation.

---

## Phase 3: Database Setup & Import (On the New Developer's Machine)

Follow these steps to import the `AtlasDB.sql` file you received:

1. **Open MySQL Command Line:**
   * In Windows Search, type **"MySQL Command Line Client"** and open it.
   * Enter your MySQL root password.
2. **Create the Database:**
   * Run the following SQL query to create a clean database:
     ```sql
     CREATE DATABASE atlascopco_drawing_db;
     ```
   * Verify it was created by running:
     ```sql
     SHOW DATABASES;
     ```
   * Close the client.
3. **Import the SQL File:**
   * Open your Command Prompt (cmd).
   * Navigate to the MySQL `bin` directory:
     ```cmd
     cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"
     ```
   * Run the import command (replace `C:\path\to\AtlasDB.sql` with the actual path where you saved the `.sql` file):
     ```cmd
     mysql -u root -p atlascopco_drawing_db < "C:\path\to\AtlasDB.sql"
     ```
   * Enter your database password when prompted. The import will run quietly and complete.

---

## Phase 4: Backend Configuration & Startup

1. **Navigate to the Backend Directory:**
   * Open your terminal and navigate to the project's backend folder:
     ```cmd
     cd c:\Atlas-Copco-DrawLogAI\backend
     ```
2. **Configure Environment Variables (`.env`):**
   * In the `backend/Atlashost/` directory, create a file named `.env` (or copy `.env.example` to `.env`).
   * Open `.env` in an editor and configure your database parameters:
     ```env
     DB_HOST=127.0.0.1
     DB_USER=root
     DB_PASSWORD=YourMySQLPasswordHere
     DB_NAME=atlascopco_drawing_db
     
     # SMTP Email Configuration (for password resets and notifications)
     EMAIL_SENDER=atlascopcotestmail2025@gmail.com
     EMAIL_PASSWORD=your_email_app_password
     SMTP_SERVER=smtp.gmail.com
     SMTP_PORT=587
     SMTP_USE_TLS=true
     ```
3. **Create & Activate Python Virtual Environment:**
   * Build a virtual environment to manage dependencies:
     ```cmd
     python -m venv .venv
     ```
   * Activate the virtual environment:
     * **Windows Command Prompt:**
       ```cmd
       .venv\Scripts\activate
       ```
     * **Windows PowerShell:**
       ```powershell
       .venv\Scripts\Activate.ps1
       ```
     * **macOS / Linux:**
       ```bash
       source .venv/bin/activate
       ```
4. **Install Dependencies:**
   * Install the backend packages:
     ```cmd
     pip install -r requirements.txt
     ```
5. **Run the Flask Backend Server:**
   * Navigate to the server host folder:
     ```cmd
     cd Atlashost
     ```
   * Run the server:
     ```cmd
     python app.py
     ```
   * *The server will start up and run on: `http://127.0.0.1:5000`*

---

## Phase 5: Frontend Configuration & Startup

1. **Navigate to the Frontend Directory:**
   * Open a **new** terminal window and navigate to the frontend folder:
     ```cmd
     cd c:\Atlas-Copco-DrawLogAI\frontend
     ```
2. **Install Node Packages:**
   * Run npm install to download the client dependencies:
     ```cmd
     npm install
     ```
3. **Verify API Configuration:**
   * Open `src/environments/environment.ts` in your code editor and verify that the `apiUrl` points to your local Flask backend:
     ```typescript
     export const environment = {
       production: false,
       apiUrl: 'http://127.0.0.1:5000'
     };
     ```
4. **Run the Angular Frontend Server:**
   * Start the development server:
     ```cmd
     npm start
     ```
   * *The portal compiles and launches on: `http://localhost:4200`*

---

## Phase 6: Verify Connections
1. Open your browser and go to `http://localhost:4200`.
2. Try logging in using your credentials.
3. If successful, the frontend is successfully communicating with the backend, which is reading/writing to the MySQL database!
