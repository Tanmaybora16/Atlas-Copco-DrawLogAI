# Atlas Copco AI-Powered Drawing Error Logging System
## Technical Documentation for Industry Submission

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Key Features](#key-features)
8. [Security Implementation](#security-implementation)
9. [Deployment Architecture](#deployment-architecture)
10. [API Documentation](#api-documentation)
11. [AI/ML Integration](#aiml-integration)
12. [Workflow Diagrams](#workflow-diagrams)

---

## Executive Summary

The Atlas Copco AI-Powered Drawing Error Logging System is a full-stack enterprise web application designed to automate the detection and management of technical drawing errors in an industrial manufacturing environment. The system leverages machine learning to automatically identify common drafting errors from annotated PDF drawings, streamlining the quality review process.

### Core Capabilities:
- **AI-Powered Error Detection**: Automatically extracts annotations from technical drawings and classifies errors using machine learning
- **Drawing Management**: Complete lifecycle management of technical drawings with revision control
- **Role-Based Access Control**: Separate workflows for HR administrators and engineering employees
- **Real-Time Reporting**: Comprehensive analytics and trend analysis across divisions, product centers, and time periods
- **Email Notifications**: Automated workflow notifications for drawing reviews and rejections
- **Batch Processing**: Support for bulk drawing submissions

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer (Browser)                   │
│                 Angular 16 SPA (Port 80)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Application Layer                          │
│            Flask REST API (Python) (Port 5000)              │
│  ┌──────────────────────────────────────────────────┐      │
│  │  • Authentication & Authorization                 │      │
│  │  • Business Logic & Validation                   │      │
│  │  • ML Model Integration (TF-IDF + Classifier)   │      │
│  │  • PDF Processing (PyMuPDF, Tesseract OCR)      │      │
│  │  • Email Service (SMTP)                          │      │
│  └──────────────────────────────────────────────────┘      │
└──────────────────────┬──────────────────────────────────────┘
                       │ PyMySQL
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Data Layer                                │
│                MySQL 8 Database                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │  • Employee & Login Tables                       │      │
│  │  • Drawing Metadata                              │      │
│  │  • Dynamic Per-Employee Tables                   │      │
│  │  • Dynamic Per-Drawing Tables                    │      │
│  │  • Monthly Error Aggregation Tables              │      │
│  │  • BLOB Storage for PDF Files                    │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Containerization Architecture

The system is fully containerized using Docker with three services:
1. **Frontend Container**: NGINX serving Angular production build
2. **Backend Container**: Gunicorn WSGI server running Flask application
3. **Database Container**: MySQL 8 with persistent volume storage

---

## Technology Stack

### Frontend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| **Angular** | 16.1.0 | Primary frontend framework |
| **TypeScript** | 5.1.6 | Type-safe JavaScript |
| **ng-apexcharts** | 1.7.6 | Interactive charting library |
| **Bootstrap** | 5.2.3 | Responsive UI framework |
| **PrimeNG** | 16.9.1 | UI component library |
| **RxJS** | 7.8.0 | Reactive programming |
| **jsPDF** | 3.0.1 | PDF generation for reports |
| **ExcelJS** | 4.4.0 | Excel export functionality |

### Backend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| **Flask** | 3.1.2 | REST API framework |
| **Python** | 3.x | Backend language |
| **PyMySQL** | 1.1.2 | MySQL database connector |
| **PyMuPDF (fitz)** | 1.26.6 | PDF parsing and annotation extraction |
| **Tesseract OCR** | 0.3.13 | Optical character recognition |
| **scikit-learn** | 1.7.2 | Machine learning library |
| **joblib** | 1.5.2 | Model serialization |
| **bcrypt** | 5.0.0 | Password hashing |
| **Flask-CORS** | 6.0.1 | Cross-origin resource sharing |
| **Gunicorn** | 21.2.0 | Production WSGI server |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| **MySQL** | 8.0 | Relational database management |

### DevOps & Deployment
| Technology | Purpose |
|------------|---------|
| **Docker** | Containerization platform |
| **Docker Compose** | Multi-container orchestration |
| **NGINX** | Web server and reverse proxy |

---

## Database Schema

### Core Tables

#### 1. **employees** Table
Stores employee master data.

```sql
CREATE TABLE `employees` (
  `Emp_ID` VARCHAR(50) NOT NULL PRIMARY KEY,
  `Emp_Name` VARCHAR(255) NOT NULL,
  `Emp_Division` VARCHAR(255) NOT NULL,
  `Emp_PC` VARCHAR(50) DEFAULT NULL,
  `Emp_Team` VARCHAR(100) DEFAULT NULL,
  `Emp_Email` VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Purpose**: Central employee registry for authentication, authorization, and metadata association.

**Key Fields**:
- `Emp_ID`: Unique identifier (format: `EMP_xxxxx`)
- `Emp_Division`: Business division (IAT, OFA, CTS, VIN, etc.)
- `Emp_PC`: Product Center assignment
- `Emp_Team`: Team assignment for reporting

---

#### 2. **login** Table
Authentication credentials and access control.

```sql
CREATE TABLE `login` (
  `username` VARCHAR(255) NOT NULL PRIMARY KEY,
  `password` VARCHAR(255) NOT NULL,
  `Access_Type` VARCHAR(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Purpose**: Stores bcrypt-hashed passwords and role-based access types.

**Access Types**:
- `HR`: Administrator with employee management privileges
- `Employee`: Standard user with drawing submission/review rights

**Default Admin Credentials**:
- Username: `Admin`
- Password: Bcrypt hash stored in database
- Access Type: `HR`

---

#### 3. **login_otp** Table
One-time password management for password reset flow.

```sql
CREATE TABLE `login_otp` (
  `username` VARCHAR(50) NOT NULL,
  `purpose` ENUM('first_login','password_reset') NOT NULL,
  `otp` VARCHAR(100) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `consumed` TINYINT(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`username`,`purpose`),
  FOREIGN KEY (`username`) REFERENCES `login` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Purpose**: Manages time-limited OTPs for secure password reset operations.

**Features**:
- 4-digit OTP with bcrypt hashing
- 5-minute expiration window
- Automatic cleanup of expired/consumed OTPs

---

#### 4. **drawings** Table
Master drawing registry with metadata and PDF storage.

```sql
CREATE TABLE `drawings` (
  `drawing_ID` VARCHAR(255) NOT NULL PRIMARY KEY,
  `Revision_num` INT NOT NULL DEFAULT 0,
  `Reviewer_EMP_ID` VARCHAR(255) DEFAULT NULL,
  `Creator_EMP_ID` VARCHAR(255) DEFAULT NULL,
  `Date` DATE DEFAULT NULL,
  `CheckList` VARCHAR(20) DEFAULT NULL,
  `Drawing_Type` VARCHAR(255) DEFAULT NULL,
  `Drawing_PDF` MEDIUMBLOB
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Purpose**: Central repository for all technical drawings with binary PDF storage.

**Key Fields**:
- `drawing_ID`: Format `DR_<design_number>`
- `Revision_num`: Revision number for version control
- `Drawing_PDF`: Binary PDF data (MEDIUMBLOB supports up to 16MB)

---

### Dynamic Tables

#### 5. **Per-Employee Tables** (e.g., `EMP_12345`)
Dynamically created for each employee to track their drawing submissions.

```sql
CREATE TABLE `EMP_xxxxx` (
  Drawing_ID VARCHAR(255) NOT NULL,
  Revision_num INT NOT NULL,
  Error_codes VARCHAR(255),
  Reviewer_EMP_ID VARCHAR(255),
  Review_Date DATE,
  Decision VARCHAR(10),
  PRIMARY KEY (Drawing_ID, Revision_num)
);
```

**Purpose**: Tracks the creator's view of submitted drawings and their review status.

---

#### 6. **Per-Drawing Tables** (e.g., `DR_9096998787`)
Dynamically created for each unique drawing to track all revisions.

```sql
CREATE TABLE `DR_xxxxxxxxxx` (
  Revision_num INT PRIMARY KEY,
  Reviewer_EMP_ID VARCHAR(255),
  Creator_EMP_ID VARCHAR(255),
  Error_codes VARCHAR(255),
  Date DATE,
  Drawing_type VARCHAR(255),
  Decision VARCHAR(255),
  Drawing_PDF MEDIUMBLOB
);
```

**Purpose**: Maintains complete revision history for individual drawings.

---

#### 7. **Monthly Error Aggregation Tables** (e.g., `EC_01_2025`)
Dynamically created for each month to aggregate error statistics.

```sql
CREATE TABLE `EC_MM_YYYY` (
  Division VARCHAR(50) NOT NULL,
  PC VARCHAR(50) NOT NULL,
  P1 INT DEFAULT 0,
  P2 INT DEFAULT 0,
  -- ... (33 error code columns: P1-P20, P22-P24, P26-P41, P46-P51, P57-P59, P70)
  Approved_Drawings INT DEFAULT 0,
  Rejected_Drawings INT DEFAULT 0,
  PRIMARY KEY (Division, PC)
);
```

**Purpose**: Aggregates error occurrences by division and product center for reporting.

**Pre-seeded Division/PC Combinations**:
- **IAT**: BQR, API, WUX, COX, PNE, FRJ, UTY, TRD, ITJ, ITR
- **OFA**: API, WUX, COX, PNE, UTY, TRD, ITJ, PNB, Crepelle, UTF, APF, OFA STD
- **CTS**: APC
- **VIN**: Edwards India (IPG), UWH, PNE, ESF, UVC, WUX, BQR

---

## Backend Implementation

### Flask Application Structure

The backend is a monolithic Flask application (`app.py`, 2820 lines) organized into functional modules:

#### 1. **Database Connection Module**

```python
def connect_to_db():
    for i in range(10):  # Retry logic for container startup
        try:
            db = pymysql.connect(
                host=os.getenv("DB_HOST", "localhost"),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASSWORD", "root"),
                database=os.getenv("DB_NAME", "error_db"),
                connect_timeout=5
            )
            return db
        except Exception as e:
            time.sleep(3)  # Wait for MySQL container
    return None
```

**Features**:
- Environment variable configuration for Docker deployment
- Automatic retry logic (10 attempts with 3-second intervals)
- Timezone configuration to IST (Indian Standard Time)

---

#### 2. **AI/ML Error Detection Module**

```python
# Load pre-trained models at startup
MODEL_PATH = os.path.join(BASE_DIR, "error_code_classifier_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "tfidf_vectorizer.pkl")
model = joblib.load(MODEL_PATH)
tfidf_vectorizer = joblib.load(VECTORIZER_PATH)

def extract_annotations(pdf_path):
    """Extract text annotations from PDF using PyMuPDF"""
    annotations = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            if page.annots():
                for annot in page.annots():
                    if annot.info and "content" in annot.info:
                        comment = annot.info["content"].strip()
                        if comment:
                            annotations.append(comment)
    return annotations if annotations else ["No annotations found"]

def predict_error(comments):
    """Classify error codes using TF-IDF and ML model"""
    if not comments or comments == ["No annotations found"]:
        return []
    comment_vectors = tfidf_vectorizer.transform(comments)
    predictions = model.predict(comment_vectors)
    return predictions.tolist()
```

**ML Pipeline**:
1. **Annotation Extraction**: PyMuPDF reads PDF comment objects
2. **Text Vectorization**: TF-IDF converts text to numerical features
3. **Classification**: Trained model predicts error codes (P1-P70)

**Supported Error Codes**: 33 Atlas Copco standard error categories covering:
- Surface roughness criteria (P1)
- General tolerances (P2)
- Welding specifications (P4, P9)
- Casting requirements (P5, P6, P7)
- Documentation standards (P11-P24)
- Drawing conventions (P26-P41)
- Quality checks (P46-P70)

---

#### 3. **Authentication & Authorization Module**

##### Login Endpoint (`/admin-login`)

```python
@app.route('/admin-login', methods=['POST'])
def admin_login():
    data = request.get_json()
    username = data.get("username").strip()
    password = data.get("password").strip()
    
    # Query database for user
    cursor.execute("SELECT username, password, access_type FROM login WHERE username = %s", (username,))
    row = cursor.fetchone()
    
    if not row:
        return jsonify({"success": False, "message": "Invalid Credentials"}), 401
    
    # Verify bcrypt password
    ok = bcrypt.checkpw(password.encode('utf-8'), row[1].encode('utf-8'))
    
    if ok:
        return jsonify({
            "success": True,
            "status": "OK",
            "access_type": row[2],  # "HR" or "Employee"
            "message": "Login Successful"
        }), 200
    else:
        return jsonify({"success": False, "message": "Invalid Credentials"}), 401
```

---

##### Password Reset Flow (3-Step Process)

**Step 1: Initiate (`/auth/forgot-password/initiate`)**
- Validates employee ID and email against database
- Generates 4-digit OTP with bcrypt hashing
- Stores OTP with 5-minute expiration
- Sends OTP via SMTP email

**Step 2: Verify (`/auth/forgot-password/verify`)**
- Validates OTP against hashed value
- Checks expiration timestamp
- Marks OTP as consumed after verification

**Step 3: Reset (`/auth/forgot-password/reset`)**
- Enforces password policy (8-64 chars, upper, lower, digit, symbol)
- Prevents reuse of previous password
- Updates login table with new bcrypt hash
- Sends confirmation email

---

#### 4. **Drawing Submission Module**

##### Upload & Extract (`/upload`)

```python
@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)
    
    # Extract annotations from PDF
    annotations = extract_annotations(file_path)
    
    # Predict error codes using ML model
    predictions = predict_error(annotations)
    
    return jsonify({
        'file_name': file.filename,
        'file_path': file_path,
        'extracted_comments': annotations,
        'predicted_errors': predictions
    })
```

---

##### Submit Drawing (`/submit`)

This is the core transaction endpoint that:
1. Validates all required fields (design number, reviewer, revision, etc.)
2. Ensures drawing exists in `drawings` table
3. Creates per-employee table if not exists
4. Prevents duplicate revision submissions (409 Conflict)
5. Inserts record into employee's table
6. Creates per-drawing table if not exists
7. Inserts record with PDF blob into drawing table
8. Updates monthly error aggregation table (`EC_MM_YYYY`)
9. Sends rejection email if decision = "reject"
10. Commits transaction atomically

**Email Notification** (On Rejection):
- Recipient: Creator's registered email
- Subject: Drawing Review Notification
- Attachments: Reviewed PDF
- Body: Drawing ID, revision, error codes, reviewer comments

---

##### Batch Submission (`/submit-batch`)

Handles multiple PDF uploads in a single request:
- Extracts drawing ID and revision from filename (e.g., `9096998745-01.pdf`)
- Inserts/updates `drawings` table for each file
- Sends single summary email to reviewer listing all submitted drawings

---

#### 5. **Employee Management Module** (HR Access Only)

##### Add Employee (`/add-employee`)

```python
@app.route('/add-employee', methods=['POST'])
def add_employee():
    # 1. Insert into employees table
    cursor.execute("INSERT INTO employees (Emp_ID, Emp_Name, EMP_Email, ...) VALUES (...)")
    
    # 2. Create per-employee dynamic table
    cursor.execute(f"CREATE TABLE `{emp_id}` (Drawing_ID, Revision_num, ...)")
    
    # 3. Create login credentials (password = bcrypt(email))
    password_hash = bcrypt.hashpw(emp_email.encode('utf-8'), bcrypt.gensalt())
    cursor.execute("INSERT INTO login (username, password, access_type) VALUES (%s, %s, 'Employee')")
    
    # 4. Send welcome email with credentials
    send_welcome_credentials_email(emp_email, emp_id)
    
    conn.commit()
```

**Initial Password**: Employee's registered office email address (must change on first login)

---

##### Edit Employee (`/edit-employee`)
- Updates employee details (name, email, division, PC, team)
- Does NOT allow changing Emp_ID (primary key)

##### Delete Employee (`/delete-employee/<emp_id>`)
- Removes from `login_otp` table (cascading cleanup)
- Removes from `login` table
- Drops per-employee table
- Removes from `employees` table

---

#### 6. **Reporting & Analytics Module**

##### Monthly Drawing Status (`/api/monthly-drawing-status`)
Returns approved vs rejected drawing counts per month for selected division/PC.

**Response Format**:
```json
{
  "Apr-2025": { "approved": 45, "rejected": 5 },
  "May-2025": { "approved": 52, "rejected": 3 }
}
```

---

##### Monthly Error Report (`/api/monthly-error-report`)
Aggregates total error counts across all error codes per month.

**Response Format**:
```json
[
  { "month": "01-2025", "total_errors": 127 },
  { "month": "02-2025", "total_errors": 98 }
]
```

---

##### Trend Error Report (`/api/trend-error-report`)
Returns top 10 most frequent error codes across selected time period.

**Response Format**:
```json
[
  { "error_code": "P23", "count": 45 },
  { "error_code": "P35", "count": 38 },
  ...
]
```

---

##### Pass Ratio Report (`/get-pass-ratio`)
Calculates approval percentage by month.

**Response Format**:
```json
[
  {
    "year": "2025",
    "month": "Jan",
    "accepted_drawings": 45,
    "total_drawings": 50,
    "pass_ratio": "90.00%"
  }
]
```

---

##### Employee Report (`/api/employee-report`)
Returns all drawings submitted by a specific employee with status (Pending/Approved/Rejected).

##### Drawing Report (`/api/drawing-report`)
Returns complete revision history for a specific drawing.

---

#### 7. **Request Management Module**

##### Creator Requests (`/requests/creator/<emp_id>`)
Shows all drawings submitted by the employee with their review status:
- **Pending**: Awaiting reviewer action
- **Approved**: Reviewer approved the drawing
- **Rejected**: Reviewer rejected with error codes

##### Reviewer Requests (`/requests/reviewer/<emp_id>`)
Shows all drawings assigned to the reviewer:
- **Review**: Not yet reviewed
- **Reviewed**: Review completed

##### Delete Request (`/requests/delete/<drawing_id>/<revision>`)
Removes a drawing request from both creator and reviewer views.

---

#### 8. **PDF Management Module**

##### Download PDF (`/api/drawings/<drawing_id>/<revision>/download`)
- Fetches PDF blob from per-drawing table
- Returns as downloadable attachment
- Filename format: `DR_xxxxxxxxxx-01.pdf`

##### View PDF (`/drawings/<drawing_id>/<revision>/pdf/view`)
- Streams PDF directly to browser
- MIME type: `application/pdf`

##### Download Annotated PDF (`/drawings/<drawing_id>/<revision>/pdf/annotated/download`)
- Receives annotation coordinates from frontend canvas
- Adds annotations to PDF using PyMuPDF
- Returns temporary annotated PDF without modifying database

---

## Frontend Implementation

### Angular Application Structure

```
src/app/
├── admin-login/           # Login page component
├── canvas/                # Drawing annotation canvas
├── components/
│   ├── bar-chart/        # ApexCharts bar chart wrapper
│   ├── column-chart/     # ApexCharts column chart wrapper
│   ├── line-chart/       # ApexCharts line chart wrapper
│   ├── change-password/  # Password change form
│   ├── forgot-password/  # Password reset flow (3 steps)
│   ├── error-code/       # Error code display component
│   ├── date-picker/      # Date range selector
│   ├── header/           # Navigation header
│   ├── report-charts/    # Report visualization container
│   ├── report-table/     # Report data table
│   └── table/            # Generic table component
├── employee/             # HR employee management page
├── reports/              # Analytics & reports page
├── requests/             # Drawing request tracking page
├── submission/           # Batch drawing submission page
├── uploads/              # Single drawing upload & review
├── auth.service.ts       # Authentication state management
├── auth.guard.ts         # Route protection guard
└── app-routing.module.ts # Route configuration
```

---

### Routing Configuration

```typescript
const routes: Routes = [
  { path: '', redirectTo: 'admin-login', pathMatch: 'full' },
  
  // Public routes
  { path: 'admin-login', component: AdminLoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  
  // Employee routes (authenticated)
  { 
    path: 'uploads', 
    component: UploadsComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['Employee'] } 
  },
  { 
    path: 'submission', 
    component: SubmissionComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['Employee'] } 
  },
  { 
    path: 'requests', 
    component: RequestsComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['Employee'] } 
  },
  { 
    path: 'canvas', 
    component: CanvasComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['Employee'] } 
  },
  
  // HR routes (authenticated)
  { 
    path: 'employee', 
    component: EmployeeComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['HR'] } 
  },
  
  // Shared routes (both roles)
  { 
    path: 'reports', 
    component: ReportsComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['HR', 'Employee'] } 
  },
  { 
    path: 'change-password', 
    component: ChangePasswordComponent, 
    canActivate: [AuthGuard], 
    data: { roles: ['HR', 'Employee'] } 
  },
  
  { path: '**', redirectTo: 'admin-login' }
];
```

---

### Authentication Service

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  
  login(username: string, accessType: 'HR' | 'Employee'): void {
    const state = {
      username: username.trim(),
      accessType,
      loginTime: Date.now()
    };
    sessionStorage.setItem('session', JSON.stringify(state));
  }
  
  logout(): void {
    sessionStorage.removeItem('session');
  }
  
  isLoggedIn(): boolean {
    const state = this.getState();
    if (!state) return false;
    
    // Check session expiry
    const age = Date.now() - state.loginTime;
    if (age > this.SESSION_MAX_AGE_MS) {
      this.logout();
      return false;
    }
    return true;
  }
  
  getAccessType(): 'HR' | 'Employee' | undefined {
    return this.getState()?.accessType;
  }
}
```

**Session Management**:
- Uses `sessionStorage` (cleared when browser tab closes)
- Hard timeout: 1 hour from login
- No rolling/idle timeout (can be enabled by uncommenting refresh logic)

---

### Authorization Guard

```typescript
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}
  
  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    // Check if logged in
    if (!this.auth.isLoggedIn()) {
      return this.router.parseUrl('/admin-login');
    }
    
    // Check role-based access
    const allowedRoles = route.data['roles'] as ('HR' | 'Employee')[];
    const userRole = this.auth.getAccessType();
    
    if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
      // Redirect to default page for user's role
      return this.router.parseUrl(userRole === 'HR' ? '/reports' : '/uploads');
    }
    
    return true;
  }
}
```

---

### Key Components

#### 1. Uploads Component (`uploads.component.ts`)

**Responsibilities**:
- Single drawing upload and review
- AI-powered error extraction
- Manual error code editing
- Drawing metadata form
- Employee auto-lookup
- Submit to backend

**Workflow**:
1. User selects PDF file
2. File uploaded to `/upload` endpoint
3. Backend extracts annotations and predicts error codes
4. User reviews/edits predicted errors
5. User fills metadata (reviewer, design number, revision, division, PC)
6. Employee dropdown auto-fills division, PC, team from database
7. User selects approve/reject decision
8. Submit to `/submit` endpoint
9. Backend stores in database and sends email if rejected

**Error Editing Features**:
- Inline editing of error codes
- Visual indication of edited rows (yellow highlight)
- Toggle between list view and count view
- Add/remove error codes manually

---

#### 2. Submission Component (`submission.component.ts`)

**Responsibilities**:
- Batch drawing submission (multiple PDFs at once)
- Bulk upload to reviewer
- Single email notification for all drawings

**Workflow**:
1. User selects multiple PDF files
2. User enters reviewer email and drawing metadata
3. Bulk upload to `/submit-batch` endpoint
4. Backend extracts drawing ID and revision from filenames
5. Backend stores all drawings in database
6. Single email sent to reviewer with list of all drawings

---

#### 3. Requests Component (`requests.component.ts`)

**Responsibilities**:
- View incoming review requests (as reviewer)
- View outgoing submission status (as creator)
- Delete requests
- Navigate to review page from request

**Features**:
- Tabbed interface (Incoming/Outgoing)
- Status badges (Pending/Approved/Rejected/Review/Reviewed)
- Date filtering
- PDF preview modal
- Direct navigation to uploads page for review

---

#### 4. Canvas Component (`canvas.component.ts`)

**Responsibilities**:
- Display PDF in browser
- Draw annotations on PDF canvas
- Export annotated PDF
- Integration with uploads workflow

**Technical Implementation**:
- Uses HTML5 Canvas API
- PDF rendering with pdf.js (pdfjs-dist library)
- Coordinate normalization for multi-resolution support
- Annotation persistence across page navigation

---

#### 5. Reports Component (`reports.component.ts`)

**Responsibilities**:
- Switch between 5 report types:
  1. Monthly Drawing Status (Column Chart)
  2. Monthly Error Trend (Bar Chart + Line Chart)
  3. Pass Ratio Analysis (Table)
  4. Employee Report (Table + Charts)
  5. Drawing Report (Table + Charts)
  
**Filters**:
- Division dropdown
- Product Center dropdown (filtered by division)
- Date range picker
- Employee dropdown (for employee report)
- Drawing dropdown (for drawing report)

**Chart Types**:
- **Column Chart**: Approved vs Rejected per month
- **Bar Chart**: Top 10 error codes
- **Line Chart**: Trend over time

**Export Features**:
- Export to Excel (using ExcelJS)
- Export to PDF (using jsPDF)
- Print functionality

---

#### 6. Employee Component (`employee.component.ts`)

**Responsibilities** (HR Only):
- Add new employees
- Edit employee details
- Delete employees (with cascading cleanup)
- View employee list

**Features**:
- Multi-select PC dropdown
- Division-based PC filtering
- Email validation
- Duplicate ID prevention
- Automatic login credential creation

---

#### 7. Change Password Component

**Features**:
- Current password verification
- New password validation (8-64 chars, complexity requirements)
- Password match confirmation
- Email notification after successful change

---

#### 8. Forgot Password Component

**3-Step Wizard**:
1. **Step 1**: Enter Employee ID and Email → Receive OTP via email
2. **Step 2**: Enter 4-digit OTP → Verify OTP
3. **Step 3**: Enter new password → Reset password

---

## Key Features

### 1. AI-Powered Error Detection

**Technology**: 
- TF-IDF (Term Frequency-Inverse Document Frequency) vectorization
- Supervised classification model (scikit-learn)
- Pre-trained on Atlas Copco drawing standard error taxonomy

**Process**:
1. PDF annotations extracted using PyMuPDF
2. Text comments vectorized using TF-IDF
3. Model predicts error codes from 33 categories
4. Confidence-based filtering

**Accuracy Optimization**:
- Training data based on historical Atlas Copco drawings
- Regular model retraining with new annotations
- Support for manual correction and learning

---

### 2. Dynamic Table Architecture

**Benefits**:
- Scales to unlimited number of employees and drawings
- Avoids large JOIN operations on monolithic tables
- Enables per-entity data isolation
- Supports efficient archival strategies

**Trade-offs**:
- Increased schema complexity
- Requires dynamic SQL generation
- More difficult for ad-hoc querying

---

### 3. Comprehensive Revision Control

**Features**:
- Automatic revision incrementing
- Complete revision history per drawing
- PDF versioning with BLOB storage
- Drawing status tracking (Pending/Approved/Rejected)

**Version Management**:
- Filename-based revision extraction (e.g., `9096998745-01.pdf`)
- Duplicate revision prevention (409 Conflict)
- Support for manual revision override

---

### 4. Role-Based Access Control (RBAC)

**Roles**:
- **HR**: Employee management, full reporting access
- **Employee**: Drawing submission, review, limited reporting

**Implementation**:
- Angular `AuthGuard` enforces route-level protection
- Backend validates `Access_Type` from database
- Session-based authentication (1-hour timeout)

---

### 5. Email Notification System

**SMTP Configuration**:
- Server: `smtp.onevirtualoffice.local`
- Port: 25 (no TLS)
- Sender: `Errorloggingportal@atlascopco.com`

**Email Templates**:
1. **Rejection Notification** (to Creator)
2. **Welcome Credentials** (to New Employee)
3. **OTP for Password Reset**
4. **Password Change Confirmation**
5. **Batch Submission Summary** (to Reviewer)

---

### 6. Advanced Reporting & Analytics

**Report Types**:
1. **Time Series Analysis**: Approved/rejected trends over time
2. **Error Distribution**: Most frequent error codes
3. **Pass Ratio**: Approval percentage by month
4. **Employee Performance**: Individual drawing statistics
5. **Drawing History**: Complete revision audit trail

**Visualization**:
- Interactive charts with zoom, pan, download
- Responsive design for mobile/tablet
- Real-time filter updates
- Drill-down capabilities

---

## Security Implementation

### 1. Password Security

**Hashing**: bcrypt with automatic salt generation
```python
password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
```

**Verification**:
```python
bcrypt.checkpw(input_password.encode('utf-8'), stored_hash.encode('utf-8'))
```

**Password Policy**:
- Minimum 8 characters, maximum 64
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (!@#$%^&*_+-=?)

**Regex Validation**:
```python
re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+\-=?])[A-Za-z\d!@#$%^&*_+\-=?]{8,64}$')
```

---

### 2. SQL Injection Prevention

**Parameterized Queries**:
```python
# GOOD - Prevents SQL injection
cursor.execute("SELECT * FROM employees WHERE Emp_ID = %s", (emp_id,))

# BAD - Vulnerable to SQL injection (NOT used in codebase)
# cursor.execute(f"SELECT * FROM employees WHERE Emp_ID = '{emp_id}'")
```

**Dynamic Table Names**: Whitelist validation
```python
def _safe_table_name(name: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9_]+', name):
        raise ValueError("Invalid table name")
    return f"`{name}`"
```

---

### 3. Session Management

**Client-Side**:
- `sessionStorage` (cleared on tab close)
- Session state: `{ username, accessType, loginTime }`
- Hard timeout: 1 hour

**Server-Side**:
- No server-side session storage (stateless API)
- Each request validates username/access type from session
- Consider implementing JWT tokens for scalability

---

### 4. CORS Configuration

```python
from flask_cors import CORS
CORS(app)  # Allow all origins in development

# Production configuration (commented):
# CORS(app, origins=[
#     "https://drawlogai.atlascopco.group",
#     "http://drawlogai.atlascopco.group"
# ])
```

---

### 5. File Upload Security

**Validation**:
- Only PDF files accepted (MIME type check)
- File size limits (MEDIUMBLOB max 16MB)
- Filename sanitization using `werkzeug.utils.safe_join`

**Storage**:
- PDFs stored in database BLOBs (not filesystem)
- Reduces attack surface for directory traversal
- Enables transactional integrity

---

### 6. OTP Security

**Generation**:
```python
otp_int = secrets.randbelow(9000) + 1000  # 1000-9999
otp_hash = bcrypt.hashpw(str(otp_int).encode('utf-8'), bcrypt.gensalt())
```

**Expiration**:
- 5-minute validity window
- MySQL timestamp: `DATE_ADD(NOW(), INTERVAL 5 MINUTE)`

**Cleanup**:
- Automatic deletion of expired OTPs
- Consumed OTPs marked and deleted after password reset

---

## Deployment Architecture

### Docker Compose Configuration

```yaml
version: "3.9"

services:
  db:
    image: mysql:8
    container_name: mysql_db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: error_db
    volumes:
      - mysql_data:/var/lib/mysql
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql

  backend:
    image: tanmaybora16/atlas-copco-backend:latest
    depends_on:
      - db
    environment:
      DB_HOST: db
      DB_USER: root
      DB_PASSWORD: root
      DB_NAME: error_db
    ports:
      - "5000:5000"

  frontend:
    image: tanmaybora16/atlas-copco-frontend:latest
    ports:
      - "80:80"

volumes:
  mysql_data:
```

---

### Container Details

#### Frontend Container
- **Base Image**: nginx:alpine
- **Build Process**: Multi-stage Docker build
  1. Stage 1: `node:18-alpine` - Angular production build
  2. Stage 2: `nginx:alpine` - Serve static files
- **NGINX Configuration**: Custom `nginx.conf` for SPA routing
- **Port**: 80

#### Backend Container
- **Base Image**: python:3.11-slim
- **WSGI Server**: Gunicorn with 4 worker processes
- **Dependencies**: requirements.txt (15 packages)
- **Port**: 5000
- **Health Check**: `/health` endpoint

#### Database Container
- **Image**: mysql:8 (official)
- **Persistent Storage**: Named volume `mysql_data`
- **Initialization**: Executes `init.sql` on first startup
- **Port**: 3306 (internal only)

---

### Deployment Steps

1. **Build Docker Images**:
```bash
docker-compose build
```

2. **Start All Services**:
```bash
docker-compose up -d
```

3. **Verify Health**:
```bash
curl http://localhost:5000/health  # Backend
curl http://localhost              # Frontend
```

4. **View Logs**:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

5. **Stop Services**:
```bash
docker-compose down
```

6. **Full Cleanup** (including volumes):
```bash
docker-compose down -v
```

---

### Environment Configuration

**Backend Environment Variables**:
- `DB_HOST`: MySQL container hostname
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `DB_NAME`: Database name
- `EMAIL_SENDER`: SMTP sender email
- `SMTP_SERVER`: SMTP server hostname
- `SMTP_PORT`: SMTP port

**Frontend Environment** (`environment.ts`):
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000'
};
```

**Production** (`environment.prod.ts`):
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.atlascopco.group'  // Production API URL
};
```

---

## API Documentation

### Authentication APIs

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/admin-login` | POST | User login | No |
| `/auth/forgot-password/initiate` | POST | Send OTP for password reset | No |
| `/auth/forgot-password/verify` | POST | Verify OTP | No |
| `/auth/forgot-password/reset` | POST | Reset password | No |
| `/auth/change-password` | POST | Change password (logged-in user) | Yes |

---

### Employee Management APIs (HR Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/add-employee` | POST | Create new employee |
| `/edit-employee` | PUT | Update employee details |
| `/delete-employee/<emp_id>` | DELETE | Delete employee and associated data |
| `/fetch-all-employees` | GET | Get all employees |
| `/get-employees` | GET | Get employee dropdown (ID + Name) |
| `/get-employee/<emp_id>` | GET | Get employee full details |

---

### Drawing Upload APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload` | POST | Upload PDF and extract errors |
| `/submit` | POST | Submit drawing for review |
| `/submit-batch` | POST | Batch submit multiple drawings |

---

### Reporting APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/monthly-drawing-status` | GET | Approved vs rejected per month |
| `/api/monthly-error-report` | GET | Total errors per month |
| `/api/trend-error-report` | GET | Top 10 error codes |
| `/api/drawings-trend` | GET | Drawing trend line chart data |
| `/get-pass-ratio` | POST | Pass ratio by month |
| `/api/employee-report` | GET | Employee drawing history |
| `/api/drawing-report` | GET | Drawing revision history |
| `/api/employee-drawing-status` | GET | Employee monthly status |
| `/api/error-summary` | GET | Error code summary |

---

### Request Management APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/requests/creator/<emp_id>` | GET | Creator's outgoing requests |
| `/requests/reviewer/<emp_id>` | GET | Reviewer's incoming requests |
| `/requests/delete/<drawing_id>/<revision>` | DELETE | Delete request |
| `/prefill-upload` | GET | Prefill upload form from request |

---

### PDF Management APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/drawings/<drawing_id>/<revision>/download` | GET | Download original PDF |
| `/drawings/<drawing_id>/<revision>/pdf/view` | GET | View PDF in browser |
| `/drawings/<drawing_id>/<revision>/pdf/download` | GET | Download PDF (alternative route) |
| `/drawings/<drawing_id>/<revision>/pdf/annotated/download` | POST | Download PDF with canvas annotations |

---

### Utility APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check endpoint |
| `/api/employees-dropdown` | GET | Employee dropdown for reports |
| `/api/drawings-dropdown` | GET | Drawing dropdown for reports |

---

## AI/ML Integration

### Machine Learning Model Architecture

**Model Type**: Supervised Classification

**Algorithm**: Likely one of:
- Logistic Regression
- Naive Bayes
- Support Vector Machine (SVM)
- Random Forest

(Exact algorithm depends on training configuration)

---

### Training Data Requirements

**Input Features**:
- Text annotations from PDF drawings
- Reviewer comments
- Historical error classifications

**Output Labels**:
- 33 error code categories (P1-P70)

**Training Process**:
1. Collect annotated PDF drawings
2. Extract text annotations manually or programmatically
3. Label each annotation with correct error code
4. Create TF-IDF vocabulary from training corpus
5. Train classifier on vectorized annotations
6. Serialize model and vectorizer using joblib

---

### Model Deployment

**Pre-trained Artifacts**:
- `error_code_classifier_model.pkl`: Serialized classifier
- `tfidf_vectorizer.pkl`: Serialized TF-IDF vectorizer

**Loading at Startup**:
```python
model = joblib.load(MODEL_PATH)
tfidf_vectorizer = joblib.load(VECTORIZER_PATH)
```

**Prediction Pipeline**:
```python
# 1. Extract annotations from PDF
annotations = extract_annotations(pdf_path)

# 2. Vectorize text
comment_vectors = tfidf_vectorizer.transform(annotations)

# 3. Predict error codes
predictions = model.predict(comment_vectors)
```

---

### Model Retraining Workflow

1. **Data Collection**:
   - Export annotations and manual corrections from database
   - Aggregate user edits as ground truth labels

2. **Preprocessing**:
   - Normalize text (lowercase, remove special chars)
   - Remove stopwords (optional)
   - Apply stemming/lemmatization (optional)

3. **Training**:
```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier  # or other algorithm
import joblib

# Prepare data
X_train = [...]  # List of annotation texts
y_train = [...]  # List of error codes

# Vectorize
vectorizer = TfidfVectorizer(max_features=1000)
X_vectors = vectorizer.fit_transform(X_train)

# Train model
model = RandomForestClassifier(n_estimators=100)
model.fit(X_vectors, y_train)

# Serialize
joblib.dump(model, 'error_code_classifier_model.pkl')
joblib.dump(vectorizer, 'tfidf_vectorizer.pkl')
```

4. **Deployment**:
   - Replace `.pkl` files in backend container
   - Restart backend service
   - No frontend changes required

---

## Workflow Diagrams

### 1. Drawing Review Workflow

```
[Employee] ──► [Upload PDF] ──► [AI Extraction] ──► [Review/Edit Errors]
                                                            │
                                                            ▼
                                              [Fill Metadata Form]
                                                            │
                                                            ▼
                                              [Select Approve/Reject]
                                                            │
                                                            ▼
                                                   [Submit to Backend]
                                                            │
                        ┌───────────────────────────────────┼─────────────────────────┐
                        │                                   │                         │
                        ▼                                   ▼                         ▼
              [Insert into drawings]         [Insert into EMP_xxxxx]    [Insert into DR_xxxxxx]
                        │                                   │                         │
                        └───────────────────────────────────┼─────────────────────────┘
                                                            │
                                                            ▼
                                              [Update EC_MM_YYYY table]
                                                            │
                                                            ▼
                                                [Decision = Reject?] ──Yes──► [Send Email to Creator]
                                                            │
                                                           No
                                                            │
                                                            ▼
                                                      [Transaction Complete]
```

---

### 2. Password Reset Workflow

```
[User] ──► [Forgot Password Page]
               │
               ▼
    [Enter Employee ID + Email]
               │
               ▼
       [Backend: Validate User]
               │
               ├──► [Generate 4-Digit OTP]
               ├──► [Hash OTP with bcrypt]
               ├──► [Store in login_otp table (5-min expiry)]
               └──► [Send OTP via Email]
                               │
                               ▼
                    [User Receives OTP Email]
                               │
                               ▼
                   [Enter OTP on Verify Page]
                               │
                               ▼
              [Backend: Validate OTP (not expired, matches hash)]
                               │
                               ├──► Success
                               │        │
                               │        ▼
                               │  [Enter New Password]
                               │        │
                               │        ▼
                               │  [Backend: Validate Password Policy]
                               │        │
                               │        ├──► [Check != Old Password]
                               │        ├──► [Update login table]
                               │        ├──► [Delete OTP from login_otp]
                               │        └──► [Send Confirmation Email]
                               │
                               └──► Failure ──► [Show Error Message]
```

---

### 3. Employee Onboarding Workflow

```
[HR Admin] ──► [Employee Management Page]
                      │
                      ▼
            [Click "Add Employee"]
                      │
                      ▼
         [Fill Employee Form]
          • Employee ID
          • Name
          • Email
          • Division
          • Product Center(s)
          • Team
                      │
                      ▼
            [Submit to Backend]
                      │
                      ▼
       [Backend: Validate Unique ID]
                      │
                      ├──► [Insert into employees table]
                      ├──► [Create per-employee table EMP_xxxxx]
                      ├──► [Create login record (password = hash(email))]
                      └──► [Send Welcome Email with Credentials]
                                       │
                                       ▼
                          [Employee Receives Email]
                                       │
                                       ▼
                           [Login with Initial Password]
                                       │
                                       ▼
                           [Forced to Change Password]
```

---

### 4. Batch Submission Workflow

```
[Employee] ──► [Submission Page]
                      │
                      ▼
         [Select Multiple PDF Files]
          • 9096998745-01.pdf
          • 9096998746-02.pdf
          • 9096998747-01.pdf
                      │
                      ▼
              [Enter Reviewer Email]
                      │
                      ▼
              [Enter Drawing Metadata]
               • Division
               • PC
               • Team
               • Drawing Type
                      │
                      ▼
            [Submit to /submit-batch]
                      │
                      ▼
         [Backend: Process Each File]
          ├──► Extract Drawing ID from filename (DR_9096998745)
          ├──► Extract Revision from filename (01)
          ├──► Check if drawing+revision exists
          │     ├──► Exists: UPDATE drawings table
          │     └──► Not Exists: INSERT into drawings table
          └──► Store PDF blob
                      │
                      ▼
          [Send Single Summary Email to Reviewer]
           • Lists all Drawing IDs + Revisions
           • Creator Name + ID
```

---

### 5. Report Generation Workflow

```
[User] ──► [Reports Page]
               │
               ▼
    [Select Report Type]
     • Monthly Drawing Status
     • Monthly Error Trend
     • Pass Ratio
     • Employee Report
     • Drawing Report
               │
               ▼
      [Apply Filters]
       • Division
       • Product Center
       • Date Range
       • Employee/Drawing ID
               │
               ▼
    [Frontend: Call Reporting API]
               │
               ▼
   [Backend: Query Database]
    ├──► [Aggregate data from EC_MM_YYYY tables]
    ├──► [Query per-employee tables]
    ├──► [Query per-drawing tables]
    └──► [Calculate metrics]
               │
               ▼
      [Return JSON Response]
               │
               ▼
   [Frontend: Render Charts/Tables]
    ├──► ApexCharts visualization
    └──► PrimeNG data tables
               │
               ▼
      [User: Export Data]
       • Export to Excel
       • Export to PDF
       • Print
```

---

## Conclusion

The Atlas Copco AI-Powered Drawing Error Logging System represents a comprehensive, production-ready enterprise solution that combines:

✅ **Modern Technology Stack**: Angular 16, Flask, MySQL 8, Docker  
✅ **AI/ML Integration**: Automated error detection with TF-IDF classification  
✅ **Enterprise Features**: RBAC, audit trails, email workflows, batch processing  
✅ **Scalable Architecture**: Dynamic tables, containerization, stateless API  
✅ **Security Best Practices**: bcrypt, parameterized queries, OTP expiration, session management  
✅ **Comprehensive Reporting**: 5 report types with interactive visualizations  
✅ **DevOps Ready**: Docker Compose, multi-stage builds, health checks  

The system is designed for deployment in industrial manufacturing environments with strict quality control requirements, supporting hundreds of engineers across multiple divisions and product centers.

---

**Document Version**: 1.0  
**Last Updated**: January 10, 2026  
**Technology Stack Versions**: Angular 16.1.0, Flask 3.1.2, MySQL 8.0  
**Deployment**: Docker Compose 3.9

---

## Appendix

### Error Code Reference

| Code | Description |
|------|-------------|
| P1 | 1254 K Criteria for surface roughness |
| P2 | 1350 K-f,m,c or v as required General tolerances |
| P3 | 1356 K Indirectly stated tolerances for fusion welding |
| P4 | 4366 K Threaded blind holes |
| P5 | 6131 K Dimensional tolerances for castings |
| P6 | 6134 K Specifications for steel and iron casting |
| P7 | 6136 K Specifications of aluminium casting |
| P8 | 6785 AIR Paint specifications |
| P9 | 6891 K Indication of welding data on drawings |
| P11 | Confidentiality note requirement |
| P12 | Prohibited substances note |
| P13 | Sharp edges note |
| P14 | Drawing & document edition consistency |
| P15 | Part or assembly linked to document |
| P16 | All parts latest revision |
| P17 | Material assigned in title block |
| P18 | Material comment added |
| P19 | Treatment assigned or not applicable |
| P20 | Treatment see drawing |
| P22 | Latest edition of Atlas Copco template |
| P23 | Spelling mistake check |
| P24 | Page numbering if applicable |
| P26 | Standard scale used |
| P27 | Section/detail views nominated |
| P28 | All basic dimensions available |
| P29 | Tolerances deviating from general tolerance |
| P30 | Geometrical tolerances stated correctly |
| P31 | Revision note and symbols available |
| P32 | Welding symbols all available |
| P33 | Surface roughness symbols and indicators |
| P34 | Centermarks and centerlines for holes |
| P35 | Ten digit numbers |
| P36-P37 | Confidentiality class requirements |
| P38 | Text font standards (Arial/Simsun) |
| P39 | Drawing unambiguously stated |
| P40 | Approval notification (PED, ASME) |
| P41 | Symbol(s) of quantity Atlas Copco standard |
| P42 | R/S or - markings correct |
| P43 | No material on standard parts |
| P44 | Material and comment complete |
| P46 | No manually changed dimensions |
| P47 | English language used |
| P48 | Part numbers and Qty not overwritten |
| P49 | Drawing not a standard part |
| P50 | Weight on drawing |
| P51 | Tabular drawing 3D links |
| P57 | Edition available for tabular drawing |
| P58 | Supplier information restrictions |
| P59 | Brand logo in template |
| P70 | All files "For Approval" or "Approved" during ECO |

---

### Division & Product Center Mapping

| Division | Product Centers |
|----------|----------------|
| **IAT** | BQR, API, WUX, COX, PNE, FRJ, UTY, TRD, ITJ, ITR |
| **OFA** | API, WUX, COX, PNE, UTY, TRD, ITJ, PNB, Crepelle, UTF, APF, OFA STD |
| **CTS** | APC |
| **VIN** | Edwards India (IPG), UWH, PNE, ESF, UVC, WUX, BQR |
| **AIA** | BQR, API, WUX, COX, PNE, FRJ, UTY, TRD, ITJ, PNB |
| **APE** | PNE, UVC, WUX, BQR, APP |
| **IAS** | PNE, ESF, UVC, WUX, BQR |
| **PFL** | PNE, ESF, UVC, WUX, BQR |

---

### Contact Information

For technical support or inquiries regarding this system, please contact:

**System Administrator**: Atlas Copco IT Department  
**Email**: Errorloggingportal@atlascopco.com  
**Support Hours**: Monday-Friday, 9:00 AM - 5:00 PM IST

---

*This documentation is confidential and proprietary to Atlas Copco AB. Unauthorized reproduction or distribution is prohibited.*
