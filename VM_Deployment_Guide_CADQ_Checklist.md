# Step-by-Step VM Deployment Guide: Dynamic CADQ Checklist System

This document is a complete, beginner-friendly, and step-by-step guide on how to deploy the newly built **Dynamic CADQ Checklist System** onto your Atlas Copco Windows Virtual Machine (VM Server: `10.91.17.78`).

---

## 1. Pre-Deployment Summary: What Needs to be Updated on the VM?

When deploying this feature to your production or staging VM, three layers must be updated:
1. **The Database (MySQL)**: Create the new `cadq_checklist` table and insert the checklist edition configuration setting.
2. **The Backend (Python Flask)**: Update `app.py` with the new API routes (`GET`, `POST`, `DELETE` for `/api/cadq-checklist`) and restart the Windows Service.
3. **The Frontend (Angular / IIS)**: Build the production Angular bundle and replace the files in the IIS web directory.

---

## 2. Step 1: Updating the MySQL Database on the VM

You need to execute a quick SQL script on your VM's MySQL database so that the new tables exist. 

### Method A: Using MySQL Workbench on the VM (Recommended & Easiest)
1. Open **MySQL Workbench** on the VM (or connect to the VM's database from your local machine).
2. Connect to your DrawLogAI database schema (e.g., `atlascopco_db`).
3. Open a **New SQL Query Tab**.
4. Copy and paste the following SQL script into the query editor:

```sql
-- 1. Create the new Dynamic CADQ Checklist Table
CREATE TABLE IF NOT EXISTS `cadq_checklist` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `seq_nr` varchar(20) DEFAULT NULL,
  `standard_ref` text DEFAULT NULL,
  `part_val` varchar(10) DEFAULT NULL,
  `piping_val` varchar(10) DEFAULT NULL,
  `welded_val` varchar(10) DEFAULT NULL,
  `other_val` varchar(10) DEFAULT NULL,
  `ferro_val` varchar(10) DEFAULT NULL,
  `non_ferro_val` varchar(10) DEFAULT NULL,
  `casted_machined_val` varchar(10) DEFAULT NULL,
  `machined_non_casted_val` varchar(10) DEFAULT NULL,
  `sheet_metal_val` varchar(10) DEFAULT NULL,
  `foam_decals_val` varchar(10) DEFAULT NULL,
  `assembly_val` varchar(10) DEFAULT NULL,
  `instruction_val` varchar(10) DEFAULT NULL,
  `information_val` varchar(10) DEFAULT NULL,
  `safety_labels_val` varchar(10) DEFAULT NULL,
  `team_name` varchar(100) DEFAULT NULL,
  `display_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Add the dynamic edition setting (if not already present)
INSERT IGNORE INTO `app_settings` (`setting_key`, `setting_value`) 
VALUES ('checklist_edition', '06');

-- 3. Verify the table was created
SELECT * FROM `cadq_checklist`;
```
5. Click the **Lightning Bolt icon** (Execute) to run the script. 
6. *Result:* Your database is now 100% ready for the new feature!

---

### Method B: Using Windows Command Prompt (CMD) on the VM
If you prefer running commands directly in terminal on the VM:
1. Open **Command Prompt as Administrator** on the VM.
2. Log into MySQL:
   ```cmd
   mysql -u root -p
   ```
   *(Enter your MySQL root password when prompted)*
3. Select your database:
   ```sql
   USE atlascopco_db;
   ```
   *(Replace `atlascopco_db` with your actual database name)*
4. Paste the SQL script from Method A above and press **Enter**.

---

## 3. Step 2: Deploying the Backend (`Python Flask`)

We need to replace the old `app.py` file on the VM with your updated `app.py` file containing the new checklist endpoints.

### Instructions:
1. **Copy the Updated File**: 
   - From your local development machine, copy the updated backend folder (or specifically `c:\INDUSTRY PROJ\ATLAS COPCO\Atlas-Copco-DrawLogAI\backend\Atlashost\app.py`).
   - Transfer it to the VM's backend hosting directory (typically located at `C:\inetpub\atlascopco-app\backend\Atlashost\` or similar).
2. **Replace the Existing File**:
   - Overwrite the existing `app.py` on the VM.
3. **Restart the Backend Service**:
   - Because Python WSGI / Waitress runs as a continuous Windows Service in the background, you must restart it so it loads the new Python code.
   - Open **Command Prompt as Administrator** on the VM and run:
     ```cmd
     cd C:\inetpub\atlascopco-app\backend\
     python flask-service.py restart
     ```
   - *Alternative Method (using Windows Services):*
     1. Press `Win + R`, type `services.msc`, and press **Enter**.
     2. Scroll down and find **AtlascopcoFlaskService** (or your Flask WSGI service name).
     3. Right-click it and select **Restart**.

---

## 4. Step 3: Deploying the Frontend (`Angular to IIS`)

We need to compile your new Angular source code (which contains the new **Checklist Config** UI and updated **Submission Form**) into optimized static web files and place them on IIS.

### Step 3.1: Build the Production Bundle (On your Local Machine)
1. Open your terminal / command prompt on your local development computer.
2. Navigate to your frontend directory:
   ```cmd
   cd "c:\INDUSTRY PROJ\ATLAS COPCO\Atlas-Copco-DrawLogAI\frontend"
   ```
3. Run the Angular production build command:
   ```cmd
   npm run build --prod
   ```
   *(Or `npx ng build --configuration production`)*
4. Once compilation finishes, a new folder named `dist` will be created inside your `frontend` directory. Inside it, you will see a folder containing index.html, main.js, styles.css, etc.

### Step 3.2: Package and Transfer to the VM
1. Go into the generated `dist/` folder.
2. Select all the compiled files and create a compressed ZIP file (e.g., `dist.zip`).
   > [!WARNING]  
   > **CRITICAL RULE:** Do **NOT** include or overwrite `web.config` on the VM server! The VM's IIS server has custom `web.config` routing rules and reverse proxy settings that must be preserved. Only copy the compiled `.html`, `.js`, `.css`, and asset files.
3. Transfer `dist.zip` to the VM server (`10.91.17.78`).

### Step 3.3: Update IIS Web Directory on the VM
1. On the VM, navigate to the IIS web hosting directory:
   ```cmd
   C:\inetpub\atlascopco-app\frontend\
   ```
   *(Or `C:\inetpub\wwwroot\drawlogai\` depending on your IIS site configuration)*
2. **Backup (Optional but Recommended):** Make a quick backup copy of the current frontend folder just in case.
3. **Extract & Replace:** Extract `dist.zip` directly into the IIS web directory, overwriting the old `.js` and `.css` files.
4. **Restart IIS Web Site (Optional):**
   - Open command prompt as Administrator on the VM and run:
     ```cmd
     iisreset
     ```
   - This clears the IIS cache and ensures users immediately get the newest version!

---

## 5. Post-Deployment Verification Checklist

Once all three steps above are done, perform this quick test on the corporate network (`https://drawlogai.atlascopco.group`):

- [ ] **1. Test Admin Access**: Log in as an Admin and verify that the new navigation link **"Checklist Config"** appears in the sidebar/menu.
- [ ] **2. Test Default Auto-Loading**: Click on **Checklist Config**. If the table is blank, verify that the 26 standard Atlas Copco criteria auto-load seamlessly.
- [ ] **3. Test Team Customization**: Select a team (e.g., `Mechanical`), delete a few rows, add a custom row, and click **"Save All New"**. Verify that a success popup appears!
- [ ] **4. Test Employee Real-Time View**: Log out and log back in as an employee belonging to that team (e.g., `EMP_07`). Open the **Submission Form** and verify that their table shows **EXACTLY** the custom checklist you just saved!

---
*Your Dynamic CADQ Checklist Feature is now fully deployed and live on your Virtual Machine!*
