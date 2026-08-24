import os

# Load environment variables from .env if it exists in current or parent directory
for env_path in [".env", "../.env"]:
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    os.environ[key] = val

from flask import Flask, jsonify, request, send_file, Response, g
from flask_cors import CORS
import base64, traceback
import fitz
import joblib
import pymysql
from datetime import datetime, timedelta, date
import json
import cv2
import pytesseract as pyt
import numpy as np
from PIL import Image
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from collections import Counter
import re
import calendar
import bcrypt
import secrets
from werkzeug.utils import safe_join, secure_filename
import io
import time
import sys
import os

# FIX: Enable unbuffered output for logging
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Upload Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Enhanced CORS configuration - allow all origins for development
CORS(app
    # , resources={
    # r"/*": {
    #     "origins": "*",
    #     "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    #     "allow_headers": ["Content-Type", "Authorization"],
    #     "supports_credentials": False
    # }}
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "error_code_classifier_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "tfidf_vectorizer.pkl")

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


@app.before_request
def before_request():
    """Establish a database connection for each request"""
    g.db = connect_to_db()
    if g.db is None:
        raise Exception("Database not available")


@app.teardown_request
def teardown_request(exception):
    """Close the database connection after each request"""
    db = getattr(g, 'db', None)
    if db is not None:
        try:
            db.close()
        except:
            pass

# Global db connection removed - using Flask g object with before_request/teardown_request

model = joblib.load(MODEL_PATH)
tfidf_vectorizer = joblib.load(VECTORIZER_PATH)

# SMTP Email Configuration (Use your SMTP server details)
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "Errorloggingportal@atlascopco.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.onevirtualoffice.local")
SMTP_PORT = int(os.getenv("SMTP_PORT", 25))
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true" if SMTP_PORT == 587 else "false").lower() in ("true", "1", "yes")

def get_smtp_server():
    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    # Commented out for production VM (uncomment if testing/using authentication):
    if SMTP_USE_TLS:
        # Secure negotiation using modern TLS context (CWE-757)
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        server.starttls(context=context)
    if EMAIL_PASSWORD:
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
    return server


# ============================================================================
# HELPER FUNCTIONS FOR SCHEMA MAPPING (NEW DB -> OLD API FORMAT)
# ============================================================================

def map_user_to_employee_response(user_dict):
    """
    Map users table row to old employees API format for backward compatibility.
    Input: dict with keys from users table (id, emp_id, name, email, etc.)
    Output: dict with old API format (Emp_ID, Emp_Name, EMP_Email, etc.)
    """
    return {
        "emp_id": user_dict.get("emp_id", ""),
        "emp_name": user_dict.get("name", ""),
        "EMP_Email": user_dict.get("email", ""),
        "emp_PC": user_dict.get("pc", ""),
        "emp_division": user_dict.get("division", ""),
        "emp_team": user_dict.get("team", "")
    }

def get_user_id_by_emp_id(cursor, emp_id):
    """Get internal user ID from emp_id"""
    cursor.execute("SELECT id FROM users WHERE emp_id = %s", (emp_id,))
    row = cursor.fetchone()
    return row[0] if row else None


def extract_annotations(pdf_path):
    annotations = []
    try:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                if page.annots():
                    for annot in page.annots():
                        if annot.info and "content" in annot.info:
                            comment = annot.info["content"].strip()
                            if comment:
                                # Ignore stamps generated by the system
                                if comment.startswith(("APPROVED\nBy ", "REJECTED\nBy ", "REVIEWED\nBy ")):
                                    continue
                                annotations.append(comment)
    except Exception as e:
        print(f"Error extracting annotations: {e}")
    return annotations if annotations else ["No annotations found"]

def predict_error(comments):
    if not comments or comments == ["No annotations found"]:
        return []
    comment_vectors = tfidf_vectorizer.transform(comments)
    predictions = model.predict(comment_vectors)
    return predictions.tolist() if predictions.size > 0 else []



ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 1000
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 2000

    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed. Only PDF files are permitted.'}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    
    # Enforce strict path traversal check (CWE-22)
    resolved_path = os.path.realpath(file_path)
    resolved_upload_folder = os.path.realpath(UPLOAD_FOLDER)
    if not resolved_path.startswith(resolved_upload_folder + os.path.sep) and resolved_path != resolved_upload_folder:
        return jsonify({'error': 'Path traversal attempt detected'}), 400

    file.save(file_path)
    
    annotations = extract_annotations(file_path)
    predictions = predict_error(annotations)

    return jsonify({
        'message': 'File processed successfully',
        'file_name': filename,
        'file_path': file_path,
        'extracted_comments': annotations,
        'predicted_errors': predictions,
    })


DEBUG_RETURN_ERRORS = False  # Set False in production to prevent leaking raw exceptions

def dbg_fail(step, err, extra=None, code=500):
    msg = f"{step}: {err}"
    print( msg)
    if extra:
        print("extra:", extra)
    if DEBUG_RETURN_ERRORS:
        return jsonify({"ok": False, "where": step, "error": str(err), "extra": extra}), code
    return jsonify({"error": "Internal Server Error"}), 500

@app.route('/submit', methods=['POST'])
def submit_data():
    if not hasattr(g, 'db') or g.db is None:
        return dbg_fail("db-check", "Database connection is not established", code=500)

    try:
        payload = request.get_json(silent=True) or {}
        form_data = payload.get("form_data", {})

        # -------- validate inputs --------
        required = ["designNo", "reviewerName", "revisionNo", "reviewedDate", "drawingType", "creatorId", "division", "pc"]
        missing = [k for k in required if not str(form_data.get(k) or "").strip()]
        if missing:
            return dbg_fail("validate-required", f"Missing required field(s): {', '.join(missing)}", extra={"form_data": form_data}, code=400)

        # normalize / parse
        try:
            design_no_raw = str(form_data["designNo"]).strip()
            drawing_no = f"DR_{design_no_raw}" if not design_no_raw.startswith("DR_") else design_no_raw
            creator_emp_id = str(form_data["creatorId"]).strip()
            reviewer_emp_id = str(form_data["reviewerName"]).strip()
            if not reviewer_emp_id.upper().startswith("EMP_"):
                reviewer_emp_id = f"EMP_{reviewer_emp_id}"

            revision_no_int = int(str(form_data["revisionNo"]).strip())

            from datetime import datetime
            from pytz import timezone

            IST = timezone('Asia/Kolkata')
            reviewed_date = datetime.now(IST).date()
            drawing_type = str(form_data["drawingType"]).strip()
            task_number = str(form_data.get("task_number", "")).strip()
            decision = (str(form_data.get("decision", "")).strip() or "approve").lower()
            approved = (decision == "approve")
            division = str(form_data["division"]).strip()
            pc = str(form_data["pc"]).strip()

        except Exception as e:
            return dbg_fail("parse-normalize", e, extra={"form_data": form_data}, code=400)

        error_codes = payload.get("predicted_errors", []) or []
        extracted_comments = payload.get("extracted_comments", []) or []

        # PDF bytes
        pdf_bytes = None
        pdf_filename = f"{drawing_no}-{revision_no_int:02d}.pdf"
        try:
            if payload.get("file_bytes_b64"):
                pdf_bytes = base64.b64decode(payload["file_bytes_b64"])
            else:
                file_path = (payload.get("file_path") or "").strip()
                if file_path and os.path.exists(file_path):
                    # Prevent directory traversal attacks (CWE-22 / CWE-23)
                    resolved_path = os.path.realpath(file_path)
                    resolved_upload_folder = os.path.realpath(UPLOAD_FOLDER)
                    if not resolved_path.startswith(resolved_upload_folder + os.path.sep) and resolved_path != resolved_upload_folder:
                        return dbg_fail("pdf-load", "Path traversal detected", extra={"file_path": file_path}, code=400)
                    with open(resolved_path, "rb") as f:
                        pdf_bytes = f.read()
        except Exception as e:
            return dbg_fail("pdf-load", e, extra={"have_b64": bool(payload.get("file_bytes_b64")), "file_path": payload.get("file_path")}, code=400)

        # -------- DB work with NEW SCHEMA --------
        try:
            cursor = g.db.cursor()
        except Exception as e:
            return dbg_fail("cursor", e)

        # Get user IDs from emp_ids
        try:
            cursor.execute("SELECT id FROM users WHERE emp_id = %s", (creator_emp_id,))
            creator_row = cursor.fetchone()
            if not creator_row:
                return dbg_fail("creator-lookup", "Creator not found", extra={"creator_emp_id": creator_emp_id}, code=404)
            creator_id = creator_row[0]

            cursor.execute("SELECT id, name FROM users WHERE emp_id = %s", (reviewer_emp_id,))
            reviewer_row = cursor.fetchone()
            if not reviewer_row:
                return dbg_fail("reviewer-lookup", "Reviewer not found", extra={"reviewer_emp_id": reviewer_emp_id}, code=404)
            reviewer_id = reviewer_row[0]
            reviewer_db_name = reviewer_row[1]
        except Exception as e:
            return dbg_fail("user-lookup", e)

        # 1) Insert or get drawing
        try:
            cursor.execute("SELECT id FROM drawings WHERE drawing_no = %s", (drawing_no,))
            drawing_row = cursor.fetchone()
            
            if not drawing_row:
                # Insert new drawing
                cursor.execute("""
                    INSERT INTO drawings (drawing_no, creator_id, drawing_type, status)
                    VALUES (%s, %s, %s, %s)
                """, (drawing_no, creator_id, drawing_type, 'under_review'))
                drawing_id = cursor.lastrowid
            else:
                drawing_id = drawing_row[0]
                # Update drawing type/creator if needed
                cursor.execute("UPDATE drawings SET drawing_type = %s, creator_id = %s WHERE id = %s", (drawing_type, creator_id, drawing_id))
        except Exception as e:
            return dbg_fail("drawing-upsert", e, extra={"drawing_no": drawing_no})

        # 2) Check for duplicate revision - UPDATE if exists
        revision_id = None
        try:
            cursor.execute("""
                SELECT id FROM drawing_revisions 
                WHERE drawing_id = %s AND revision_no = %s
            """, (drawing_id, revision_no_int))
            rev_row = cursor.fetchone()
            
            if rev_row:
                # Update existing revision
                revision_id = rev_row[0]
                cursor.execute("""
                    UPDATE drawing_revisions
                       SET reviewer_id = %s,
                           reviewed_date = %s,
                           approved = %s,
                           review_comments = %s,
                           task_number = %s
                     WHERE id = %s
                """, (reviewer_id, reviewed_date, approved, 
                      json.dumps(extracted_comments) if extracted_comments else None, 
                      task_number,
                      revision_id))
            else:
                # Insert new revision
                cursor.execute("""
                    INSERT INTO drawing_revisions 
                    (drawing_id, revision_no, reviewer_id, reviewed_date, approved, review_comments, task_number)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (drawing_id, revision_no_int, reviewer_id, reviewed_date, approved, 
                      json.dumps(extracted_comments) if extracted_comments else None,
                      task_number))
                revision_id = cursor.lastrowid
        except Exception as e:
             return dbg_fail("revision-upsert", e, extra={"drawing_id": drawing_id, "rev": revision_no_int})

        # 3) Insert or Update PDF file
        if pdf_bytes:
            try:
                # Check if file exists for this revision
                cursor.execute("SELECT id FROM drawing_files WHERE revision_id=%s", (revision_id,))
                if cursor.fetchone():
                    # Update
                    cursor.execute("""
                        UPDATE drawing_files 
                           SET file_data = %s, uploaded_by = %s, uploaded_at = NOW()
                         WHERE revision_id = %s
                    """, (pdf_bytes, creator_id, revision_id))
                else:
                    # Insert
                    cursor.execute("""
                        INSERT INTO drawing_files 
                        (drawing_id, revision_id, file_data, uploaded_by, uploaded_at)
                        VALUES (%s, %s, %s, %s, NOW())
                    """, (drawing_id, revision_id, pdf_bytes, creator_id))
            except Exception as e:
                return dbg_fail("file-upsert", e, extra={"drawing_id": drawing_id, "revision_id": revision_id})

        # 4) Update error codes (Replace all)
        # First delete existing for this revision
        try:
            cursor.execute("DELETE FROM revision_error_codes WHERE revision_id=%s", (revision_id,))
        except Exception as e:
            return dbg_fail("error-codes-clear", e)

        if error_codes and error_codes != ["No errors detected"]:
            # Deduplicate error codes to prevent 1062 Duplicate entry
            error_codes = list(set(error_codes))
            try:
                for code in error_codes:
                    # Get or create error code
                    cursor.execute("SELECT id FROM error_codes WHERE code = %s", (code,))
                    error_row = cursor.fetchone()
                    
                    if not error_row:
                        cursor.execute("INSERT INTO error_codes (code) VALUES (%s)", (code,))
                        error_code_id = cursor.lastrowid
                    else:
                        error_code_id = error_row[0]
                    
                    # Link error code to revision
                    cursor.execute("""
                        INSERT INTO revision_error_codes (revision_id, error_code_id)
                        VALUES (%s, %s)
                    """, (revision_id, error_code_id))
            except Exception as e:
                return dbg_fail("error-codes-insert", e, extra={"revision_id": revision_id})

        # 5) Update drawing status
        try:
            new_status = 'approved' if approved else 'rejected'
            cursor.execute("""
                UPDATE drawings SET status = %s WHERE id = %s
            """, (new_status, drawing_id))
        except Exception as e:
            return dbg_fail("drawing-status-update", e)

        # 6) Send email notification (Approved/Rejected)
        try:
            cursor.execute("SELECT email, name FROM users WHERE id = %s", (creator_id,))
            creator_row = cursor.fetchone()
            if creator_row:
                creator_email, creator_db_name = creator_row[0], creator_row[1]
                
                # Format names as "EMP_ID - Name"
                formatted_creator_name = f"{creator_emp_id} - {creator_db_name}"
                formatted_reviewer_name = f"{reviewer_emp_id} - {reviewer_db_name}"

                try:
                    send_email(
                        to_email=creator_email,
                        drawing_id=drawing_no,
                        revision_no=revision_no_int,
                        reviewer_name=formatted_reviewer_name,
                        reviewed_date=reviewed_date,
                        error_codes=error_codes,
                        extracted_comments=extracted_comments,
                        decision=decision,
                        drawing_Type=drawing_type,
                        creator_name=formatted_creator_name,
                        pdf_bytes=pdf_bytes,
                        pdf_filename=pdf_filename,
                        file_path=None, # We have bytes, not path
                        user_comments=form_data.get('comments'),
                        task_number=task_number
                    )
                except TypeError as e:
                     print(f"[WARNING] email-send signature mismatch: {e}")
        except Exception as e:
            # Don't fail the whole transaction because of email
            print("[WARNING] email-send failed:", e)

        # Commit all changes
        try:
            g.db.commit()
        except Exception as e:
            return dbg_fail("commit", e)

        return jsonify({"ok": True, "message": "Data saved successfully", "drawing_id": drawing_no, "revision": revision_no_int})

    except Exception as e:
        print("[ERROR] Uncaught in /submit:", e)
        import traceback
        traceback.print_exc()
        return dbg_fail("uncaught", e, code=500)

    
    
def send_email(to_email, drawing_id, revision_no, reviewer_name, reviewed_date, error_codes, extracted_comments, decision, file_path, drawing_Type, creator_name, user_comments=None, pdf_bytes=None, pdf_filename=None, task_number=None):
    try:
        # Set up the SMTP server
        server = get_smtp_server()

        # Email content
        subject = f"Drawing Review Notification :- {drawing_id} (Revision number :- {revision_no})"
        comments_text = '\n \t\t\t\t\t\t'.join(extracted_comments) if extracted_comments else 'No Comments'
        
        # Format user comments
        user_comments_text = f"Additional Comments: {user_comments}" if user_comments else ""

        body = f"""
        Dear {to_email},

        The following drawing review has been completed:

        Drawing ID: {drawing_id}
        Revision No: {revision_no}
        Reviewer: {reviewer_name}
        Date: {reviewed_date}
        Drawing Type: {drawing_Type}
        Task Number: {task_number or 'N/A'}
        
        Errors: {', '.join(error_codes) if error_codes else 'None'}
        Extracted Comments: {comments_text}
        {user_comments_text}
        Decision: {decision.upper()}

        The reviewed document is attached for your reference.

        Portal Link:- https://drawlogai.atlascopco.group

        Best regards,  
        Team Error Logging 
        """

        # Set up the MIME email
        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        # Attach PDF file
        if pdf_bytes and pdf_filename:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(pdf_bytes)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={pdf_filename}")
            msg.attach(part)
        elif file_path and os.path.exists(file_path):
            with open(file_path, "rb") as attachment:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment.read())
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(file_path)}")
                msg.attach(part)

        # Send email
        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()

        print(f"Email sent successfully to {to_email}")

    except Exception as e:
        print(f" Failed to send email: {e}")
        



@app.route('/get-employees', methods=['GET'])
def get_employees():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection not available"}), 500
    
    cursor = g.db.cursor()

    # Query users table instead of employees table
    cursor.execute("SELECT emp_id, name FROM users WHERE is_active = TRUE AND role != 'admin'")
    employees = cursor.fetchall()

    cursor.close()

    # Format response with both fields (using old naming convention)
    employees_list = [
        {"emp_id": emp[0], "emp_name": emp[1]} for emp in employees
    ]

    print("Fetched employees:", employees_list)
    return jsonify(employees_list)  # Correct JSON format


# API to get full details of a selected employee
@app.route('/get-employee/<emp_id>', methods=['GET'])
def get_employee_details(emp_id):
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection not available"}), 500
        
    cursor = g.db.cursor()
    # Query users table with field mapping
    cursor.execute("SELECT pc, division, team, email, name FROM users WHERE emp_id = %s", (emp_id,))
    employee = cursor.fetchone()
    cursor.close()

    if employee:
        return jsonify({
            "emp_PC": employee[0],
            "emp_division": employee[1],
            "emp_team": employee[2],
            "emp_email": employee[3],
            "emp_name": employee[4]
        })

    else:
        return jsonify({})


# API Route for Admin Login
@app.route('/admin-login', methods=['POST'])
def admin_login():
    """
    Simple login:
    - Verifies username + bcrypt(password) against login.password
    - Returns {success:true, status:"OK", access_type:"HR"|"Employee"}
    """
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()

        if not username or not password:
            return jsonify({"success": False, "message": "Username and Password required"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        with g.db.cursor() as cursor:
            cursor.execute("""
                SELECT emp_id, password_hash, role, name
                  FROM users
                 WHERE emp_id = %s
                   AND is_active = TRUE
                 LIMIT 1
            """, (username,))
            row = cursor.fetchone()

        if not row:
            return jsonify({"success": False, "message": "Invalid Credentials"}), 401

        db_username, db_password_hash, role, full_name = row

        import bcrypt
        ok = False
        try:
            ok = bcrypt.checkpw(password.encode('utf-8'), db_password_hash.encode('utf-8'))
        except Exception:
            ok = False

        if not ok:
            return jsonify({"success": False, "message": "Invalid Credentials"}), 401

        # Map role to access_type for backward compatibility
        access_type = "HR" if role == "admin" else "Employee"

        return jsonify({
            "success": True,
            "status": "OK",
            "access_type": access_type,
            "name": full_name or username,
            "message": "Login Successful"
        }), 200

    except Exception as e:
        print("Exception Occurred:", str(e))
        return jsonify({"success": False, "message": "Internal Server Error"}), 500

# Login ends 


# Forget Password
def send_otp_email(to_email: str, emp_id: str, otp_plain: str):
    """
    Reuses your SMTP config to send the OTP.
    """
    try:
        server = get_smtp_server()

        subject = "Your OTP for Password Reset (valid for 5 minutes)"
        body = f"""Dear User ({emp_id}),

Your one-time password (OTP) for resetting your Atlas Copco account password is:

    {otp_plain}

This code will expire in 5 minutes.

If you did not request this, please ignore this email.

        This is a system generated email. Do not reply to this email.

        Portal Link:- https://drawlogai.atlascopco.group

        Regards,
        Atlas Copco AI Error Logging System
        """

        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        print("Failed to send OTP email:", e)


def cleanup_otps(conn):
    """
    On-demand cleanup. Deletes consumed or expired OTPs using MySQL NOW()
    (NOW() is IST because we set the session time_zone after connect).
    """
    with conn.cursor() as c:
        c.execute("DELETE FROM login_otp WHERE consumed=1 OR expires_at <= NOW()")
    conn.commit()
    
    
    
@app.route('/auth/forgot-password/initiate', methods=['POST'])
def forgot_password_initiate():
    """
    Input JSON: { "emp_id": "EMP_123", "email": "user@company.com" }
    Flow:
    - Validate emp_id exists in users
    - Cross-check email in users (case-insensitive)
    - Generate 4-digit OTP, bcrypt-hash it
    - UPSERT into login_otp with expires_at = NOW() + 5 minutes (IST)
    - Email the OTP
    """
    try:
        data = request.get_json(silent=True) or {}
        emp_id = (data.get("emp_id") or "").strip()
        email  = (data.get("email")  or "").strip()

        if not emp_id or not email:
            return jsonify({"success": False, "message": "Emp_ID and Email are required"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        cleanup_otps(g.db)

        # 1) Check user exists in users table and get user_id
        with g.db.cursor() as c:
            c.execute("SELECT id, email FROM users WHERE emp_id=%s AND is_active=TRUE LIMIT 1", (emp_id,))
            user_row = c.fetchone()
            if not user_row:
                return jsonify({"success": False, "message": "Invalid Emp_ID"}), 404
            
            user_id, db_email = user_row[0], user_row[1]

        # 2) Verify email matches
        if not db_email or db_email.strip().lower() != email.lower():
            return jsonify({"success": False, "message": "Email does not match our records"}), 400

        # 3) Generate 4-digit OTP
        otp_int = secrets.randbelow(9000) + 1000  # 1000..9999
        otp_plain = str(otp_int)

        # 4) Hash OTP
        otp_hash = bcrypt.hashpw(otp_plain.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')

        # 5) Upsert OTP row with user_id FK, expire in 5 minutes (use MySQL NOW() in IST)
        with g.db.cursor() as c:
            c.execute("""
                INSERT INTO login_otp (user_id, otp_hash, expires_at, consumed)
                VALUES (%s, %s, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0)
                ON DUPLICATE KEY UPDATE
                    otp_hash = VALUES(otp_hash),
                    expires_at = VALUES(expires_at),
                    consumed = 0
            """, (user_id, otp_hash))
        g.db.commit()

        # 6) Email the OTP
        try:
            send_otp_email(to_email=email, emp_id=emp_id, otp_plain=otp_plain)
        except Exception as mail_err:
            print("OTP email error:", mail_err)
            # Optional: delete OTP row if mail fails

        return jsonify({"success": True, "message": "OTP sent to your registered email."}), 200

    except Exception as e:
        print("Initiate error:", e)
        return jsonify({"success": False, "message": "Internal Server Error"}), 500



@app.route('/auth/forgot-password/verify', methods=['POST'])
def forgot_password_verify():
    """
    Input JSON: { "emp_id": "EMP_123", "otp": "1234" }
    Checks OTP exists, not consumed, not expired (via MySQL NOW()), bcrypt match.
    Does NOT consume here; we consume/delete on password reset success.
    """
    try:
        data = request.get_json(silent=True) or {}
        emp_id = (data.get("emp_id") or "").strip()
        otp_in = (data.get("otp") or "").strip()

        if not emp_id or not otp_in or not otp_in.isdigit() or len(otp_in) != 4:
            return jsonify({"success": False, "message": "Invalid Emp_ID or OTP"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        cleanup_otps(g.db)

        # Fetch active OTP row (not expired) using user_id FK
        with g.db.cursor() as c:
            c.execute("""
                SELECT lo.otp_hash, lo.consumed
                  FROM login_otp lo
                  JOIN users u ON lo.user_id = u.id
                 WHERE u.emp_id=%s
                   AND u.is_active=TRUE
                   AND lo.expires_at > NOW()
                 LIMIT 1
            """, (emp_id,))
            row = c.fetchone()

        if not row:
            # Optional cleanup of expired rows for this user
            with g.db.cursor() as c2:
                c2.execute("""
                    DELETE lo FROM login_otp lo
                    JOIN users u ON lo.user_id = u.id
                    WHERE u.emp_id=%s
                """, (emp_id,))
                g.db.commit()
            return jsonify({"success": False, "message": "OTP expired or not found. Please resend a new OTP."}), 400

        otp_hash, consumed = row
        if consumed:
            return jsonify({"success": False, "message": "OTP already used. Please request a new one."}), 400

        # Verify bcrypt
        if not bcrypt.checkpw(otp_in.encode('utf-8'), otp_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "Invalid OTP"}), 401

        return jsonify({"success": True, "message": "OTP verified"}), 200

    except Exception as e:
        print("Verify error:", e)
        return jsonify({"success": False, "message": "Internal Server Error"}), 500



@app.route('/auth/forgot-password/reset', methods=['POST'])
def forgot_password_reset():
    """
    Input JSON: {
      "emp_id": "EMP_123",
      "otp": "1234",
      "new_password": "...",
      "confirm_password": "..."
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        emp_id = (data.get("emp_id") or "").strip()
        otp_in = (data.get("otp") or "").strip()
        new_password = (data.get("new_password") or "")
        confirm_password = (data.get("confirm_password") or "")

        if not emp_id or not otp_in or not new_password or not confirm_password:
            return jsonify({"success": False, "message": "All fields are required"}), 400
        if new_password != confirm_password:
            return jsonify({"success": False, "message": "Passwords do not match"}), 400
        if not otp_in.isdigit() or len(otp_in) != 4:
            return jsonify({"success": False, "message": "Invalid OTP"}), 400

        # Password policy: at least 1 upper, 1 lower, 1 digit, 1 symbol from !@#$%^&*_+-=?
        policy = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+\-=\?])[A-Za-z\d!@#$%^&*_+\-=\?]{8,64}$')
        if not policy.match(new_password):
            return jsonify({"success": False, "message": "Password must be 8-64 chars with upper, lower, number, and symbol (!@#$%^&*_+-=?)"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        cleanup_otps(g.db)

        # Fetch active OTP row (not expired) using user_id FK
        with g.db.cursor() as c:
            c.execute("""
                SELECT lo.otp_hash, lo.consumed, u.id, u.password_hash
                  FROM login_otp lo
                  JOIN users u ON lo.user_id = u.id
                 WHERE u.emp_id=%s
                   AND u.is_active=TRUE
                   AND lo.expires_at > NOW()
                 LIMIT 1
            """, (emp_id,))
            row = c.fetchone()
        if not row:
            with g.db.cursor() as c2:
                c2.execute("""
                    DELETE lo FROM login_otp lo
                    JOIN users u ON lo.user_id = u.id
                    WHERE u.emp_id=%s
                """, (emp_id,))
                g.db.commit()
            return jsonify({"success": False, "message": "OTP expired or not found. Please resend a new OTP."}), 400

        otp_hash, consumed, user_id, current_hash = row
        if consumed:
            return jsonify({"success": False, "message": "OTP already used. Please request a new one."}), 400

        # Verify OTP
        if not bcrypt.checkpw(otp_in.encode('utf-8'), otp_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "Invalid OTP"}), 401

        # Prevent reusing previous password
        try:
            if current_hash and bcrypt.checkpw(new_password.encode('utf-8'), current_hash.encode('utf-8')):
                return jsonify({"success": False, "message": "New password cannot be the same as the previous password."}), 400
        except Exception:
            pass

        # Get user's email for notification
        with g.db.cursor() as c:
            c.execute("SELECT email FROM users WHERE id=%s LIMIT 1", (user_id,))
            row_email = c.fetchone()
        user_email = row_email[0] if row_email else None

        # Update password in users table and delete OTP
        new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        with g.db.cursor() as c:
            c.execute("UPDATE users SET password_hash=%s WHERE id=%s", (new_hash, user_id))
            c.execute("DELETE FROM login_otp WHERE user_id=%s", (user_id,))
        g.db.commit()

        # Send notification (non-blocking for success path)
        if user_email:
            try:
                send_password_change_notification(user_email, emp_id)
            except Exception as mail_err:
                print("Password change email error:", mail_err)

        return jsonify({"success": True, "message": "Password updated successfully"}), 200

    except Exception as e:
        print("Reset error:", e)
        return jsonify({"success": False, "message": "Internal Server Error"}), 500

    
    
def send_password_change_notification(to_email: str, emp_id: str):
    """
    Notifies the user that their password was changed.
    Does NOT include the password; advises to contact HR if it wasn't them.
    """
    try:
        server = get_smtp_server()

        subject = "Your Atlas Copco AI Error Logging Portal account password was changed"
        body = f"""Dear User ({emp_id}),

This is a confirmation that the password for your Atlas Copco AI Error Logging account was changed successfully.

If you did NOT initiate this change, please contact your HR department immediately.

This is a system generated email. Do not reply to this email.

Portal Link:- https://drawlogai.atlascopco.group

Regards,
Atlas Copco AI Error Logging System
"""

        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        print("Failed to send password change notification:", e)


# Forgot password ends



# Change password

@app.route('/auth/change-password', methods=['POST'])
def change_password():
    """
    Logged-in user password change (no OTP).
    Input JSON: { "emp_id": "EMP_123", "current_password": "...", "new_password": "...", "confirm_password": "..." }
    """
    try:
        data = request.get_json(silent=True) or {}
        emp_id = (data.get("emp_id") or "").strip()
        current_password = (data.get("current_password") or "")
        new_password = (data.get("new_password") or "")
        confirm_password = (data.get("confirm_password") or "")

        if not emp_id or not current_password or not new_password or not confirm_password:
            return jsonify({"success": False, "message": "All fields are required"}), 400
        if new_password != confirm_password:
            return jsonify({"success": False, "message": "Passwords do not match"}), 400

        # Policy: ≥1 lower, ≥1 upper, ≥1 digit, ≥1 symbol from !@#$%^&*_+-=?
        policy = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+\-=\?])[A-Za-z\d!@#$%^&*_+\-=\?]{8,64}$')
        if not policy.match(new_password):
            return jsonify({"success": False, "message": "Password must be 8-64 chars with upper, lower, number, and symbol (!@#$%^&*_+-=?)"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        # Fetch current hash from users table
        with g.db.cursor() as c:
            c.execute("SELECT id, password_hash FROM users WHERE emp_id=%s AND is_active=TRUE LIMIT 1", (emp_id,))
            row = c.fetchone()
        if not row:
            return jsonify({"success": False, "message": "Account not found"}), 404

        user_id, current_hash = row
        # Verify current password
        if not bcrypt.checkpw(current_password.encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "Current password is incorrect"}), 401

        # Prevent reusing the previous password
        if bcrypt.checkpw(new_password.encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "New password cannot be the same as the previous password."}), 400

        # Update to new hash in users table
        new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        with g.db.cursor() as c:
            c.execute("UPDATE users SET password_hash=%s WHERE id=%s", (new_hash, user_id))
        g.db.commit()

        # Email the user (get email from users table)
        with g.db.cursor() as c:
            c.execute("SELECT email FROM users WHERE id=%s LIMIT 1", (user_id,))
            row_email = c.fetchone()
        user_email = row_email[0] if row_email else None
        if user_email:
            try:
                send_password_change_notification(user_email, emp_id)
            except Exception as mail_err:
                print("Password change email error:", mail_err)

        return jsonify({"success": True, "message": "Password updated successfully"}), 200

    except Exception as e:
        print("Change password error:", e)
        return jsonify({"success": False, "message": "Internal Server Error"}), 500


# Change password ends


# Employee page data handling code..........


def send_welcome_credentials_email(to_email: str, emp_id: str):
    """
    Sends initial credentials WITHOUT revealing the user's email in the body.
    Username is EMP_<id>; initial password is 'your registered office email address'.
    """
    try:
        server = get_smtp_server()

        subject = "Welcome to Atlas Copco Error Logging"
        body = f"""Dear User,

Your Atlas Copco AI Error Logging account is ready.

Username: {emp_id}
Initial Password: Use your registered office email address

Please log in to the portal and change your password immediately after logging in.

If you did not expect this account, please contact your administrator.

This is a system generated email. Do not reply to this email.

Portal Link:- https://drawlogai.atlascopco.group

Regards,
Atlas Copco AI Error Logging System
"""

        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        print("Failed to send welcome credentials email:", e)



# Add Employee (creates login + emails credentials)
@app.route('/add-employee', methods=['POST'])
def add_employee():
    cursor = None
    try:
        if not request.is_json:
            return jsonify({"success": False, "message": "Invalid request format. Expected JSON."}), 4001

        data = request.get_json()

        emp_id = data.get("Emp_ID")
        emp_name = data.get("Emp_Name")
        emp_email = data.get("EMP_Email")
        emp_division = data.get("Emp_Division")
        emp_pc = data.get("Emp_PC")
        emp_team = data.get("Emp_Team")

        if any(x is None or str(x).strip() == "" for x in [emp_id, emp_name, emp_email, emp_division, emp_pc, emp_team]):
            return jsonify({"success": False, "message": "All fields are required"}), 4002

        emp_id = "EMP_" + str(emp_id).strip()
        emp_name = str(emp_name).strip()
        emp_email = str(emp_email).strip()
        emp_division = str(emp_division).strip()
        emp_pc = str(emp_pc).strip()
        emp_team = str(emp_team).strip()

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500
        cursor = g.db.cursor()

        # Check if employee already exists in users table
        cursor.execute("SELECT 1 FROM users WHERE emp_id = %s", (emp_id,))
        if cursor.fetchone():
            return jsonify({"success": False, "message": "Employee ID already exists"}), 4003

        # Create password hash from email
        password_hash = bcrypt.hashpw(emp_email.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')

        # Insert into users table (new schema)
        cursor.execute("""
            INSERT INTO users (emp_id, name, email, password_hash, role, division, pc, team, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (emp_id, emp_name, emp_email, password_hash, 'user', emp_division, emp_pc, emp_team, True))

        g.db.commit()  # [SUCCESS] commit DB changes before emailing

        # Send welcome email with username (EMP_<id>) and instructions
        try:
            send_welcome_credentials_email(emp_email, emp_id)
        except Exception as mail_err:
            # Don't fail the API if email sending fails; just log it
            print("Welcome email error:", mail_err)

        return jsonify({"success": True, "message": "Employee added successfully"}), 201

    except Exception as e:
        if hasattr(g, 'db') and g.db:
            try:
                g.db.rollback()
            except:
                pass
        print("Error in add_employee:", e)
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500
    finally:
        if cursor: cursor.close()


@app.route('/health')
def health():
  return jsonify({"status":"ok"})

# Edit Employee API
@app.route('/edit-employee', methods=['POST','PUT'])
def edit_employee():
    data = request.json

    emp_id = data.get("Emp_ID")
    emp_name = data.get("Emp_Name")
    emp_email = data.get("EMP_Email")
    emp_division = data.get("Emp_Division")
    emp_pc = data.get("Emp_PC")
    emp_team = data.get("Emp_Team")
    print("Received data:", data)

    if not all([emp_id, emp_name, emp_email, emp_division, emp_pc, emp_team]):
        return jsonify({"error": "All fields are required!"}), 400

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500
        cursor = g.db.cursor()

        # Ensure Emp_ID exists in users table
        cursor.execute("SELECT * FROM users WHERE emp_id = %s", (emp_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Invalid Employee ID!"}), 400

        # Update employee details in users table
        cursor.execute("""
            UPDATE users
            SET name=%s, email=%s, division=%s, pc=%s, team=%s
            WHERE emp_id=%s
        """, (emp_name, emp_email, emp_division, emp_pc, emp_team, emp_id))

        g.db.commit()
        return jsonify({"success": "Employee details updated successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Delete Employee API

@app.route('/delete-employee/<emp_id>', methods=['DELETE'])
def delete_employee(emp_id):
    cursor = None
    try:
        # Basic whitelist for the employee identifier
        if not re.fullmatch(r'[A-Za-z0-9_]+', emp_id):
            return jsonify({"error": "Invalid employee id"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500
        cursor = g.db.cursor()

        # 1) Clean up OTP records
        cursor.execute("DELETE FROM login_otp WHERE user_id = (SELECT id FROM users WHERE emp_id = %s)", (emp_id,))

        # 2) Soft delete user (set is_active = FALSE) instead of hard delete
        cursor.execute("UPDATE users SET is_active = FALSE WHERE emp_id = %s", (emp_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Employee not found"}), 404

        g.db.commit()
        return jsonify({"success": True, "message": "Employee deleted successfully!"}), 200

    except Exception as e:
        if hasattr(g, 'db') and g.db:
            try:
                g.db.rollback()
            except:
                pass
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()



# Fetch Employees API
@app.route('/fetch-all-employees', methods=['GET'])
def fetch_all_employees():
    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"error": "Database connection not available"}), 500

        cursor = g.db.cursor(pymysql.cursors.DictCursor)
        # Query users table and map fields to match frontend expectations (capitalized names)
        cursor.execute("""
            SELECT emp_id as Emp_ID,
                   name as Emp_Name,
                   email as Emp_Email,
                   division as Emp_Division,
                   pc as Emp_PC,
                   team as Emp_Team
            FROM users WHERE is_active = TRUE
        """)
        employees = cursor.fetchall()
        return jsonify(employees)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Employee page code end..............


@app.route('/api/monthly-drawing-status', methods=['GET'])
def monthly_drawing_status():
    """
    Returns monthly approved/rejected drawing counts.
    Now queries drawing_revisions table instead of EC_MM_YYYY tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        # Extract filters from request
        teams = request.args.getlist('team')
        pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Build query to aggregate from drawing_revisions
        query = """
            SELECT
                DATE_FORMAT(dr.reviewed_date, '%%Y-%%m-01') as month_start,
                SUM(CASE WHEN dr.approved = TRUE THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN dr.approved = FALSE THEN 1 ELSE 0 END) as rejected
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            WHERE dr.reviewed_date IS NOT NULL
        """

        params = []

        # Add date filters
        if start_date and end_date:
            query += " AND dr.reviewed_date >= %s AND dr.reviewed_date <= %s"
            params.extend([start_date, end_date])
        else:
            # Default to last 12 months
            query += " AND dr.reviewed_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)"

        # Add team filter
        if teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND u.team IN ({placeholders})"
            params.extend(teams)

        # Add PC filter: use d.pc for new data; fallback to u.pc LIKE for old drawings (d.pc IS NULL)
        if pcs:
            exact_placeholders = ','.join(['%s'] * len(pcs))
            like_conditions = ' OR '.join(['u.pc LIKE %s'] * len(pcs))
            query += f" AND (d.pc IN ({exact_placeholders}) OR (d.pc IS NULL AND ({like_conditions})))"
            params.extend(pcs)
            params.extend([f"%{p}%" for p in pcs])

        query += " GROUP BY DATE_FORMAT(dr.reviewed_date, '%%Y-%%m-01') ORDER BY month_start"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Format results
        results = {}
        for row in rows:
            month_start, approved, rejected = row
            # Convert to datetime and format as "Apr-2025"
            dt = datetime.strptime(month_start, '%Y-%m-%d')
            label = dt.strftime('%b-%Y')
            results[label] = {
                "approved": approved or 0,
                "rejected": rejected or 0
            }

        return jsonify(results)
    except Exception as e:
        print(f"Error in monthly_drawing_status: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()


# Bar chart code (reports page number 1)
@app.route('/api/monthly-error-report', methods=['GET'])
def monthly_error_report():
    """
    Returns monthly total error counts.
    Now queries revision_error_codes table instead of EC_MM_YYYY tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        selected_teams = request.args.getlist('team')
        selected_pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Build query to aggregate error counts by month
        query = """
            SELECT
                DATE_FORMAT(dr.reviewed_date, '%%m-%%Y') as month,
                COUNT(rec.error_code_id) as total_errors
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            LEFT JOIN revision_error_codes rec ON dr.id = rec.revision_id
            WHERE dr.reviewed_date IS NOT NULL
        """

        params = []

        # Add date filters
        if start_date and end_date:
            query += " AND dr.reviewed_date >= %s AND dr.reviewed_date <= %s"
            params.extend([start_date, end_date])
        else:
            # Default to last 12 months
            query += " AND dr.reviewed_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)"

        # Add team filter
        if selected_teams:
            placeholders = ','.join(['%s'] * len(selected_teams))
            query += f" AND u.team IN ({placeholders})"
            params.extend(selected_teams)

        # Add PC filter: use d.pc for new data; fallback to u.pc LIKE for old drawings (d.pc IS NULL)
        if selected_pcs:
            exact_placeholders = ','.join(['%s'] * len(selected_pcs))
            like_conditions = ' OR '.join(['u.pc LIKE %s'] * len(selected_pcs))
            query += f" AND (d.pc IN ({exact_placeholders}) OR (d.pc IS NULL AND ({like_conditions})))"
            params.extend(selected_pcs)
            params.extend([f"%{p}%" for p in selected_pcs])

        query += " GROUP BY DATE_FORMAT(dr.reviewed_date, '%%m-%%Y') ORDER BY MIN(dr.reviewed_date)"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Format results
        results = []
        for row in rows:
            month, total_errors = row
            results.append({
                "month": month,
                "total_errors": total_errors or 0
            })

        return jsonify(results)

    except Exception as e:
        print(f"Error in monthly_error_report: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Bar chart code (reports page number 2)
from datetime import datetime, timedelta

@app.route('/api/trend-error-report', methods=['GET'])
def trend_error_report():
    """
    Returns top 10 error codes by count.
    Now queries revision_error_codes and error_codes tables instead of EC_MM_YYYY tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        selected_teams = request.args.getlist('team')
        selected_pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        print(f"Filters - Teams: {selected_teams}, PCs: {selected_pcs}, Start Date: {start_date}, End Date: {end_date}")

        # Build query to aggregate error codes
        query = """
            SELECT
                ec.code as error_code,
                COUNT(rec.error_code_id) as count
            FROM revision_error_codes rec
            JOIN error_codes ec ON rec.error_code_id = ec.id
            JOIN drawing_revisions dr ON rec.revision_id = dr.id
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            WHERE dr.reviewed_date IS NOT NULL
        """

        params = []

        # Add date filters
        if start_date and end_date:
            query += " AND dr.reviewed_date >= %s AND dr.reviewed_date <= %s"
            params.extend([start_date, end_date])
        else:
            # Default to last 12 months
            query += " AND dr.reviewed_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)"

        # Add team filter
        if selected_teams:
            placeholders = ','.join(['%s'] * len(selected_teams))
            query += f" AND u.team IN ({placeholders})"
            params.extend(selected_teams)

        # Add PC filter: use d.pc for new data; fallback to u.pc LIKE for old drawings (d.pc IS NULL)
        if selected_pcs:
            exact_placeholders = ','.join(['%s'] * len(selected_pcs))
            like_conditions = ' OR '.join(['u.pc LIKE %s'] * len(selected_pcs))
            query += f" AND (d.pc IN ({exact_placeholders}) OR (d.pc IS NULL AND ({like_conditions})))"
            params.extend(selected_pcs)
            params.extend([f"%{p}%" for p in selected_pcs])

        query += " GROUP BY ec.code ORDER BY count DESC LIMIT 10"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Format results
        results = []
        for row in rows:
            error_code, count = row
            results.append({
                "error_code": error_code,
                "count": count or 0
            })

        return jsonify(results)

    except Exception as e:
        print(f"Error in trend_error_report: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()



# Line chart code (reports page number 2)
@app.route('/api/drawings-trend', methods=['GET'])
def get_drawings_trend():
    """
    Returns drawing trend data for line chart.
    Now queries drawing_revisions table instead of EC_MM_YYYY tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        # Extract filters
        teams = request.args.getlist('team')
        pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()

        # Determine date range
        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            # Default: Last 12 months
            end_dt = datetime.today()
            start_dt = end_dt - timedelta(days=365)

        # Build query to aggregate from drawing_revisions
        query = """
            SELECT
                DATE_FORMAT(dr.reviewed_date, '%%b %%Y') as month_label,
                DATE_FORMAT(dr.reviewed_date, '%%Y-%%m') as month_sort,
                SUM(CASE WHEN dr.approved = TRUE THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN dr.approved = FALSE THEN 1 ELSE 0 END) as rejected
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            WHERE dr.reviewed_date BETWEEN %s AND %s
        """

        params = [start_dt.strftime('%Y-%m-%d'), end_dt.strftime('%Y-%m-%d')]

        # Add team filter
        if teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND u.team IN ({placeholders})"
            params.extend(teams)

        # Add PC filter: use d.pc for new data; fallback to u.pc LIKE for old drawings (d.pc IS NULL)
        if pcs:
            exact_placeholders = ','.join(['%s'] * len(pcs))
            like_conditions = ' OR '.join(['u.pc LIKE %s'] * len(pcs))
            query += f" AND (d.pc IN ({exact_placeholders}) OR (d.pc IS NULL AND ({like_conditions})))"
            params.extend(pcs)
            params.extend([f"%{p}%" for p in pcs])

        query += " GROUP BY DATE_FORMAT(dr.reviewed_date, '%%Y-%%m') ORDER BY month_sort"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Initialize results for line chart format
        trend_data = {
            "categories": [],  # Labels for X-axis (Month-Year)
            "series": [
                {"name": "Approved Drawings", "data": []},
                {"name": "Rejected Drawings", "data": []}
            ]
        }

        for row in rows:
            month_label, month_sort, approved, rejected = row
            trend_data["categories"].append(month_label)
            trend_data["series"][0]["data"].append(approved or 0)
            trend_data["series"][1]["data"].append(rejected or 0)

        return jsonify(trend_data)
    except Exception as e:
        print(f"Error in get_drawings_trend: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Pass Ratio code (reports page number 3)
@app.route('/get-pass-ratio', methods=['POST'])
def get_pass_ratio():
    data = request.json
    team = data.get('team', '')
    pc = data.get('pc', '')
    start_date = data.get('start_date', '')
    end_date = data.get('end_date', '')

    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()

    try:
        # 1. Determine Date Range
        if start_date and end_date:
            s_dt = datetime.strptime(start_date, "%Y-%m-%d")
            e_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            # Default to current year
            today = datetime.today()
            s_dt = datetime(today.year, 1, 1)
            e_dt = datetime(today.year, 12, 31)

        # 2. Init result map for every month in range
        month_abbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        months_map = {}

        curr = s_dt
        # Iterate month by month until end_date
        while curr <= e_dt:
            # key format "MM_YYYY"
            key = f"{curr.month:02d}_{curr.year}"
            months_map[key] = {
                "year": str(curr.year),
                "month": month_abbr[curr.month - 1],
                "accepted_drawings": 0,
                "total_drawings": 0,
                "pass_ratio": 0
            }
            # Move to next month
            # (simple way: add 32 days and set to day 1)
            next_month = curr + timedelta(days=32)
            curr = next_month.replace(day=1)

        # 3. Query Database
        query = """
            SELECT
                DATE_FORMAT(dr.reviewed_date, '%%m_%%Y') as month_key,
                SUM(CASE WHEN dr.approved = TRUE THEN 1 ELSE 0 END) as accepted,
                COUNT(dr.id) as total
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            WHERE dr.reviewed_date BETWEEN %s AND %s
        """
        params = [s_dt.strftime('%Y-%m-%d'), e_dt.strftime('%Y-%m-%d')]

        # Handle Team (list)
        if team:
            if isinstance(team, str):
                teams_list = [team]
            elif isinstance(team, list):
                teams_list = team
            else:
                teams_list = []
            
            if teams_list:
                placeholders = ','.join(['%s'] * len(teams_list))
                query += f" AND u.team IN ({placeholders})"
                params.extend(teams_list)

        # Handle PC (list)
        if pc:
            if isinstance(pc, str):
                pcs_list = [pc]
            elif isinstance(pc, list):
                pcs_list = pc
            else:
                pcs_list = []

            # Add PC filter: use d.pc for new data; fallback to u.pc LIKE for old drawings (d.pc IS NULL)
            if pcs_list:
                exact_placeholders = ','.join(['%s'] * len(pcs_list))
                like_conditions = ' OR '.join(['u.pc LIKE %s'] * len(pcs_list))
                query += f" AND (d.pc IN ({exact_placeholders}) OR (d.pc IS NULL AND ({like_conditions})))"
                params.extend(pcs_list)
                params.extend([f"%{p}%" for p in pcs_list])

        query += " GROUP BY month_key"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()


        # 4. Fill Map
        for row in rows:
            m_key, accepted, total = row
            if m_key in months_map:
                ratio = round((accepted / total) * 100, 2) if total > 0 else 0
                months_map[m_key]["accepted_drawings"] = int(accepted)
                months_map[m_key]["total_drawings"] = int(total)
                months_map[m_key]["pass_ratio"] = f"{ratio}%"

        pass_ratio_data = list(months_map.values())
        return jsonify(pass_ratio_data)

    except Exception as e:
        print(f"Error in get_pass_ratio: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()


# Employee report code(reports page number 4)
def _parse_error_codes(val):
    if not val:
        return []
    s = str(val).strip()
    # JSON or Python list-like → parse
    if s.startswith('[') and s.endswith(']'):
        try:
            return json.loads(s)
        except Exception:
            try:
                # Cleanly extract list items without using AST execution (CWE-94)
                inner_content = s[1:-1].strip()
                if not inner_content:
                    return []
                return [item.strip().strip("'\"") for item in inner_content.split(',') if item.strip()]
            except Exception:
                pass
    # Fallback: comma-separated string "P1,P22"
    return [p.strip() for p in s.split(',') if p.strip()]



# Drawing report code(reports page number 5)
@app.route('/api/drawing-report', methods=['GET'])
def drawing_report():
    drawing_id = (request.args.get('drawingId') or '').strip()
    teams = request.args.getlist('team')
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()

    if not drawing_id and not teams:
        return jsonify({"error": "Drawing ID or Team is required"}), 400

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500

        cursor = g.db.cursor()

        # Build query using normalized schema
        # We need: Drawing_ID, Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Date, Drawing_type, Decision, Error_codes
        query = """
            SELECT
                d.drawing_no as Drawing_ID,
                dr.revision_no as Revision_num,
                u_rev.emp_id as Reviewer_EMP_ID,
                u_cre.emp_id as Creator_EMP_ID,
                dr.reviewed_date as Date,
                d.drawing_type as Drawing_type,
                CASE WHEN dr.approved = TRUE THEN 'Approve' ELSE 'Reject' END as Decision,
                GROUP_CONCAT(ec.code SEPARATOR ', ') as Error_codes
            FROM drawings d
            JOIN drawing_revisions dr ON d.id = dr.drawing_id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            LEFT JOIN revision_error_codes rec ON dr.id = rec.revision_id
            LEFT JOIN error_codes ec ON rec.error_code_id = ec.id
            WHERE 1=1
        """

        params = []

        if drawing_id:
            query += " AND d.drawing_no = %s"
            params.append(drawing_id)
        elif teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND u_cre.team IN ({placeholders})"
            params.extend(teams)

        if start_date:
            query += " AND dr.reviewed_date >= %s"
            params.append(start_date)
        if end_date:
            query += " AND dr.reviewed_date <= %s"
            params.append(end_date)

        query += " GROUP BY dr.id ORDER BY dr.reviewed_date DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]

        result = []
        for tup in rows:
            row = dict(zip(cols, tup))
            row["Error_codes"] = _parse_error_codes(row.get("Error_codes"))
            result.append(row)

        return jsonify(result)

    except Exception as e:
        print(f"Error in drawing_report: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/task-report', methods=['GET'])
def task_report():
    """
    Returns a list of tasks (drawings/revisions) filtered by Date and optionally Team.
    Used for the Task Report table.
    """
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()
    task_number = (request.args.get('task_number') or '').strip()
    teams      = request.args.getlist('team')

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500

        cursor = g.db.cursor()

        # Build query using normalized schema
        query = """
            SELECT
                u_cre.team as Team,
                dr.task_number as Task_Number,
                d.drawing_no as Drawing_ID,
                dr.revision_no as Revision_num,
                u_cre.emp_id as Creator_EMP_ID,
                u_rev.emp_id as Reviewer_EMP_ID,
                dr.reviewed_date as Date,
                CASE WHEN dr.approved = TRUE THEN 'Approve' ELSE 'Reject' END as Decision,
                GROUP_CONCAT(ec.code SEPARATOR ', ') as Error_codes
            FROM drawings d
            JOIN drawing_revisions dr ON d.id = dr.drawing_id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            LEFT JOIN revision_error_codes rec ON dr.id = rec.revision_id
            LEFT JOIN error_codes ec ON rec.error_code_id = ec.id
            WHERE dr.task_number IS NOT NULL AND dr.task_number != ''
        """

        params = []

        if start_date:
            query += " AND DATE(dr.reviewed_date) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(dr.reviewed_date) <= %s"
            params.append(end_date)
        if task_number:
            query += " AND dr.task_number LIKE %s"
            params.append(f"%{task_number}%")
        if teams:
            format_strings = ','.join(['%s'] * len(teams))
            query += f" AND u_cre.team IN ({format_strings})"
            params.extend(teams)

        query += " GROUP BY dr.id ORDER BY dr.reviewed_date DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]

        result = []
        for tup in rows:
            row = dict(zip(cols, tup))
            row["Error_codes"] = _parse_error_codes(row.get("Error_codes"))
            result.append(row)

        return jsonify(result)

    except Exception as e:
        print(f"Error in task_report: {e}")
        return jsonify({"error": str(e)}), 500



@app.route('/api/employee-report', methods=['GET'])
def employee_report():
    """
    Returns list of drawings/revisions for a specific employee (creator) or a team.
    Used for the Employee Report table and metrics (Accepted/Rejected counts).
    """
    employee_id = (request.args.get('employeeId') or '').strip()
    teams = request.args.getlist('team')
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()

    if not employee_id and not teams:
        return jsonify({"error": "Employee ID or Team is required"}), 400

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500

        cursor = g.db.cursor()

        # Build query using joined reviewer details for reviewer performance report
        query = """
            SELECT
                d.drawing_no as Drawing_ID,
                dr.revision_no as Revision_num,
                u_rev.emp_id as Reviewer_EMP_ID,
                COALESCE(dr.reviewed_date, dr.created_at) as Date,
                CASE WHEN dr.reviewed_date IS NULL THEN 'Pending'
                     WHEN dr.approved = TRUE THEN 'Approve'
                     ELSE 'Reject' END as Decision,
                GROUP_CONCAT(ec.code SEPARATOR ', ') as Error_codes,
                dr.task_number as Task_Number,
                d.pc as drawing_pc,
                COALESCE(u_rev.name, u_cre.name) as Employee_name,
                COALESCE(u_rev.pc, u_cre.pc) as user_pc,
                COALESCE(u_rev.division, u_cre.division) as Division,
                u_cre.emp_id as Creator_EMP_ID
            FROM drawings d
            JOIN drawing_revisions dr ON d.id = dr.drawing_id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            LEFT JOIN revision_error_codes rec ON dr.id = rec.revision_id
            LEFT JOIN error_codes ec ON rec.error_code_id = ec.id
            WHERE 1=1
        """
        params = []

        if employee_id:
            query += " AND u_rev.emp_id = %s"
            params.append(employee_id)
        elif teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND u_rev.team IN ({placeholders})"
            params.extend(teams)

        if start_date:
            query += " AND DATE(COALESCE(dr.reviewed_date, dr.created_at)) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(COALESCE(dr.reviewed_date, dr.created_at)) <= %s"
            params.append(end_date)

        query += " GROUP BY dr.id, d.pc, u_cre.id, u_rev.id ORDER BY COALESCE(dr.reviewed_date, dr.created_at) DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]

        result = []
        for tup in rows:
            row = dict(zip(cols, tup))
            row["Error_codes"] = _parse_error_codes(row.get("Error_codes"))
            # Use the drawing-specific PC if available, otherwise fallback to the user's default PC
            drawing_pc_val = row.pop("drawing_pc", None)
            user_pc_val = row.pop("user_pc", None)
            row["PC"] = drawing_pc_val if drawing_pc_val else user_pc_val
            result.append(row)

        return jsonify(result)

    except Exception as e:
        print(f"Error in employee_report: {e}")
        return jsonify({"error": str(e)}), 500



# Down button for employee and drawing report pages
@app.route('/api/drawings/<drawing_id>/<int:revision>/download', methods=['GET'])
def download_drawing(drawing_id, revision):
    """
    Returns the PDF blob from drawing_files table for the given drawing and revision.
    Now queries drawing_files table instead of per-drawing tables.
    """
    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500

        with g.db.cursor() as cur:
            # Query drawing_files table
            cur.execute("""
                SELECT df.file_data
                FROM drawing_files df
                JOIN drawing_revisions dr ON df.revision_id = dr.id
                JOIN drawings d ON dr.drawing_id = d.id
                WHERE d.drawing_no = %s AND dr.revision_no = %s
                ORDER BY df.uploaded_at DESC
                LIMIT 1
            """, (drawing_id, revision))
            row = cur.fetchone()

        if not row:
            return jsonify({"error": "Drawing/revision not found"}), 404

        pdf_bytes = row[0]
        if not pdf_bytes:
            return jsonify({"error": "No PDF stored for this revision"}), 404

        # Serve file
        fname = f"{drawing_id}-{str(revision).zfill(2)}.pdf"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=fname
        )

    except pymysql.MySQLError as e:
        print(f"Error in download_drawing: {e}")
        return jsonify({"error": str(e)}), 500

# Get dropdown data for employees in report page
@app.route('/api/employees-dropdown', methods=['GET'])
def get_employee_ids():
    """
    Returns list of employee IDs for dropdown, optionally filtered by team.
    Now queries users table instead of employees table.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection error"}), 500

    cursor = g.db.cursor()

    try:
        teams = request.args.getlist('team')
        query = "SELECT emp_id, name FROM users WHERE is_active = TRUE AND role != 'admin'"
        params = []
        if teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND team IN ({placeholders})"
            params.extend(teams)
        query += " ORDER BY emp_id;"

        cursor.execute(query, tuple(params))
        employees = [
            f"{row[0]} - {row[1]}" if row[1] else row[0]
            for row in cursor.fetchall()
        ]
        return jsonify(employees)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Get dropdown data for drawings in report page
@app.route('/api/drawings-dropdown', methods=['GET'])
def get_drawing_ids():
    """
    Returns list of drawing IDs for dropdown.
    Queries drawings table joined with drawing_revisions and users, filtered by date and team.
    """
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()
    teams      = request.args.getlist('team')

    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection error"}), 500

    cursor = g.db.cursor()

    try:
        query = """
            SELECT DISTINCT d.drawing_no 
            FROM drawings d
        """
        
        # Only join if we need to filter by date or team
        if start_date or end_date or teams:
            query += """
                JOIN drawing_revisions dr ON d.id = dr.drawing_id
                JOIN users u_cre ON d.creator_id = u_cre.id
                WHERE 1=1
            """
        else:
            query += " WHERE 1=1 "
            
        params = []

        if start_date:
            query += " AND DATE(dr.reviewed_date) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(dr.reviewed_date) <= %s"
            params.append(end_date)
        if teams:
            format_strings = ','.join(['%s'] * len(teams))
            query += f" AND u_cre.team IN ({format_strings})"
            params.extend(teams)

        query += " ORDER BY d.drawing_no;"

        cursor.execute(query, tuple(params))
        drawings = [row[0] for row in cursor.fetchall()]
        return jsonify(drawings)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Get dropdown data for task numbers in report page
@app.route('/api/tasks-dropdown', methods=['GET'])
def get_task_numbers():
    """
    Returns list of unique task numbers for dropdown.
    Queries drawing_revisions table filtered by date and team.
    """
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()
    teams      = request.args.getlist('team')

    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection error"}), 500

    cursor = g.db.cursor()

    try:
        query = """
            SELECT DISTINCT dr.task_number 
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u_cre ON d.creator_id = u_cre.id
            WHERE dr.task_number IS NOT NULL AND dr.task_number != ''
        """
        params = []

        if start_date:
            query += " AND DATE(dr.reviewed_date) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(dr.reviewed_date) <= %s"
            params.append(end_date)
        if teams:
            format_strings = ','.join(['%s'] * len(teams))
            query += f" AND u_cre.team IN ({format_strings})"
            params.extend(teams)

        query += " ORDER BY dr.task_number;"

        cursor.execute(query, tuple(params))
        tasks = [row[0] for row in cursor.fetchall()]
        return jsonify(tasks)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

@app.route('/api/task-summary', methods=['GET'])
def task_summary():
    """
    Returns task counts grouped by Team, filtered by Date and Team.
    Used for the Task Report pie chart.
    """
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()
    teams      = request.args.getlist('team')

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500

        cursor = g.db.cursor()

        # Build query
        query = """
            SELECT u_cre.team, COUNT(dr.id) as count
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u_cre ON d.creator_id = u_cre.id
            WHERE dr.task_number IS NOT NULL AND dr.task_number != ''
        """
        params = []

        if start_date:
            query += " AND DATE(dr.reviewed_date) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(dr.reviewed_date) <= %s"
            params.append(end_date)
        if teams:
            format_strings = ','.join(['%s'] * len(teams))
            query += f" AND u_cre.team IN ({format_strings})"
            params.extend(teams)

        query += " GROUP BY u_cre.team ORDER BY count DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        
        result = [{"team": row[0], "count": row[1]} for row in rows]
        return jsonify(result)
    except Exception as e:
        print(f"Error in task_summary: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

@app.route('/api/overview-dashboard', methods=['GET'])
def overview_dashboard():
    """
    Returns a consolidated JSON for the Overview Dashboard.
    Includes KPIs, Team distribution, Status breakdown, Monthly Trend, Auditor Ranking, and Recent Feed.
    """
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()
    teams = request.args.getlist('team')

    try:
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500
        cursor = g.db.cursor(pymysql.cursors.DictCursor)

        # 1. KPIs & Status Distribution
        # We'll fetch status, auditor, team, and date for all relevant revisions in the range
        where_clause = "WHERE dr.task_number IS NOT NULL AND dr.task_number != ''"
        where_params = []
        if start_date:
            where_clause += " AND DATE(dr.reviewed_date) >= %s"
            where_params.append(start_date)
        if end_date:
            where_clause += " AND DATE(dr.reviewed_date) <= %s"
            where_params.append(end_date)
        if teams:
            placeholders = ', '.join(['%s'] * len(teams))
            where_clause += f" AND u_cre.team IN ({placeholders})"
            where_params.extend(teams)

        # 1. Unique Drawings Count (SQL Aggregation)
        query_unique = f"""
            SELECT COUNT(DISTINCT d.drawing_no) as unique_drawings
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            {where_clause}
        """
        cursor.execute(query_unique, tuple(where_params))
        unique_row = cursor.fetchone()
        unique_drawings = int(unique_row['unique_drawings']) if (unique_row and unique_row['unique_drawings'] is not None) else 0

        # 2. KPIs & Status Distribution Query
        query_all = f"""
            SELECT 
                dr.id, 
                dr.approved, 
                u_cre.team, 
                u_rev.name as auditor_name,
                dr.reviewed_date as audit_date
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            {where_clause}
        """
        cursor.execute(query_all, tuple(where_params))
        all_data = cursor.fetchall()

        total_audits = len(all_data)
        approved_count = sum(1 for r in all_data if r['approved'])
        pass_ratio = (approved_count / total_audits * 100) if total_audits > 0 else 0

        # Status distribution - mapping 'approved' boolean to labels
        # Assuming for now 'approved'=True is 'Correct', 'approved'=False is 'Wrong'
        # If there's an 'In Progress' status, we'd need another column. 
        # For now let's use Decision as status.
        status_map = {"Correct": 0, "Wrong": 0, "In Progress": 0}
        for r in all_data:
            label = "Correct" if r['approved'] else "Wrong"
            status_map[label] += 1
        
        status_distribution = [{"status": k, "count": v} for k, v in status_map.items()]

        # 2. Team Distribution (Treemap)
        team_map = {}
        for r in all_data:
            t = r['team'] or 'Unknown'
            if t not in team_map:
                team_map[t] = {"accept": 0, "reject": 0}
            if r['approved']:
                team_map[t]["accept"] += 1
            else:
                team_map[t]["reject"] += 1
        team_distribution = [
            {
                "team": k,
                "accept": v["accept"],
                "reject": v["reject"],
                "count": v["accept"] + v["reject"]
            }
            for k, v in team_map.items()
        ]

        # 3. Auditor Leaderboard
        auditor_map = {}
        for r in all_data:
            a = r['auditor_name'] or 'Unknown'
            auditor_map[a] = auditor_map.get(a, 0) + 1
        auditor_leaderboard = sorted([{"name": k, "count": v} for k, v in auditor_map.items()], key=lambda x: x['count'], reverse=True)[:10]

        # 4. Monthly Trend
        # Group by Month-Year
        month_map = {}
        for r in all_data:
            if r['audit_date']:
                m_key = r['audit_date'].strftime('%b') # Jan, Feb ...
                # We also need indexing for sort
                m_idx = r['audit_date'].month
                if m_key not in month_map:
                    month_map[m_key] = {"month": m_key, "total": 0, "approved": 0, "sort_idx": m_idx}
                month_map[m_key]["total"] += 1
                if r['approved']: month_map[m_key]["approved"] += 1
        
        monthly_trend = sorted(month_map.values(), key=lambda x: x['sort_idx'])
        for m in monthly_trend:
            m['pass_ratio'] = (m['approved'] / m['total'] * 100) if m['total'] > 0 else 0

        # 5. Recent Audit Feed
        query_recent = f"""
            SELECT 
                dr.task_number as task_no,
                d.drawing_no as task_name,
                u_rev.name as auditor_name,
                CASE WHEN dr.approved = TRUE THEN 'Correct' ELSE 'Wrong' END as decision
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u_cre ON d.creator_id = u_cre.id
            LEFT JOIN users u_rev ON dr.reviewer_id = u_rev.id
            {where_clause}
            ORDER BY dr.reviewed_date DESC
            LIMIT 10
        """
        cursor.execute(query_recent, tuple(where_params))
        recent_audits = cursor.fetchall()

        # Total Users count
        user_where = ["is_active = TRUE", "role != 'admin'"]
        user_params = []
        if teams:
            user_where.append(f"team IN ({', '.join(['%s']*len(teams))})")
            user_params.extend(teams)
        user_where_clause = "WHERE " + " AND ".join(user_where)
        cursor.execute(f"SELECT COUNT(id) as total_users FROM users {user_where_clause}", tuple(user_params))
        total_users_row = cursor.fetchone()
        total_users = int(total_users_row['total_users']) if (total_users_row and total_users_row['total_users'] is not None) else 0

        return jsonify({
            "kpis": {
                "totalAudits": total_audits,
                "uniqueDrawings": unique_drawings,
                "passRatio": round(pass_ratio, 1),
                "totalUsers": total_users,
                "pendingReviews": 0 # Placeholder if no specific column
            },
            "statusDistribution": status_distribution,
            "teamDistribution": team_distribution,
            "auditorLeaderboard": auditor_leaderboard,
            "monthlyTrend": monthly_trend,
            "recentAudits": recent_audits
        })

    except Exception as e:
        print(f"Error in overview_dashboard: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Employee reports page column charts(reports page number 4)
# /api/employee-drawing-status — use `Date` column (and case-insensitive Decision)
@app.route('/api/employee-drawing-status', methods=['GET'])
def employee_drawing_status():
    """
    Returns monthly approved/rejected counts for a specific employee or team.
    Now queries drawing_revisions table instead of per-employee tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    cursor = g.db.cursor()
    try:
        employee_id = request.args.get('employeeId')
        teams = request.args.getlist('team')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if not employee_id and not teams:
            return jsonify({'error': 'Missing employeeId or team'}), 400

        # Set date range
        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            # Default range: last ~6 months
            end_dt = datetime.today()
            start_month = max(1, end_dt.month - 5)
            start_dt = end_dt.replace(month=start_month)

        # Query drawing_revisions for this employee or team
        query = """
            SELECT
                DATE_FORMAT(dr.reviewed_date, '%%m-%%Y') as month,
                SUM(CASE WHEN dr.approved = TRUE THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN dr.approved = FALSE THEN 1 ELSE 0 END) as rejected_count
            FROM drawing_revisions dr
            JOIN drawings d ON dr.drawing_id = d.id
            JOIN users u ON d.creator_id = u.id
            WHERE 1=1
        """
        params = []
        if employee_id:
            query += " AND u.emp_id = %s"
            params.append(employee_id)
        elif teams:
            placeholders = ','.join(['%s'] * len(teams))
            query += f" AND u.team IN ({placeholders})"
            params.extend(teams)

        query += """
            AND dr.reviewed_date >= %s
            AND dr.reviewed_date <= %s
            GROUP BY month
            ORDER BY MIN(dr.reviewed_date)
        """
        params.extend([start_dt, end_dt])

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        results = {}
        for row in rows:
            month = row[0] # "MM-YYYY"
            approved = row[1]
            rejected = row[2]

            # Format key as EC_MM_YYYY
            key = f"EC_{month.replace('-', '_')}"
            results[key] = {
                "approve": int(approved or 0),
                "reject": int(rejected or 0)
            }

        return jsonify(results)
    except Exception as e:
        print(f"Error in employee_drawing_status: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()


# Error codes in employees and drawings(Reports page number 4 and 5)
@app.route('/api/error-summary', methods=['GET'])
def error_summary():
    """
    Returns top error codes for an employee, drawing, or team.
    Now queries revision_error_codes table instead of per-employee/drawing tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        employee_id = request.args.get('employeeId')
        drawing_id = request.args.get('drawingId')
        teams = request.args.getlist('team')
        report_type = request.args.get('reportType')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        limit = 10
        if report_type == 'drawingReport' or drawing_id:
            limit = 5

        if employee_id:
            # Get user_id from emp_id
            cursor.execute("SELECT id FROM users WHERE emp_id = %s AND is_active = TRUE", (employee_id,))
            user_row = cursor.fetchone()
            if not user_row:
                return jsonify([]), 200

            user_id = user_row[0]

            # Query for employee's error codes
            query = """
                SELECT ec.code, COUNT(rec.error_code_id) as count
                FROM revision_error_codes rec
                JOIN error_codes ec ON rec.error_code_id = ec.id
                JOIN drawing_revisions dr ON rec.revision_id = dr.id
                JOIN drawings d ON dr.drawing_id = d.id
                WHERE d.creator_id = %s
            """
            params = [user_id]

        elif drawing_id:
            # Query for drawing's error codes
            query = """
                SELECT ec.code, COUNT(rec.error_code_id) as count
                FROM revision_error_codes rec
                JOIN error_codes ec ON rec.error_code_id = ec.id
                JOIN drawing_revisions dr ON rec.revision_id = dr.id
                JOIN drawings d ON dr.drawing_id = d.id
                WHERE d.drawing_no = %s
            """
            params = [drawing_id]

        elif teams:
            # Query for team's error codes (can be for employee report or drawing report)
            query = """
                SELECT ec.code, COUNT(rec.error_code_id) as count
                FROM revision_error_codes rec
                JOIN error_codes ec ON rec.error_code_id = ec.id
                JOIN drawing_revisions dr ON rec.revision_id = dr.id
                JOIN drawings d ON dr.drawing_id = d.id
                JOIN users u_cre ON d.creator_id = u_cre.id
                WHERE u_cre.team IN ({})
            """
            placeholders = ','.join(['%s'] * len(teams))
            query = query.format(placeholders)
            params = list(teams)
        else:
            return jsonify({"error": "Missing employeeId, drawingId, or team"}), 400

        # Add date filters
        if start_date and end_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                query += " AND dr.reviewed_date BETWEEN %s AND %s"
                params.extend([start_dt.strftime('%Y-%m-%d'), end_dt.strftime('%Y-%m-%d')])
            except ValueError:
                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        query += f" GROUP BY ec.code ORDER BY count DESC LIMIT {limit}"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Format results
        results = [{"error_code": row[0], "count": row[1]} for row in rows]
        return jsonify(results)

    except Exception as e:
        print(f"Error in error_summary: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()



# Submission page start .............
def extract_drawing_id_from_name(filename: str, allow_special_case: bool = False) -> str | None:
    """
    Accept any PDF whose name starts with exactly 10 digits.
    '7058609753-01.pdf'    -> 'DR_7058609753'
    '7058609753.pdf'       -> 'DR_7058609753'
    '7058609753 desc.pdf'  -> 'DR_7058609753'
    'SomeName.pdf'         -> None  (does NOT start with 10 digits, unless allow_special_case is True)
    """
    if not filename:
        return None
    # Strip directory components and extension
    base = filename.rsplit('/', 1)[-1]
    base = base.rsplit('\\', 1)[-1]  # Windows paths too
    base = base.rsplit('.', 1)[0]    # remove .pdf
    
    if allow_special_case:
        if base.startswith("DR_"):
            return base
        return f"DR_{base}"

    # First 10 chars must ALL be digits
    if len(base) < 10 or not base[:10].isdigit():
        return None
    return f"DR_{base[:10]}"


def extract_revision_from_name(filename: str) -> int | None:
    """
    Optionally extract a revision suffix from filename.
    '9096998745-1.pdf'  -> 1
    '9096998745-01.pdf' -> 1
    '9096998745.pdf'    -> None  (no revision — that is OK now)
    """
    if not filename:
        return None
    base = filename.rsplit('/', 1)[-1]
    base = base.rsplit('\\', 1)[-1]
    base = base.rsplit('.', 1)[0]
    # Drawing number is first 10 digits; look for '-N' after position 10
    remainder = base[10:]  # everything after the 10-digit drawing number
    if not remainder.startswith('-'):
        return None
    try:
        return int(remainder[1:])
    except (ValueError, IndexError):
        return None

def send_single_summary_email(to_email: str, items: list[tuple[str, int]], creator_emp_id: str, creator_name: str, user_comments: str = None, task_number: str = None):
    """
    items: list of (drawing_id, revision)
    """
    try:
        server = get_smtp_server()

        subject = "Drawings ready for review"
        pairs_str = ', '.join([f"{did} - {rev}" for did, rev in items])
        
        # Format user comments
        user_comments_text = f"\nAdditional Comments: {user_comments}\n" if user_comments else ""
        
        body = f"""Dear Reviewer,

Multiple drawings have been submitted for your review.

Creator EMP_ID: {creator_emp_id}
Creator Name  : {creator_name}
Task Number   : {task_number or 'N/A'}

Drawing_ID - Revision Number:
{pairs_str}
{user_comments_text}
Please log in to the portal to review the submissions.

Portal Link:- https://drawlogai.atlascopco.group

Regards,
Atlas Copco AI Error Logging System
"""

        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        print("Failed to send reviewer summary email:", e)

@app.route('/submit-batch', methods=['POST'])
def submit_batch():
    """
    Batch submission endpoint — single pass, no user interaction required.
    - Any PDF whose name starts with 10 digits is a valid drawing.
    - Fresh drawings (not in DB) -> revision_no = 1.
    - Duplicate drawings (already in DB) -> new revision = MAX+1 (auto-increment).
    Returns results with type='new'|'updated' and previous_revision for display.
    """
    try:
        print(f"\n{'='*80}")
        print(f">>> INCOMING REQUEST: POST /submit-batch")

        files = request.files.getlist('pdfs')
        print(f"    Files received: {len(files)}")
        for i, f in enumerate(files):
            print(f"    - File {i+1}: {f.filename}")

        if not files:
            return jsonify({"success": False, "message": "At least one PDF is required"}), 400

        creator_emp_id = (request.form.get('creator_emp_id') or '').strip()
        reviewer_emp_id = (request.form.get('reviewer_emp_id') or '').strip()
        reviewer_email  = (request.form.get('reviewer_email')  or '').strip()

        if not creator_emp_id or not reviewer_emp_id or not reviewer_email:
            return jsonify({"success": False,
                            "message": "creator_emp_id, reviewer_emp_id and reviewer_email are required"}), 400

        pc           = (request.form.get('pc') or '').strip()
        drawing_type = (request.form.get('drawing_type') or '').strip()
        task_number  = (request.form.get('task_number') or '').strip()
        comments     = (request.form.get('comments') or '').strip()
        allow_special_case = (request.form.get('allow_special_case') == 'true')

        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        # results: {drawing_id, revision, previous_revision, type:'new'|'updated'}
        results  = []
        rejected = []  # filenames that don't start with 10 digits
        today    = datetime.today()

        try:
            with g.db.cursor() as c:
                c.execute("SELECT id, name FROM users WHERE emp_id = %s AND is_active = TRUE", (creator_emp_id,))
                creator_row = c.fetchone()
                if not creator_row:
                    return jsonify({"success": False, "message": f"Creator {creator_emp_id} not found"}), 400
                creator_id, creator_db_name = creator_row[0], creator_row[1]

                c.execute("SELECT id FROM users WHERE emp_id = %s AND is_active = TRUE", (reviewer_emp_id,))
                reviewer_row = c.fetchone()
                if not reviewer_row:
                    return jsonify({"success": False, "message": f"Reviewer {reviewer_emp_id} not found"}), 400
                reviewer_id = reviewer_row[0]

                for f in files:
                    if not f or not f.filename.lower().endswith('.pdf'):
                        continue

                    drawing_no = extract_drawing_id_from_name(f.filename, allow_special_case)
                    if not drawing_no:
                        rejected.append(f.filename)
                        print(f"    REJECTED (bad name): {f.filename}")
                        continue

                    print(f"    Processing: {f.filename} -> drawing_no={drawing_no}")
                    pdf_bytes = f.read()

                    c.execute("SELECT id FROM drawings WHERE drawing_no = %s", (drawing_no,))
                    drawing_row = c.fetchone()

                    if drawing_row:
                        drawing_db_id = drawing_row[0]

                        # Update PC and drawing_type for this submission
                        c.execute(
                            "UPDATE drawings SET pc = %s, drawing_type = %s WHERE id = %s",
                            (pc, drawing_type, drawing_db_id)
                        )

                        # Duplicate: auto-increment revision
                        c.execute(
                            "SELECT MAX(revision_no) FROM drawing_revisions WHERE drawing_id = %s",
                            (drawing_db_id,)
                        )
                        max_rev_row = c.fetchone()
                        current_max = max_rev_row[0] if max_rev_row and max_rev_row[0] is not None else 0
                        next_revision = current_max + 1

                        c.execute(
                            "INSERT INTO drawing_revisions "
                            "(drawing_id, revision_no, reviewer_id, created_at, task_number) "
                            "VALUES (%s, %s, %s, %s, %s)",
                            (drawing_db_id, next_revision, reviewer_id, today, task_number)
                        )
                        revision_db_id = c.lastrowid
                        c.execute(
                            "INSERT INTO drawing_files "
                            "(drawing_id, revision_id, file_data, uploaded_by, uploaded_at) "
                            "VALUES (%s, %s, %s, %s, %s)",
                            (drawing_db_id, revision_db_id, pdf_bytes, creator_id, today)
                        )
                        results.append({
                            "drawing_id": drawing_no,
                            "revision": next_revision,
                            "previous_revision": current_max,
                            "type": "updated"
                        })
                        print(f"    UPDATED: {f.filename} -> {drawing_no} rev {next_revision}")

                    else:
                        # Fresh drawing — insert drawing + revision 1
                        c.execute(
                            "INSERT INTO drawings "
                            "(drawing_no, creator_id, drawing_type, pc, created_at) "
                            "VALUES (%s, %s, %s, %s, %s)",
                            (drawing_no, creator_id, drawing_type, pc, today)
                        )
                        drawing_db_id = c.lastrowid
                        c.execute(
                            "INSERT INTO drawing_revisions "
                            "(drawing_id, revision_no, reviewer_id, created_at, task_number) "
                            "VALUES (%s, %s, %s, %s, %s)",
                            (drawing_db_id, 1, reviewer_id, today, task_number)
                        )
                        revision_db_id = c.lastrowid
                        c.execute(
                            "INSERT INTO drawing_files "
                            "(drawing_id, revision_id, file_data, uploaded_by, uploaded_at) "
                            "VALUES (%s, %s, %s, %s, %s)",
                            (drawing_db_id, revision_db_id, pdf_bytes, creator_id, today)
                        )
                        results.append({
                            "drawing_id": drawing_no,
                            "revision": 1,
                            "previous_revision": None,
                            "type": "new"
                        })
                        print(f"    NEW: {f.filename} -> {drawing_no} rev 1")

            g.db.commit()

            if results:
                try:
                    items_for_email = [(r["drawing_id"], r["revision"]) for r in results]
                    send_single_summary_email(
                        to_email=reviewer_email,
                        items=items_for_email,
                        creator_emp_id=creator_emp_id,
                        creator_name=creator_db_name,
                        user_comments=comments,
                        task_number=task_number
                    )
                except Exception as email_err:
                    print(f"    Email send error: {email_err}")

            return jsonify({
                "success": True,
                "message": "Processed files successfully.",
                "results": results,
                "rejected": rejected,
            }), 200

        except Exception as e:
            try:
                if hasattr(g, 'db'):
                    g.db.rollback()
            except Exception:
                pass
            print(f"submit-batch error: {e}")
            traceback.print_exc()
            return jsonify({"success": False,
                            "message": f"Internal Server Error: {str(e)}"}), 500

    except Exception as e:
        print(f"submit-batch fatal error: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Fatal Error: {str(e)}"}), 500
    
    
# Requests start

def table_exists(cur, table_name: str) -> bool:
    cur.execute("""
        SELECT COUNT(*)
          FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name = %s
    """, (table_name,))
    return cur.fetchone()[0] > 0

def get_employee(cur, emp_id: str):
    cur.execute("SELECT Emp_Name, EMP_Email FROM employees WHERE Emp_ID=%s LIMIT 1", (emp_id,))
    row = cur.fetchone()
    if not row:
        return {"name": emp_id, "email": ""}
    return {"name": row[0] or emp_id, "email": row[1] or ""}

def get_dyn_row(cur, table_name: str, rev: int):
    cur.execute(f"""
        SELECT Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Date, Decision
          FROM `{table_name}`
         WHERE Revision_num=%s
         LIMIT 1
    """, (rev,))
    row = cur.fetchone()
    if not row:
        return None
    return {
        "Revision_num": row[0],
        "Reviewer_EMP_ID": row[1],
        "Creator_EMP_ID": row[2],
        "Date": row[3],
        "Decision": (row[4] or '').strip()
    }

@app.route('/requests/creator/<emp_id>', methods=['GET'])
def requests_creator(emp_id):
    """
    Returns list of drawings created by this employee with their review status.
    Now queries drawings and drawing_revisions tables instead of dynamic tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    with g.db.cursor() as c:
        # Get user_id from emp_id
        c.execute("SELECT id FROM users WHERE emp_id = %s AND is_active = TRUE", (emp_id,))
        user_row = c.fetchone()
        if not user_row:
            return jsonify([]), 200
        
        user_id = user_row[0]
        
        # Query drawings using drawing_files to ensure we get exactly what was uploaded by this user
        c.execute("""
            SELECT 
                d.drawing_no,
                dr.revision_no,
                df.uploaded_at as created_date,
                u_reviewer.emp_id as reviewer_id,
                u_reviewer.name as reviewer_name,
                u_reviewer.email as reviewer_email,
                dr.reviewed_date,
                dr.approved
            FROM drawing_files df
            JOIN drawing_revisions dr ON df.revision_id = dr.id
            JOIN drawings d ON dr.drawing_id = d.id
            LEFT JOIN users u_reviewer ON dr.reviewer_id = u_reviewer.id
            WHERE df.uploaded_by = %s
            ORDER BY df.uploaded_at DESC, d.drawing_no ASC, dr.revision_no DESC
        """, (user_id,))
        rows = c.fetchall()

        out = []
        for drawing_no, rev, created_date, reviewer_id, reviewer_name, reviewer_email, reviewed_date, approved in rows:
            # Determine status
            if reviewed_date is None:
                status = 'Pending'
            elif approved == 1:
                status = 'Approved'
            elif approved == 0:
                status = 'Rejected'
            else:
                status = 'Pending'

            out.append({
                "drawingNo": drawing_no,
                "revisionNo": int(rev),
                "createdDate": created_date.strftime("%Y-%m-%d") if created_date else "",
                "reviewerId": reviewer_id,
                "reviewerName": reviewer_name,
                "reviewerEmail": reviewer_email,
                "status": status
            })
    return jsonify(out), 200

@app.route('/requests/reviewer/<emp_id>', methods=['GET'])
def requests_reviewer(emp_id):
    """
    Returns list of drawings assigned to this reviewer with their review status.
    Now queries drawings and drawing_revisions tables instead of dynamic tables.
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    with g.db.cursor() as c:
        # Get user_id from emp_id
        c.execute("SELECT id FROM users WHERE emp_id = %s AND is_active = TRUE", (emp_id,))
        user_row = c.fetchone()
        if not user_row:
            return jsonify([]), 200
        
        user_id = user_row[0]
        
        # Query drawings assigned to this reviewer, anchored on drawing_files
        c.execute("""
            SELECT 
                d.drawing_no,
                dr.revision_no,
                df.uploaded_at as created_date,
                u_creator.emp_id as creator_id,
                u_creator.name as creator_name,
                u_creator.email as creator_email,
                dr.reviewed_date
            FROM drawing_files df
            JOIN drawing_revisions dr ON df.revision_id = dr.id
            JOIN drawings d ON dr.drawing_id = d.id
            LEFT JOIN users u_creator ON df.uploaded_by = u_creator.id
            WHERE dr.reviewer_id = %s
            ORDER BY df.uploaded_at DESC, d.drawing_no ASC, dr.revision_no DESC
        """, (user_id,))
        rows = c.fetchall()

        out = []
        for drawing_no, rev, created_date, creator_id, creator_name, creator_email, reviewed_date in rows:
            status = 'Reviewed' if reviewed_date else 'Review'
            last_reviewed = reviewed_date.strftime("%Y-%m-%d") if reviewed_date else None

            out.append({
                "drawingNo": drawing_no,
                "revisionNo": int(rev),
                "createdDate": created_date.strftime("%Y-%m-%d") if created_date else "",
                "creatorId": creator_id,
                "creatorName": creator_name,
                "creatorEmail": creator_email,
                "lastReviewedDate": last_reviewed,
                "status": status
            })
    return jsonify(out), 200

@app.route('/requests/delete/<drawing_id>/<int:revision>', methods=['DELETE'])
def delete_request(drawing_id, revision):
    """
    Delete a request (revision) from the database.
    """
    conn = connect_to_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cur:
            # 1. Find the drawing PK
            cur.execute("SELECT id FROM drawings WHERE drawing_no=%s", (drawing_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Drawing not found"}), 404
            
            drawing_db_id = row[0]

            # 2. Find the revision PK
            cur.execute("SELECT id FROM drawing_revisions WHERE drawing_id=%s AND revision_no=%s", (drawing_db_id, revision))
            rev_row = cur.fetchone()
            if not rev_row:
                 return jsonify({"error": "Revision not found"}), 404
            
            revision_db_id = rev_row[0]
            
            # 3. Delete the revision
            # ON DELETE CASCADE should handle drawing_files, revision_error_codes etc.
            cur.execute("DELETE FROM drawing_revisions WHERE id=%s", (revision_db_id,))
            
            # Optional: Check if drawing has any revisions left
            cur.execute("SELECT COUNT(*) FROM drawing_revisions WHERE drawing_id=%s", (drawing_db_id,))
            if cur.fetchone()[0] == 0:
                # No more revisions, delete the drawing too?
                # Maybe keeping the drawing record is fine, but usually "Delete Request" implies cleaning up if empty.
                # Let's delete the drawing if no revisions remain.
                cur.execute("DELETE FROM drawings WHERE id=%s", (drawing_db_id,))

            conn.commit()
            return jsonify({"ok": True, "message": "Request deleted successfully"}), 200
            
    except Exception as e:
        conn.rollback()
        print(f"Error deleting request: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
        
def _safe_table_name(name: str) -> str:
    # allow DR_ and alnums/underscore only
    if not re.fullmatch(r'[A-Za-z0-9_]+', name or ''):
        raise ValueError("Invalid table name")
    return f"`{name}`"

def _fetch_pdf_blob(conn, drawing_no: str, revision_no: int) -> bytes | None:
    with conn.cursor() as cur:
        # Changed: Fetch file_data directly from DB
        cur.execute("""
            SELECT df.file_data
              FROM drawing_files df
              JOIN drawing_revisions rev ON df.revision_id = rev.id
              JOIN drawings d ON rev.drawing_id = d.id
             WHERE d.drawing_no = %s
               AND rev.revision_no = %s
             LIMIT 1
        """, (drawing_no, revision_no))
        row = cur.fetchone()
        if not row:
            return None
        return row[0]


@app.route("/drawings/<drawing_id>/<int:revision>/pdf/view", methods=["GET"])
def view_pdf(drawing_id, revision):
    """
    View PDF inline in browser.
    Now queries drawing_files table instead of dynamic tables.
    """
    conn = connect_to_db()
    try:
        blob = _fetch_pdf_blob(conn, drawing_id, revision)
        if not blob:
            return {"error": "PDF not found"}, 404
        return Response(blob, mimetype="application/pdf")
    finally:
        conn.close()


@app.route("/drawings/<drawing_id>/<int:revision>/pdf/download", methods=["GET"])
def download_pdf(drawing_id, revision):
    """
    Download PDF as attachment.
    Now queries drawing_files table instead of dynamic tables.
    """
    conn = connect_to_db()
    try:
        blob = _fetch_pdf_blob(conn, drawing_id, revision)
        if not blob:
            return {"error": "PDF not found"}, 404

        return send_file(
            io.BytesIO(blob),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{drawing_id}_Rev{str(revision).zfill(2)}.pdf"
        )
    finally:
        conn.close()

@app.route("/drawings/<drawing_id>/<int:revision>/pdf/annotated/download", methods=["POST"])
def download_annotated_pdf(drawing_id, revision):
    """
    Return a *temporary* PDF with additional annotations (text + stamps) baked in,
    without modifying what is stored in the database.
    """
    payload = request.get_json(silent=True) or {}
    annotations = payload.get("annotations") or []

    print(f"[INFO] Generating annotated PDF for {drawing_id} Rev {revision}")
    print(f"[INFO] Received {len(annotations)} annotations")

    # [SUCCESS] g.db safety check
    if not hasattr(g, "db") or g.db is None:
        return dbg_fail("db-check", "Database connection is not established", code=500)

    conn = g.db

    try:
        blob = _fetch_pdf_blob(conn, drawing_id, revision)
        if not blob:
            return jsonify({"error": "PDF not found"}), 404

        # Open original PDF from DB
        doc = fitz.open(stream=blob, filetype="pdf")
        print(f"[INFO] Opened PDF with {len(doc)} pages")

        annotations_added = 0
        stamps_added = 0
        
        for ann in annotations:
            try:
                page_index = int(ann.get("page", 1)) - 1
                if page_index < 0 or page_index >= len(doc):
                    print(f"[WARNING] Skipping annotation - page {page_index+1} out of range")
                    continue
                
                page = doc[page_index]
                rect = page.rect

                # Normalized coordinates → page coordinates
                x_norm = float(ann.get("x", 0.0))
                y_norm = float(ann.get("y", 0.0))
                x = rect.x0 + x_norm * rect.width
                y = rect.y0 + y_norm * rect.height

                # Check annotation type
                ann_type = ann.get("type", "text")
                
                if ann_type == "stamp":
                    # Render stamp annotation
                    stamp_type = ann.get("stampType", "reviewed")
                    reviewer_name = ann.get("reviewerName", "Unknown")
                    review_date = ann.get("reviewDate", "")
                    
                    if stamp_type in ("correct", "wrong"):
                        # Draw geometric shapes (flattened permanently onto the page)
                        if stamp_type == "correct":
                            # Draw a green checkmark — two separate strokes to avoid closing into a triangle
                            color = (16/255, 185/255, 129/255)
                            p1 = fitz.Point(x + 4,  y + 16)
                            p2 = fitz.Point(x + 12, y + 24)
                            p3 = fitz.Point(x + 26, y + 6)
                            # First leg: bottom-left to pivot
                            s1 = page.new_shape()
                            s1.draw_line(p1, p2)
                            s1.finish(color=color, width=4)
                            s1.commit()
                            # Second leg: pivot to top-right
                            s2 = page.new_shape()
                            s2.draw_line(p2, p3)
                            s2.finish(color=color, width=4)
                            s2.commit()
                        else:
                            # Draw a red X — two separate diagonal strokes
                            color = (239/255, 68/255, 68/255)
                            s1 = page.new_shape()
                            s1.draw_line(fitz.Point(x + 6,  y + 6),  fitz.Point(x + 26, y + 26))
                            s1.finish(color=color, width=4)
                            s1.commit()
                            s2 = page.new_shape()
                            s2.draw_line(fitz.Point(x + 26, y + 6),  fitz.Point(x + 6,  y + 26))
                            s2.finish(color=color, width=4)
                            s2.commit()

                        stamps_added += 1
                        print(f"[SUCCESS] Added flattened {stamp_type} stamp on page {page_index+1}")
                        continue

                    # Define stamp dimensions for regular textual stamps
                    stamp_width = 200
                    stamp_height = 45
                    stamp_rect = fitz.Rect(x, y, x + stamp_width, y + stamp_height)
                    
                    # Choose color based on regular stamp type
                    if stamp_type == "approved":
                        border_color = (16/255, 185/255, 129/255)  # Green
                        text_color = (16/255, 185/255, 129/255)
                        # Light green background
                        bg_color = (16/255 + (1 - 16/255) * 0.95, 
                                   185/255 + (1 - 185/255) * 0.95, 
                                   129/255 + (1 - 129/255) * 0.95)
                    elif stamp_type == "rejected":
                        border_color = (239/255, 68/255, 68/255)  # Red
                        text_color = (239/255, 68/255, 68/255)
                        # Light red background
                        bg_color = (239/255 + (1 - 239/255) * 0.95, 
                                   68/255 + (1 - 68/255) * 0.95, 
                                   68/255 + (1 - 68/255) * 0.95)
                    else:  # reviewed
                        border_color = (59/255, 130/255, 246/255)  # Blue
                        text_color = (59/255, 130/255, 246/255)
                        # Light blue background
                        bg_color = (59/255 + (1 - 59/255) * 0.95, 
                                   130/255 + (1 - 130/255) * 0.95, 
                                   246/255 + (1 - 246/255) * 0.95)
                    
                    header_text = stamp_type.upper()
                    details_text = f"By {reviewer_name} at {review_date}"
                    combined_text = f"{header_text}\n{details_text}"
                    
                    # Use FreeText annotation instead of drawing directly on the page stream,
                    # so the stamp remains movable and interactive after downloading.
                    try:
                        annot = page.add_freetext_annot(
                            stamp_rect,
                            combined_text,
                            fontsize=11,
                            fontname="helv",
                            text_color=text_color,
                            fill_color=bg_color
                        )
                        annot.update()
                    except Exception as e:
                        print(f"Failed to add interactive stamp annotation, fallback to sticky note: {e}")
                        page.add_text_annot(fitz.Point(x, y), combined_text)
                    
                    stamps_added += 1
                    print(f"[SUCCESS] Added {stamp_type} stamp on page {page_index+1}")
                    
                elif ann_type == "pen":
                    points = ann.get("points", [])
                    if len(points) > 1:
                        color_hex = ann.get("color", "#000000").lstrip("#")
                        if len(color_hex) == 6:
                            color = (int(color_hex[0:2], 16)/255, int(color_hex[2:4], 16)/255, int(color_hex[4:6], 16)/255)
                        else:
                            color = (0,0,0)
                        width = float(ann.get("strokeWidth", 4))
                        s = page.new_shape()
                        pt_list = [fitz.Point(rect.x0 + (x_norm + pt.get("x", 0.0)) * rect.width, 
                                              rect.y0 + (y_norm + pt.get("y", 0.0)) * rect.height) for pt in points]
                        s.draw_polyline(pt_list)
                        s.finish(color=color, fill=None, width=width, lineCap=1, lineJoin=1, closePath=False)
                        s.commit()
                        annotations_added += 1
                        print(f"[SUCCESS] Added pen stroke on page {page_index+1}")
                else:
                    # Handle text annotation (existing code)
                    text = str(ann.get("text") or "").strip()
                    if not text:
                        print(f"[WARNING] Skipping annotation - empty text")
                        continue

                    # Add a standard text annotation icon at that point
                    page.add_text_annot(fitz.Point(x, y), text)
                    annotations_added += 1
                    print(f"[SUCCESS] Added text annotation on page {page_index+1}: '{text[:50]}...'")
                    
            except Exception as e:
                # Don't fail the whole export for a single bad annotation
                print(f"[ERROR] Failed to add annotation: {e}")
                import traceback
                traceback.print_exc()
                continue

        print(f"[SUCCESS] Successfully added {annotations_added} text annotations and {stamps_added} stamps")

        out_bytes = doc.write()
        doc.close()

        download_name = f"{drawing_id}_Rev{str(revision).zfill(2)}_annotated.pdf"
        print(f"[SUCCESS] Sending annotated PDF: {download_name} ({len(out_bytes)} bytes)")
        
        return send_file(
            io.BytesIO(out_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=download_name
        )
    except Exception as e:
        print(f"[ERROR] FULL ERROR generating annotated PDF: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "type": type(e).__name__}), 500


# Autofill uploads page

# @app.route('/prefill-upload', methods=['GET'])
# def prefill_upload():
#     """
#     Returns everything the Uploads page needs, with data coming from:
#       - drawings (Creator_ID, Reviewer_ID, Drawing_Type, Drawing_ID, Revision_num)
#       - employees (PC/division/team for the Creator_ID)
#     Query params:
#       drawing_id=DR_XXXX
#       revision=<optional int>; if omitted, use max(Revision_num) for that drawing_id
#     """
#     if db is None:
#         return jsonify({"ok": False, "error": "db not connected"}), 500

#     drawing_id = (request.args.get('drawing_id') or '').strip()
#     rev_param = (request.args.get('revision') or '').strip()

#     if not drawing_id:
#         return jsonify({"ok": False, "error": "drawing_id is required"}), 400

#     try:
#         cur = db.cursor()

#         # If revision not provided, pick the greatest Revision_num for this drawing
#         if rev_param:
#             try:
#                 revision_num = int(rev_param)
#             except ValueError:
#                 return jsonify({"ok": False, "error": "revision must be an integer"}), 400
#         else:
#             cur.execute(
#                 "SELECT MAX(Revision_num) FROM drawings WHERE Drawing_ID=%s",
#                 (drawing_id,)
#             )
#             row = cur.fetchone()
#             if not row or row[0] is None:
#                 return jsonify({"ok": False, "error": "No rows found for this Drawing_ID"}), 404
#             revision_num = int(row[0])

#         # Pull the row from drawings
#         cur.execute("""
#             SELECT Creator_EMP_ID, Reviewer_EMP_ID, Reviewer_EMP_ID, Revision_num, Date, Drawing_type
#             FROM drawings
#             WHERE Drawing_ID=%s AND Revision_num=%s
#         """, (drawing_id, revision_num))
#         drow = cur.fetchone()
#         if not drow:
#             return jsonify({"ok": False, "error": "No matching drawing row"}), 404

#         creator_id, reviewer_id, drawing_type, rev_in_row, Date, Drawing_type = drow

#         # Fetch PC / division / team for creator from Employees
#         cur.execute("""
#             SELECT emp_PC, emp_division, emp_team
#             FROM Employees
#             WHERE emp_id=%s
#         """, (creator_id,))
#         erow = cur.fetchone()
#         emp_PC = erow[0] if erow else ''
#         emp_division = erow[1] if erow else ''
#         emp_team = erow[2] if erow else ''

#         # We do NOT return the PDF to the client here (you said no PDF in uploads UI)
#         # but if you ever need a preview, you can send a small flag like has_pdf.
#         cur.execute("""
#             SELECT CASE WHEN Drawing_PDF IS NULL THEN 0 ELSE 1 END AS has_pdf
#             FROM drawings
#             WHERE Drawing_ID=%s AND Revision_num=%s
#         """, (drawing_id, revision_num))
#         has_pdf = (cur.fetchone() or (0,))[0] == 1

#         # For the date input, default to today if Updated_Date is NULL
#         reviewed_date_iso = (Date.isoformat() if isinstance(Date, (datetime, datetime)) else datetime.today().isoformat())

#         # Design number without "DR_"
#         design_no_plain = drawing_id.replace('DR_', '', 1) if drawing_id.startswith('DR_') else drawing_id

#         return jsonify({
#             "ok": True,
#             "drawing_id": drawing_id,
#             "design_no_plain": design_no_plain,
#             "revision_no": rev_in_row,
#             "creator_id": creator_id or "",
#             "reviewer_id": reviewer_id or "",
#             "emp_PC": emp_PC or "",
#             "emp_division": emp_division or "",
#             "emp_team": emp_team or "",
#             "reviewed_date": reviewed_date_iso,
#             "has_pdf": has_pdf,
#             "Drawing_Type" : Drawing_type
#         })
#     except pymysql.MySQLError as e:
#         return jsonify({"ok": False, "error": f"MySQL error: {e}"}), 500
#     except Exception as e:
#         return jsonify({"ok": False, "error": f"Unexpected: {e}"}), 500


@app.route('/prefill-upload', methods=['GET'])
def prefill_upload():
    db = connect_to_db()
    if db is None:
        return jsonify({"ok": False, "error": "db not connected"}), 500

    drawing_no = (request.args.get('drawing_id') or '').strip()
    rev_param  = (request.args.get('revision') or '').strip()

    if not drawing_no:
        return jsonify({"ok": False, "error": "drawing_id is required"}), 400

    try:
        cur = db.cursor()

        # 1. Get Drawing ID and Creator
        cur.execute("""
            SELECT id, creator_id, drawing_type, pc 
            FROM drawings 
            WHERE drawing_no = %s
        """, (drawing_no,))
        drawing_row = cur.fetchone()
        
        if not drawing_row:
             return jsonify({"ok": False, "error": "No matching drawing found"}), 404
        
        drawing_db_id = drawing_row[0]
        creator_id = drawing_row[1]
        drawing_type = drawing_row[2]
        drawing_pc = drawing_row[3]

        # 2. Determine Revision
        # Find latest revision for this drawing
        cur.execute("SELECT MAX(revision_no) FROM drawing_revisions WHERE drawing_id=%s", (drawing_db_id,))
        row = cur.fetchone()
        if not row or row[0] is None:
             # Should not happen if drawing exists, but handle it
             return jsonify({"ok": False, "error": "No revisions found for this drawing"}), 404
        max_rev = int(row[0])

        requested_rev = None
        if rev_param.isdigit():
            requested_rev = int(rev_param)
        
        chosen_rev = max_rev
        if requested_rev is not None:
            # Check if requested exists
            cur.execute("SELECT 1 FROM drawing_revisions WHERE drawing_id=%s AND revision_no=%s", (drawing_db_id, requested_rev))
            if cur.fetchone():
                chosen_rev = requested_rev

        # 3. Get Revision Details (Reviewer, Date)
        cur.execute("""
            SELECT reviewer_id, created_at, id, task_number
            FROM drawing_revisions
            WHERE drawing_id=%s AND revision_no=%s
        """, (drawing_db_id, chosen_rev))
        
        rev_row = cur.fetchone()
        if not rev_row:
             return jsonify({"ok": False, "error": "Revision details not found"}), 404
        
        reviewer_id = rev_row[0]
        revision_date = rev_row[1]
        revision_db_id = rev_row[2]
        task_number = rev_row[3]

        # 4. Get User Details
        # Creator
        cur.execute("SELECT emp_id, division, team, pc FROM users WHERE id=%s", (creator_id,))
        c_user = cur.fetchone()
        creator_emp_id = c_user[0] if c_user else ""
        emp_division = c_user[1] if c_user else ""
        emp_team = c_user[2] if c_user else ""
        
        # Prefer the PC specific to this drawing. If none exists (e.g. older drawing), fallback to the user's PCs.
        emp_pc = drawing_pc if drawing_pc else (c_user[3] if c_user else "")

        # Reviewer
        reviewer_emp_id = ""
        if reviewer_id:
            cur.execute("SELECT emp_id FROM users WHERE id=%s", (reviewer_id,))
            r_user = cur.fetchone()
            if r_user:
                reviewer_emp_id = r_user[0]

        # 5. Check if PDF exists in drawing_files
        cur.execute("""
            SELECT 1 FROM drawing_files 
            WHERE revision_id=%s AND file_data IS NOT NULL
        """, (revision_db_id,))
        has_pdf = (cur.fetchone() is not None)

        design_no_plain = drawing_no[3:] if drawing_no.startswith('DR_') else drawing_no

        response_data = {
            "ok": True,
            "drawing_id": drawing_no,
            "design_no_plain": design_no_plain,
            "requested_revision": requested_rev,
            "used_revision": chosen_rev,
            "revision_no": chosen_rev,
            "used_latest": (chosen_rev == max_rev),
            "creator_id": creator_emp_id,
            "reviewer_id": reviewer_emp_id,
            "emp_PC": emp_pc,
            "emp_division": emp_division,
            "emp_team": emp_team,
            "has_pdf": has_pdf,
            "Drawing_Type": drawing_type or "",
            "reviewed_date": (revision_date.isoformat() if revision_date else None),
            "task_number": task_number or ""
        }
        
        print(f"[INFO] BACKEND /prefill-upload response: drawing_id={drawing_no}, revision={chosen_rev}")
        
        return jsonify(response_data)

    except Exception as e:
        print(f"Error in prefill-upload: {e}")
        traceback.print_exc()
        return jsonify({"ok": False, "error": "An unexpected error occurred"}), 500
    finally:
        try: cur.close()
        except: pass
        try: db.close()
        except: pass

# Autofill uploads page ends

# Canvas Data

@app.route('/drawings/<drawing_id>/<int:revision>/pdf/annotated/upload', methods=['POST'])
def upload_annotated_pdf(drawing_id, revision):
    """
    Replaces PDF for (Drawing_ID, Revision_num) with the uploaded annotated PDF.
    Updates drawing_files.file_data in the normalized schema.
    """
    file = request.files.get('file')
    if file is None:
        return jsonify({'error': 'missing file'}), 400

    pdf_bytes = file.read()
    filename = request.form.get('filename', '')

    conn = connect_to_db()
    try:
        with conn.cursor() as cur:
            # 1. Find the revision_id
            cur.execute("""
                SELECT rev.id, d.id
                  FROM drawing_revisions rev
                  JOIN drawings d ON rev.drawing_id = d.id
                 WHERE d.drawing_no = %s
                   AND rev.revision_no = %s
            """, (drawing_id, revision))
            row = cur.fetchone()
            
            if not row:
                return jsonify({'error': 'row not found'}), 404
            
            revision_db_id = row[0]
            drawing_db_id = row[1]

            # 2. Update the PDF in drawing_files
            # We first check if a file entry exists for this revision
            cur.execute("SELECT id FROM drawing_files WHERE revision_id = %s", (revision_db_id,))
            if cur.fetchone():
                cur.execute("""
                    UPDATE drawing_files
                       SET file_data = %s, uploaded_at = NOW()
                     WHERE revision_id = %s
                """, (pdf_bytes, revision_db_id))
            else:
                # Need uploaded_by... we might not have it from this context easy.
                # But typically we should just update. If missing, we need a fallback.
                # Let's assume it exists if the revision exists (from submit-batch).
                # If not, we fall back to creator of the drawing? 
                # For safety, let's use the Creator of the drawing as uploaded_by if we must insert.
                cur.execute("SELECT creator_id FROM drawings WHERE id = %s", (drawing_db_id,))
                creator_id = cur.fetchone()[0]
                
                cur.execute("""
                    INSERT INTO drawing_files (drawing_id, revision_id, file_data, uploaded_by, uploaded_at)
                    VALUES (%s, %s, %s, %s, NOW())
                """, (drawing_db_id, revision_db_id, pdf_bytes, creator_id))

        conn.commit()
        return jsonify({'ok': True, 'filename': filename})
    except Exception as e:
        conn.rollback()
        print(f"Error uploading annotated PDF: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# Annotation storage endpoints for canvas
@app.route('/annotations/<drawing_id>', methods=['POST'])
def save_annotations(drawing_id):
    """
    Save annotations for a drawing (all revisions).
    Expects JSON: { "documentId": "DR_xxx", "annotations": [...] }
    Stores in a simple JSON column or separate table.
    """
    try:
        payload = request.get_json(silent=True) or {}
        annotations = payload.get('annotations', [])
        
        # Store annotations in a simple way - using a JSON file or database
        # For now, we'll use a simple file-based approach
        annotations_dir = os.path.join(UPLOAD_FOLDER, 'annotations')
        os.makedirs(annotations_dir, exist_ok=True)
        
        safe_drawing_id = secure_filename(drawing_id)
        file_path = os.path.join(annotations_dir, f"{safe_drawing_id}.json")
        with open(file_path, 'w') as f:
            json.dump(annotations, f)
        
        return jsonify({"ok": True, "message": "Annotations saved"}), 200
    except Exception as e:
        print(f"Error saving annotations: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/annotations/<drawing_id>', methods=['GET'])
def load_annotations(drawing_id):
    """
    Load annotations for a drawing.
    Returns JSON: { "annotations": [...] }
    """
    try:
        annotations_dir = os.path.join(UPLOAD_FOLDER, 'annotations')
        safe_drawing_id = secure_filename(drawing_id)
        file_path = os.path.join(annotations_dir, f"{safe_drawing_id}.json")
        
        if not os.path.exists(file_path):
            return jsonify({"annotations": []}), 200
        
        with open(file_path, 'r') as f:
            annotations = json.load(f)
        
        return jsonify({"annotations": annotations}), 200
    except Exception as e:
        print(f"Error loading annotations: {e}")
        return jsonify({"error": str(e)}), 500



# ============================================================================
# STRUCTURE MANAGEMENT API (Divisions, PCs, Teams)
# ============================================================================

# --- DIVISIONS ---
@app.route('/api/structure/divisions', methods=['GET'])
def get_divisions():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor(pymysql.cursors.DictCursor) as c:
            c.execute("SELECT * FROM structure_divisions WHERE is_active = TRUE ORDER BY name")
            return jsonify(c.fetchall())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/divisions', methods=['POST'])
def add_division():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        if not name: return jsonify({"error": "Name is required"}), 400
        
        with g.db.cursor() as c:
            # Check duplicate
            c.execute("SELECT id, is_active FROM structure_divisions WHERE name = %s", (name,))
            row = c.fetchone()
            if row:
               if row[1]: # is_active
                   return jsonify({"error": "Division already exists"}), 400
               else:
                   # Reactivate
                   c.execute("UPDATE structure_divisions SET is_active = TRUE WHERE id = %s", (row[0],))
                   g.db.commit()
                   return jsonify({"success": True}), 201
            
            c.execute("INSERT INTO structure_divisions (name) VALUES (%s)", (name,))
        g.db.commit()
        return jsonify({"success": True}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/divisions/<int:id>', methods=['DELETE'])
def delete_division(id):
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor() as c:
            c.execute("UPDATE structure_divisions SET is_active = FALSE WHERE id = %s", (id,))
        g.db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- PCs ---
@app.route('/api/structure/pcs', methods=['GET'])
def get_pcs():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        division_id = request.args.get('division_id')
        query = "SELECT * FROM structure_pcs WHERE is_active = TRUE"
        params = []
        if division_id:
            query += " AND division_id = %s"
            params.append(division_id)
        query += " ORDER BY name"
        
        with g.db.cursor(pymysql.cursors.DictCursor) as c:
            c.execute(query, tuple(params))
            return jsonify(c.fetchall())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/pcs', methods=['POST'])
def add_pc():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        division_id = data.get('division_id')
        if not name or not division_id: return jsonify({"error": "Name and Division ID are required"}), 400
        
        with g.db.cursor() as c:
            # Check duplicate
            c.execute("SELECT id, is_active FROM structure_pcs WHERE name = %s AND division_id = %s", (name, division_id))
            row = c.fetchone()
            if row:
                if row[1]: # is_active
                    return jsonify({"error": "PC already exists in this division"}), 400
                else:
                    # Reactivate
                    c.execute("UPDATE structure_pcs SET is_active = TRUE WHERE id = %s", (row[0],))
                    g.db.commit()
                    return jsonify({"success": True}), 201

            c.execute("INSERT INTO structure_pcs (name, division_id) VALUES (%s, %s)", (name, division_id))
        g.db.commit()
        return jsonify({"success": True}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/pcs/<int:id>', methods=['DELETE'])
def delete_pc(id):
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor() as c:
            c.execute("UPDATE structure_pcs SET is_active = FALSE WHERE id = %s", (id,))
        g.db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- TEAMS ---
@app.route('/api/structure/teams', methods=['GET'])
def get_teams():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor(pymysql.cursors.DictCursor) as c:
            c.execute("SELECT * FROM structure_teams WHERE is_active = TRUE ORDER BY name")
            return jsonify(c.fetchall())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/teams', methods=['POST'])
def add_team():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        if not name: return jsonify({"error": "Name is required"}), 400
        
        with g.db.cursor() as c:
             # Check duplicate
            c.execute("SELECT id, is_active FROM structure_teams WHERE name = %s", (name,))
            row = c.fetchone()
            if row:
                if row[1]:
                   return jsonify({"error": "Team already exists"}), 400
                else:
                   # Reactivate
                   c.execute("UPDATE structure_teams SET is_active = TRUE WHERE id = %s", (row[0],))
                   g.db.commit()
                   return jsonify({"success": True}), 201
               
            c.execute("INSERT INTO structure_teams (name) VALUES (%s)", (name,))
        g.db.commit()
        return jsonify({"success": True}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/structure/teams/<int:id>', methods=['DELETE'])
def delete_team(id):
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor() as c:
            c.execute("UPDATE structure_teams SET is_active = FALSE WHERE id = %s", (id,))
        g.db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- CADQ Checklist Endpoints ----------------- #

@app.route('/api/app-settings', methods=['GET'])
def get_app_settings():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor(pymysql.cursors.DictCursor) as c:
            c.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'checklist_edition'")
            row = c.fetchone()
            edition = row['setting_value'] if row else ''
            return jsonify({"checklist_edition": edition}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadq-checklist', methods=['GET'])
def get_cadq_checklist():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        team = request.args.get('team')
        with g.db.cursor(pymysql.cursors.DictCursor) as c:
            if team and team != 'Global' and team != 'null':
                # First check if there is a specific checklist for this team
                c.execute("SELECT * FROM cadq_checklist WHERE team_name = %s ORDER BY display_order ASC", (team,))
                team_rows = c.fetchall()
                
                # Fetch Global defaults
                c.execute("SELECT * FROM cadq_checklist WHERE team_name IS NULL ORDER BY display_order ASC")
                global_rows = c.fetchall()

                if not team_rows:
                    # Fallback to Global defaults if team has no custom checklist
                    rows = global_rows
                else:
                    team_refs = set(r['standard_ref'] for r in team_rows)
                    missing_globals = [r for r in global_rows if r['standard_ref'] not in team_refs]
                    
                    rows = team_rows + missing_globals
                    rows.sort(key=lambda x: x['display_order'])
            else:
                # Fetch only Global items when no team is specified or Global is selected
                c.execute("SELECT * FROM cadq_checklist WHERE team_name IS NULL ORDER BY display_order ASC")
                rows = c.fetchall()
            
            response = jsonify(rows)
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            return response, 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadq-checklist', methods=['POST'])
def save_cadq_checklist():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        data = request.json or {}
        # Expected fields based on DB
        seq_nr = data.get('seq_nr', '')
        standard_ref = data.get('standard_ref', '')
        part_val = data.get('part_val', '')
        piping_val = data.get('piping_val', '')
        welded_val = data.get('welded_val', '')
        other_val = data.get('other_val', '')
        ferro_val = data.get('ferro_val', '')
        non_ferro_val = data.get('non_ferro_val', '')
        casted_machined_val = data.get('casted_machined_val', '')
        machined_non_casted_val = data.get('machined_non_casted_val', '')
        sheet_metal_val = data.get('sheet_metal_val', '')
        foam_decals_val = data.get('foam_decals_val', '')
        assembly_val = data.get('assembly_val', '')
        instruction_val = data.get('instruction_val', '')
        information_val = data.get('information_val', '')
        safety_labels_val = data.get('safety_labels_val', '')
        team_name = data.get('team_name', None)
        
        # Ensure team_name is NULL if it's empty string or "null" or "Global"
        if team_name == '' or team_name == 'null' or team_name == 'Global':
            team_name = None

        display_order = data.get('display_order', 0)
        
        item_id = data.get('id')
        
        with g.db.cursor() as c:
            if not item_id and standard_ref:
                if team_name is None:
                    c.execute("SELECT id FROM cadq_checklist WHERE standard_ref = %s AND team_name IS NULL", (standard_ref,))
                else:
                    c.execute("SELECT id FROM cadq_checklist WHERE standard_ref = %s AND team_name = %s", (standard_ref, team_name))
                row = c.fetchone()
                if row:
                    item_id = row[0] if isinstance(row, tuple) else row['id']

            if item_id:
                sql = """
                    UPDATE cadq_checklist SET
                    seq_nr=%s, standard_ref=%s, part_val=%s, piping_val=%s, welded_val=%s, other_val=%s,
                    ferro_val=%s, non_ferro_val=%s, casted_machined_val=%s, machined_non_casted_val=%s,
                    sheet_metal_val=%s, foam_decals_val=%s, assembly_val=%s, instruction_val=%s,
                    information_val=%s, safety_labels_val=%s, team_name=%s, display_order=%s
                    WHERE id=%s
                """
                c.execute(sql, (
                    seq_nr, standard_ref, part_val, piping_val, welded_val, other_val,
                    ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val,
                    sheet_metal_val, foam_decals_val, assembly_val, instruction_val,
                    information_val, safety_labels_val, team_name, display_order, item_id
                ))
            else:
                sql = """
                    INSERT INTO cadq_checklist (
                        seq_nr, standard_ref, part_val, piping_val, welded_val, other_val, 
                        ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val, 
                        sheet_metal_val, foam_decals_val, assembly_val, instruction_val, 
                        information_val, safety_labels_val, team_name, display_order
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """
                c.execute(sql, (
                    seq_nr, standard_ref, part_val, piping_val, welded_val, other_val,
                    ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val,
                    sheet_metal_val, foam_decals_val, assembly_val, instruction_val,
                    information_val, safety_labels_val, team_name, display_order
                ))
        g.db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadq-checklist/<int:id>', methods=['DELETE'])
def delete_cadq_checklist(id):
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        with g.db.cursor() as c:
            c.execute("DELETE FROM cadq_checklist WHERE id = %s", (id,))
        g.db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadq-checklist/bulk-save', methods=['POST'])
def bulk_save_cadq_checklist():
    if not hasattr(g, 'db') or g.db is None: return jsonify({"error": "DB connection failed"}), 500
    try:
        payload = request.json or {}
        team_name = payload.get('team')
        if team_name == '' or team_name == 'null' or team_name == 'Global':
            team_name = None
            
        items = payload.get('items', [])
        if not isinstance(items, list):
            return jsonify({"error": "Items must be a list"}), 400

        with g.db.cursor() as c:
            submitted_ids = [int(item['id']) for item in items if item.get('id')]
            
            if team_name is None:
                if submitted_ids:
                    format_strings = ','.join(['%s'] * len(submitted_ids))
                    c.execute(f"DELETE FROM cadq_checklist WHERE team_name IS NULL AND id NOT IN ({format_strings})", tuple(submitted_ids))
                else:
                    c.execute("DELETE FROM cadq_checklist WHERE team_name IS NULL")
            else:
                if submitted_ids:
                    format_strings = ','.join(['%s'] * len(submitted_ids))
                    c.execute(f"DELETE FROM cadq_checklist WHERE team_name = %s AND id NOT IN ({format_strings})", (team_name,) + tuple(submitted_ids))
                else:
                    c.execute("DELETE FROM cadq_checklist WHERE team_name = %s", (team_name,))
            
            for i, item in enumerate(items):
                item_id = item.get('id')
                seq_nr = item.get('seq_nr', '')
                standard_ref = item.get('standard_ref', '')
                part_val = item.get('part_val', '')
                piping_val = item.get('piping_val', '')
                welded_val = item.get('welded_val', '')
                other_val = item.get('other_val', '')
                ferro_val = item.get('ferro_val', '')
                non_ferro_val = item.get('non_ferro_val', '')
                casted_machined_val = item.get('casted_machined_val', '')
                machined_non_casted_val = item.get('machined_non_casted_val', '')
                sheet_metal_val = item.get('sheet_metal_val', '')
                foam_decals_val = item.get('foam_decals_val', '')
                assembly_val = item.get('assembly_val', '')
                instruction_val = item.get('instruction_val', '')
                information_val = item.get('information_val', '')
                safety_labels_val = item.get('safety_labels_val', '')
                display_order = item.get('display_order', i + 1)
                
                if not item_id and standard_ref:
                    if team_name is None:
                        c.execute("SELECT id FROM cadq_checklist WHERE standard_ref = %s AND team_name IS NULL", (standard_ref,))
                    else:
                        c.execute("SELECT id FROM cadq_checklist WHERE standard_ref = %s AND team_name = %s", (standard_ref, team_name))
                    row = c.fetchone()
                    if row:
                        item_id = row[0] if isinstance(row, tuple) else row['id']
                
                if item_id:
                    sql = """
                        UPDATE cadq_checklist SET
                        seq_nr=%s, standard_ref=%s, part_val=%s, piping_val=%s, welded_val=%s, other_val=%s,
                        ferro_val=%s, non_ferro_val=%s, casted_machined_val=%s, machined_non_casted_val=%s,
                        sheet_metal_val=%s, foam_decals_val=%s, assembly_val=%s, instruction_val=%s,
                        information_val=%s, safety_labels_val=%s, team_name=%s, display_order=%s
                        WHERE id=%s
                    """
                    c.execute(sql, (
                        seq_nr, standard_ref, part_val, piping_val, welded_val, other_val,
                        ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val,
                        sheet_metal_val, foam_decals_val, assembly_val, instruction_val,
                        information_val, safety_labels_val, team_name, display_order, item_id
                    ))
                else:
                    sql = """
                        INSERT INTO cadq_checklist (
                            seq_nr, standard_ref, part_val, piping_val, welded_val, other_val, 
                            ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val, 
                            sheet_metal_val, foam_decals_val, assembly_val, instruction_val, 
                            information_val, safety_labels_val, team_name, display_order
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                    """
                    c.execute(sql, (
                        seq_nr, standard_ref, part_val, piping_val, welded_val, other_val,
                        ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val,
                        sheet_metal_val, foam_decals_val, assembly_val, instruction_val,
                        information_val, safety_labels_val, team_name, display_order
                    ))
        g.db.commit()
        return jsonify({"success": True, "count": len(items)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- Support Request Endpoint & Helper ----------------- #
def send_support_email(name: str, emp_id: str, team: str, user_message: str):
    """
    Sends support request notification email to anuj.khande@atlascopco.com
    """
    try:
        to_email = "anuj.khande@atlascopco.com"
        subject = f"Support Request from {name} ({emp_id})"
        
        body = f"""Hello Admin,

A new Support / Feedback request has been submitted through the DrawLogAI Portal.

User Details:
----------------------------------------
Name     : {name}
Emp ID   : {emp_id}
Team     : {team or 'N/A'}
Submitted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Message / Issue Description:
----------------------------------------
{user_message}

----------------------------------------
Regards,
Atlas Copco DrawLogAI Portal
"""

        server = get_smtp_server()
        msg = MIMEMultipart()
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()
        print(f"[SUCCESS] Support notification email sent to {to_email}")
    except Exception as e:
        print("[ERROR] Failed to send support notification email:", e)


@app.route('/api/support', methods=['POST'])
def submit_support_request():
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        emp_id = (data.get('emp_id') or '').strip()
        team = (data.get('team') or '').strip()
        message = (data.get('message') or '').strip()

        if not name or not emp_id or not message:
            return jsonify({"error": "Name, Emp ID, and Message are required fields"}), 400

        # Save to database if available
        if hasattr(g, 'db') and g.db is not None:
            try:
                with g.db.cursor() as c:
                    c.execute("""
                        CREATE TABLE IF NOT EXISTS support_requests (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            name VARCHAR(255) NOT NULL,
                            emp_id VARCHAR(100) NOT NULL,
                            team VARCHAR(100),
                            message TEXT NOT NULL,
                            status VARCHAR(50) DEFAULT 'Open',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    c.execute("""
                        INSERT INTO support_requests (name, emp_id, team, message)
                        VALUES (%s, %s, %s, %s)
                    """, (name, emp_id, team, message))
                g.db.commit()
            except Exception as db_err:
                print(f"[WARN] Support request DB save error: {db_err}")

        # Send notification email to anuj.khande@atlascopco.com
        send_support_email(name, emp_id, team, message)

        return jsonify({"success": True, "message": "Support request submitted successfully"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Canvas end
if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
    # serve(app, port=5000, threads=4)
