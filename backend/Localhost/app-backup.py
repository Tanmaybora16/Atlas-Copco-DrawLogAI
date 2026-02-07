from tkinter import messagebox
from flask import Flask, jsonify, request, send_file, Response, g
from flask_cors import CORS
import os, base64, traceback
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
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import ast
from collections import Counter
import re
import calendar
import bcrypt
import secrets
from werkzeug.utils import safe_join
import io
import time



pyt.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
CORS(app
# origins=[
#     "https://drawlogai.atlascopco.group",
#     "http://drawlogai.atlascopco.group"
# ]
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "error_code_classifier_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "tfidf_vectorizer.pkl")

# def connect_to_db():
#     try:
#         db = pymysql.connect(
#             host="localhost",
#             user="root",
#             password="root",
#             database="error_db",
#         )
        
#         with db.cursor() as c:
#             # If timezone tables aren’t loaded, use '+05:30'
#             c.execute("SET time_zone = '+05:30'")
#         return db
#     except pymysql.MySQLError as err:
#         print(f"Database connection failed: {err}")
#         return None

def connect_to_db():
    for i in range(10):  # retry logic
        try:
            db = pymysql.connect(
                host=os.getenv("DB_HOST", "localhost"),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASSWORD", "root"),
                database=os.getenv("DB_NAME", "error_db"),
                connect_timeout=5,
                autocommit=False,
                charset='utf8mb4',
                init_command="SET sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'",
            )
            print("✅ Database connected")
            return db
        except Exception as e:
            print("⏳ Waiting for DB...", e)
            time.sleep(3)

    print("❌ Database connection failed after retries")
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
EMAIL_SENDER = "Errorloggingportal@atlascopco.com"
SMTP_SERVER = "smtp.onevirtualoffice.local"  
SMTP_PORT = 25  

# EMAIL_SENDER = "atlascopcotestmail2025@gmail.com"
# EMAIL_PASSWORD = "pwbd zgow smzm ywza"
# SMTP_SERVER = "smtp.gmail.com"  # e.g., "smtp.gmail.com"
# SMTP_PORT = 587  # Use 465 for SSL, 587 for TLS


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



@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 1000
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 2000

    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)
    
    annotations = extract_annotations(file_path)
    predictions = predict_error(annotations)

    return jsonify({
        'message': 'File processed successfully',
        'file_name': file.filename,
        'file_path': file_path,
        'extracted_comments': annotations,
        'predicted_errors': predictions,
    })


DEBUG_RETURN_ERRORS = True  # ← set False after you’re done diagnosing

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
            drawing_id = f"DR_{design_no_raw}"
            creator_id = str(form_data["creatorId"]).strip()
            reviewerName = str(form_data["reviewerName"]).strip()
            if not reviewerName.upper().startswith("EMP_"):
                reviewerName = f"EMP_{reviewerName}"

            revision_no_int = int(str(form_data["revisionNo"]).strip())
            revision_no_txt = f"{revision_no_int:02d}"

            from datetime import datetime
            from pytz import timezone

            IST = timezone('Asia/Kolkata')

            def get_current_ist_date():
                return datetime.now(IST).date()
            # Use this instead of datetime.today()
            reviewed_date = get_current_ist_date()
            drawing_Type = str(form_data["drawingType"]).strip()
            decision = (str(form_data.get("decision", "")).strip() or "approve").lower()
            division = str(form_data["division"]).strip()
            pc = str(form_data["pc"]).strip()

        except Exception as e:
            return dbg_fail("parse-normalize", e, extra={"form_data": form_data}, code=400)

        error_codes = payload.get("predicted_errors", []) or []
        extracted_comments = payload.get("extracted_comments", []) or []

        # PDF bytes
        pdf_bytes = None
        pdf_filename = f"{drawing_id}-{revision_no_txt}.pdf"
        try:
            if payload.get("file_bytes_b64"):
                pdf_bytes = base64.b64decode(payload["file_bytes_b64"])
            else:
                file_path = (payload.get("file_path") or "").strip()
                if file_path and os.path.exists(file_path):
                    with open(file_path, "rb") as f:
                        pdf_bytes = f.read()
        except Exception as e:
            return dbg_fail("pdf-load", e, extra={"have_b64": bool(payload.get("file_bytes_b64")), "file_path": payload.get("file_path")}, code=400)

        # -------- DB work --------
        try:
            cursor = g.db.cursor()
        except Exception as e:
            return dbg_fail("cursor", e)

        # 0) ensure a row in drawings (⚠ if your drawings table has NOT NULL columns without defaults, this will fail)
        try:
            cursor.execute("SELECT 1 FROM drawings WHERE drawing_ID = %s", (drawing_id,))
            if not cursor.fetchone():
                # If your schema requires more fields, add them explicitly here.
                cursor.execute("INSERT INTO drawings (drawing_ID) VALUES (%s)", (drawing_id,))
        # except pymysql.MySQLError as e:
        #     return dbg_fail("drawings-upsert", e, extra={"drawing_id": drawing_id})
        except Exception as e:
          import traceback
          print("ERROR TYPE:", type(e))
          print("ERROR ARGS:", e.args)
          traceback.print_exc()
          raise

        # 1) ensure creator table exists with correct columns
        try:
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS `{creator_id}` (
                    Drawing_ID VARCHAR(255) NOT NULL,
                    Revision_num INT NOT NULL,
                    Error_codes VARCHAR(255),
                    Reviewer_EMP_ID VARCHAR(255),
                    Review_Date DATE,
                    Decision VARCHAR(255),
                    PRIMARY KEY (Drawing_ID, Revision_num)
                )
            """)
        except pymysql.MySQLError as e:
            return dbg_fail("creator-table-create", e, extra={"creator_id": creator_id})

        # 2) prevent dup for (Drawing_ID, Revision_num) in creator table
        try:
            cursor.execute(f"SELECT 1 FROM `{creator_id}` WHERE Drawing_ID = %s AND Revision_num = %s",
                           (drawing_id, revision_no_int))
            if cursor.fetchone():
                return dbg_fail("creator-dup-check", "Duplicate Revision Number for the same Drawing ID",
                                extra={"creator_id": creator_id, "drawing_id": drawing_id, "rev": revision_no_int}, code=409)
        except pymysql.MySQLError as e:
            return dbg_fail("creator-dup-query", e, extra={"creator_id": creator_id})

        # 3) insert into creator table
        try:
           cursor.execute(
            f"""
            INSERT INTO `{creator_id}`
                (Drawing_ID, Revision_num, Error_codes, Reviewer_EMP_ID, Review_Date, Decision)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                drawing_id,
                revision_no_int,
                ",".join(error_codes) if error_codes else "",
                reviewerName,
                reviewed_date,
                decision,
            )
        )

        except pymysql.MySQLError as e:
            return dbg_fail("creator-insert", e, extra={"creator_id": creator_id})

        # 4) ensure drawing table exists with correct columns (incl. MEDIUMBLOB)
        try:
            cursor.execute(f"SHOW TABLES LIKE %s", (drawing_id,))
            if not cursor.fetchone():
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS `{drawing_id}` (
                        Revision_num INT PRIMARY KEY,
                        Reviewer_EMP_ID VARCHAR(255),
                        Creator_EMP_ID VARCHAR(255),
                        Error_codes VARCHAR(255),
                        Date DATE,
                        Drawing_type VARCHAR(255),
                        Decision VARCHAR(255),
                        Drawing_PDF MEDIUMBLOB
                    )
                """)
        except pymysql.MySQLError as e:
            return dbg_fail("drawing-table-create", e, extra={"drawing_id": drawing_id})

        # 5) insert into drawing table
        try:
            cursor.execute(
                f"""
                INSERT INTO `{drawing_id}`
                    (Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Error_codes, Date, Drawing_type, Decision, Drawing_PDF)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    revision_no_int,
                    reviewerName,
                    creator_id,
                    ",".join(error_codes) if error_codes else "",
                    reviewed_date,
                    drawing_Type,
                    decision,
                    pdf_bytes  # may be None → NULL
                )
            )
        except pymysql.MySQLError as e:
            return dbg_fail("drawing-insert", e, extra={"drawing_id": drawing_id, "rev": revision_no_int})

        # 6) error aggregation table
        try:
            reviewed_datetime = datetime.strptime(str(form_data["reviewedDate"]).strip(), "%Y-%m-%d")
            month_year = reviewed_datetime.strftime("%m_%Y")
            error_table = f"EC_{month_year}"

            cursor.execute("SHOW TABLES LIKE %s", (error_table,))
            if not cursor.fetchone():
                cols = [f'P{i} INT DEFAULT 0' for i in list(range(1, 21)) + [22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 46, 47, 50, 51, 57, 58, 59, 42, 43, 44, 48, 49, 70]]
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS `{error_table}` (
                        Division VARCHAR(50) NOT NULL,
                        PC VARCHAR(50) NOT NULL,
                        {', '.join(cols)},
                        Approved_Drawings INT DEFAULT 0,
                        Rejected_Drawings INT DEFAULT 0,
                        PRIMARY KEY (Division, PC)
                    )
                """)
                # seed pairs (shortened for brevity — keep your full list)
                division_pc_pairs = [
                    ("IAT", ["BQR", "API", "WUX", "COX", "PNE", "FRJ", "UTY", "TRD", "ITJ", "ITR"]),
                    ("OFA", ["API", "WUX", "COX", "PNE", "UTY", "TRD", "ITJ", "PNB", "Crepelle", "UTF", "APF", "OFA STD"]),
                    ("CTS", ["APC"]),
                    ("VIN", ["Edwards India (IPG)", "UWH", "PNE", "ESF", "UVC", "WUX", "BQR"]),
                ]
                for div, pcs in division_pc_pairs:
                    for pc_name in pcs:
                        cursor.execute(f"INSERT IGNORE INTO `{error_table}` (Division, PC) VALUES (%s, %s)", (div, pc_name))

            cursor.execute(f"SELECT 1 FROM `{error_table}` WHERE Division=%s AND PC=%s", (division, pc))
            if not cursor.fetchone():
                cursor.execute(f"INSERT INTO `{error_table}` (Division, PC) VALUES (%s, %s)", (division, pc))

            if error_codes and error_codes != ["No errors detected"]:
                for code in error_codes:
                    cursor.execute(
                        f"UPDATE `{error_table}` SET `{code}` = `{code}` + 1 WHERE Division=%s AND PC=%s",
                        (division, pc)
                    )

            if decision == "reject":
                cursor.execute(
                    f"UPDATE `{error_table}` SET Rejected_Drawings = Rejected_Drawings + 1 WHERE Division=%s AND PC=%s",
                    (division, pc)
                )
            else:
                cursor.execute(
                    f"UPDATE `{error_table}` SET Approved_Drawings = Approved_Drawings + 1 WHERE Division=%s AND PC=%s",
                    (division, pc)
                )
        except pymysql.MySQLError as e:
            return dbg_fail("ec-table-update", e, extra={"error_table": error_table, "division": division, "pc": pc})

        # 7) email on reject (kept)
        try:
            cursor.execute("SELECT EMP_email, EMP_Name FROM Employees WHERE emp_id = %s", (creator_id,))
            row = cursor.fetchone()
            if not row:
                g.db.rollback()
                return dbg_fail("creator-lookup", "Creator not found", extra={"creator_id": creator_id}, code=404)

            creator_email, creator_name = row[0], row[1]

            if decision == "reject":
                try:
                    send_email(
                        to_email=creator_email,
                        drawing_id=drawing_id,
                        revision_no=revision_no_int,
                        reviewer_name=reviewerName,
                        reviewed_date=reviewed_date,
                        error_codes=error_codes,
                        extracted_comments=extracted_comments,
                        decision=decision,
                        drawing_Type=drawing_Type,
                        creator_name=creator_name,
                        pdf_bytes=pdf_bytes,
                        pdf_filename=pdf_filename
                    )
                except TypeError:
                    # legacy signature fallback
                    send_email(
                        to_email=creator_email,
                        drawing_id=drawing_id,
                        revision_no=revision_no_int,
                        reviewer_name=reviewerName,
                        reviewed_date=reviewed_date,
                        error_codes=error_codes,
                        extracted_comments=extracted_comments,
                        decision=decision,
                        file_path=(payload.get("file_path") or ""),
                        drawing_Type=drawing_Type,
                        creator_name=creator_name
                    )
        except Exception as e:
            # Don’t fail the whole transaction because of email
            print(" email-send failed:", e)

        try:
            g.db.commit()
        except pymysql.MySQLError as e:
            return dbg_fail("commit", e)

        return jsonify({"ok": True, "message": "Data saved successfully", "drawing_id": drawing_id, "revision": revision_no_int})

    except Exception as e:
        print(" Uncaught in /submit:", e)
        traceback.print_exc()
        return dbg_fail("uncaught", e, code=500)

    
    
def send_email(to_email, drawing_id, revision_no, reviewer_name, reviewed_date, error_codes, extracted_comments, decision, file_path, drawing_Type, creator_name):
    try:
        # Set up the SMTP server
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        # server.starttls()
        # server.login(EMAIL_SENDER, EMAIL_PASSWORD)

        # Email content
        subject = f"Drawing Review Notification :- {drawing_id} (Revision number :- {revision_no})"
        comments_text = '\n \t\t\t\t\t\t'.join(extracted_comments) if extracted_comments else 'No Comments'

        body = f"""
        Dear {to_email},

        The following drawing review has been completed:

        Drawing ID: {drawing_id}
        Revision No: {revision_no}
        Reviewer: {reviewer_name}
        Date: {reviewed_date}
        Drawing Type: {drawing_Type}
        
        Errors: {', '.join(error_codes) if error_codes else 'None'}
        Extracted Comments: {comments_text}
        Decision: {decision.upper()}

        The reviewed document is attached for your reference.

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
        if file_path and os.path.exists(file_path):
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

    # Fetch both emp_id and emp_name
    cursor.execute("SELECT emp_id, emp_name FROM employees")
    employees = cursor.fetchall()

    cursor.close()

    # Format response with both fields
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
    cursor.execute("SELECT emp_PC, emp_division, emp_team, emp_email FROM employees WHERE emp_id = %s", (emp_id,))
    employee = cursor.fetchone()
    cursor.close()

    if employee:
        return jsonify({
            "emp_PC": employee[0],
            "emp_division": employee[1],
            "emp_team": employee[2],
            "emp_email" : employee[3]
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
                SELECT username, password, access_type
                  FROM login
                 WHERE username = %s
                 LIMIT 1
            """, (username,))
            row = cursor.fetchone()

        if not row:
            return jsonify({"success": False, "message": "Invalid Credentials"}), 401

        db_username, db_password_hash, access_type = row

        import bcrypt
        ok = False
        try:
            ok = bcrypt.checkpw(password.encode('utf-8'), db_password_hash.encode('utf-8'))
        except Exception:
            ok = False

        if not ok:
            return jsonify({"success": False, "message": "Invalid Credentials"}), 401

        return jsonify({
            "success": True,
            "status": "OK",
            "access_type": access_type,
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
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        # server.starttls()
        # server.login(EMAIL_SENDER, EMAIL_PASSWORD)

        subject = "Your OTP for Password Reset (valid for 5 minutes)"
        body = f"""Dear User ({emp_id}),

Your one-time password (OTP) for resetting your Atlas Copco account password is:

    {otp_plain}

This code will expire in 5 minutes.

If you did not request this, please ignore this email.

This is a system generated email. Do not reply to this email.

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
    - Validate emp_id exists in login
    - Cross-check email in employees (case-insensitive)
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

        # 1) Check user exists in login
        with g.db.cursor() as c:
            c.execute("SELECT 1 FROM login WHERE username=%s LIMIT 1", (emp_id,))
            if not c.fetchone():
                return jsonify({"success": False, "message": "Invalid Emp_ID"}), 404

        # 2) Verify email matches employees table
        with conn.cursor() as c:
            c.execute("SELECT EMP_Email FROM employees WHERE Emp_ID=%s LIMIT 1", (emp_id,))
            row = c.fetchone()
        if not row or not row[0] or row[0].strip().lower() != email.lower():
            return jsonify({"success": False, "message": "Email does not match our records"}), 400

        # 3) Generate 4-digit OTP
        otp_int = secrets.randbelow(9000) + 1000  # 1000..9999
        otp_plain = str(otp_int)

        # 4) Hash OTP
        otp_hash = bcrypt.hashpw(otp_plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # 5) Upsert OTP row, expire in 5 minutes (use MySQL NOW() in IST)
        with g.db.cursor() as c:
            c.execute("""
                INSERT INTO login_otp (username, purpose, otp, expires_at, consumed)
                VALUES (%s, 'password_reset', %s, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0)
                ON DUPLICATE KEY UPDATE
                    otp = VALUES(otp),
                    expires_at = VALUES(expires_at),
                    consumed = 0
            """, (emp_id, otp_hash))
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

        # Fetch active OTP row (not expired)
        with g.db.cursor() as c:
            c.execute("""
                SELECT otp, consumed
                  FROM login_otp
                 WHERE username=%s
                   AND purpose='password_reset'
                   AND expires_at > NOW()
                 LIMIT 1
            """, (emp_id,))
            row = c.fetchone()

        if not row:
            # Optional cleanup of expired rows for this user
            with g.db.cursor() as c2:
                c2.execute("DELETE FROM login_otp WHERE username=%s AND purpose='password_reset' AND expires_at <= NOW()", (emp_id,))
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

        # Fetch active OTP row (not expired)
        with g.db.cursor() as c:
            c.execute("""
                SELECT otp, consumed
                  FROM login_otp
                 WHERE username=%s
                   AND purpose='password_reset'
                   AND expires_at > NOW()
                 LIMIT 1
            """, (emp_id,))
            row = c.fetchone()
        if not row:
            with g.db.cursor() as c2:
                c2.execute("DELETE FROM login_otp WHERE username=%s AND purpose='password_reset' AND expires_at <= NOW()", (emp_id,))
                g.db.commit()
            return jsonify({"success": False, "message": "OTP expired or not found. Please resend a new OTP."}), 400

        otp_hash, consumed = row
        if consumed:
            return jsonify({"success": False, "message": "OTP already used. Please request a new one."}), 400

        # Verify OTP
        if not bcrypt.checkpw(otp_in.encode('utf-8'), otp_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "Invalid OTP"}), 401

        # Prevent reusing previous password
        with conn.cursor() as c:
            c.execute("SELECT password FROM login WHERE username=%s LIMIT 1", (emp_id,))
            row2 = c.fetchone()
        if not row2:
            return jsonify({"success": False, "message": "Account not found"}), 404

        current_hash = row2[0]
        try:
            if bcrypt.checkpw(new_password.encode('utf-8'), current_hash.encode('utf-8')):
                return jsonify({"success": False, "message": "New password cannot be the same as the previous password."}), 400
        except Exception:
            pass

        # Get user's email for notification
        with conn.cursor() as c:
            c.execute("SELECT EMP_Email FROM employees WHERE Emp_ID=%s LIMIT 1", (emp_id,))
            row_email = c.fetchone()
        user_email = row_email[0] if row_email else None

        # Update password in login and delete OTP
        new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        with g.db.cursor() as c:
            c.execute("UPDATE login SET password=%s WHERE username=%s", (new_hash, emp_id))
            c.execute("DELETE FROM login_otp WHERE username=%s AND purpose='password_reset'", (emp_id,))
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
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        # server.starttls()
        # server.login(EMAIL_SENDER, EMAIL_PASSWORD)

        subject = "Your Atlas Copco AI Error Logging Portal account password was changed"
        body = f"""Dear User ({emp_id}),

This is a confirmation that the password for your Atlas Copco AI Error Logging account was changed successfully.

If you did NOT initiate this change, please contact your HR department immediately.

This is a system generated email. Do not reply to this email.


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

        # Fetch current hash
        with g.db.cursor() as c:
            c.execute("SELECT password FROM login WHERE username=%s LIMIT 1", (emp_id,))
            row = c.fetchone()
        if not row:
            return jsonify({"success": False, "message": "Account not found"}), 404

        current_hash = row[0]
        # Verify current password
        if not bcrypt.checkpw(current_password.encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "Current password is incorrect"}), 401

        # Prevent reusing the previous password
        if bcrypt.checkpw(new_password.encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({"success": False, "message": "New password cannot be the same as the previous password."}), 400

        # Update to new hash
        new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        with g.db.cursor() as c:
            c.execute("UPDATE login SET password=%s WHERE username=%s", (new_hash, emp_id))
        g.db.commit()

        # Email the user (if we can find the email)
        with g.db.cursor() as c:
            c.execute("SELECT EMP_Email FROM employees WHERE Emp_ID=%s LIMIT 1", (emp_id,))
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
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        # server.starttls()
        # server.login(EMAIL_SENDER, EMAIL_PASSWORD)

        subject = "Welcome to Atlas Copco Error Logging"
        body = f"""Dear User,

Your Atlas Copco AI Error Logging account is ready.

Username: {emp_id}
Initial Password: Use your registered office email address

Please log in to the portal and change your password immediately after logging in.

If you did not expect this account, please contact your administrator.

This is a system generated email. Do not reply to this email.

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

        table_name = f"{emp_id}"

        # Check if employee already exists
        cursor.execute("SELECT 1 FROM employees WHERE Emp_ID = %s", (table_name,))
        if cursor.fetchone():
            return jsonify({"success": False, "message": "Employee ID already exists"}), 4003

        # Insert employee row
        cursor.execute("""
            INSERT INTO employees (Emp_ID, Emp_Name, EMP_Email, Emp_Division, Emp_PC, Emp_Team)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (table_name, emp_name, emp_email, emp_division, emp_pc, emp_team))

        # Create per-employee table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS `{table_name}` (
            Drawing_ID VARCHAR(255),
            Revision_num INT,
            Error_codes VARCHAR(255),
            Reviewer_EMP_ID VARCHAR(255),
            Review_Date DATE,
            Decision VARCHAR(10),
            PRIMARY KEY (Drawing_ID, Revision_num)
        );
        """)

        # Create/refresh login credentials: username=EMP_<id>, password=hash(email), access_type='Employee'
        password_hash = bcrypt.hashpw(emp_email.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("""
            INSERT INTO login (username, password, access_type)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                password = VALUES(password),
                access_type = VALUES(access_type)
        """, (table_name, password_hash, 'Employee'))

        g.db.commit()  # ✅ commit DB changes before emailing

        # Send welcome email with username (EMP_<id>) and instructions
        try:
            send_welcome_credentials_email(emp_email, table_name)
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
        
        # Ensure Emp_ID is not changed
        cursor.execute("SELECT * FROM employees WHERE Emp_ID = %s", (emp_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Invalid Employee ID!"}), 400
        
        # Update employee details
        cursor.execute("""
            UPDATE employees
            SET Emp_Name=%s, EMP_Email=%s, Emp_Division=%s, Emp_PC=%s, Emp_Team=%s
            WHERE Emp_ID=%s
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
        # Basic whitelist for the per-employee table identifier
        # (your Emp_IDs look like EMP_123 etc.)
        if not re.fullmatch(r'[A-Za-z0-9_]+', emp_id):
            return jsonify({"error": "Invalid employee id"}), 400

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500
        cursor = g.db.cursor()

        # 1) Clean up auth artifacts first
        cursor.execute("DELETE FROM login_otp WHERE username = %s", (emp_id,))
        cursor.execute("DELETE FROM login WHERE username = %s", (emp_id,))

        # 2) Drop the per-employee table
        cursor.execute(f"DROP TABLE IF EXISTS `{emp_id}`")

        # 3) Remove from employees
        cursor.execute("DELETE FROM employees WHERE Emp_ID = %s", (emp_id,))

        g.db.commit()
        return jsonify({"success": True, "message": "Employee, login, and related data deleted successfully!"}), 200

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
        cursor.execute("SELECT * FROM employees")
        employees = cursor.fetchall()
        return jsonify(employees)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        
# Employee page code end..............


@app.route('/api/monthly-drawing-status', methods=['GET'])
def monthly_drawing_status():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        # Extract filters from request
        division = request.args.get('division')
        pc = request.args.get('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Fetch all EC tables
        cursor.execute("SHOW TABLES LIKE 'EC_%_%'")
        tables = [table[0] for table in cursor.fetchall()]

        table_date_map = {}
        for table in tables:
            try:
                # Extract MM and YYYY from table name
                parts = table.split('_')
                month = int(parts[1])
                year = int(parts[2])
                table_dt = datetime(year, month, 1)
                table_date_map[table] = table_dt
            except:
                continue  # Skip if format is incorrect

        filtered_tables = []
        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")

            for table, dt in table_date_map.items():
                if start_dt <= dt <= end_dt:
                    filtered_tables.append((table, dt))
        else:
            # Default to last 12 months including current month
            current = datetime.now().replace(day=1)
            last_12_months = [(current - timedelta(days=calendar.monthrange(current.year, current.month)[1]*i)).replace(day=1) for i in range(12)]
            last_12_months_set = set(dt.strftime('%m-%Y') for dt in last_12_months)

            for table, dt in table_date_map.items():
                if dt.strftime('%m-%Y') in last_12_months_set:
                    filtered_tables.append((table, dt))

        # Sort tables by date ascending
        filtered_tables.sort(key=lambda x: x[1])

        results = {}
        for table, dt in filtered_tables:
            query = f"SELECT COALESCE(SUM(Approved_Drawings), 0), COALESCE(SUM(Rejected_Drawings), 0) FROM {table}"
            filters = []
            if division:
                filters.append(f"Division = '{division}'")
            if pc:
                filters.append(f"PC = '{pc}'")
            if filters:
                query += " WHERE " + " AND ".join(filters)

            cursor.execute(query)
            row = cursor.fetchone()
            label = dt.strftime('%b-%Y')  # Format: Apr-2025
            results[label] = {
                "approved": row[0] or 0,
                "rejected": row[1] or 0
            }

        return jsonify(results)
    finally:
        cursor.close()
        
# Bar chart code (reports page number 1)
@app.route('/api/monthly-error-report', methods=['GET'])
def monthly_error_report():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    cursor = g.db.cursor()
    try:
        selected_divisions = request.args.getlist('division')
        selected_pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        cursor.execute("SHOW TABLES LIKE 'EC_%_%'")
        tables = [row[0] for row in cursor.fetchall()]
        results = []

        # Handle default: last 12 months including current
        if not start_date or not end_date:
            today = datetime.today().replace(day=1)
            last_12_months = [(today - timedelta(days=30 * i)).strftime('%m-%Y') for i in range(12)]
            valid_months = set(last_12_months)
        else:
            start_fmt = datetime.strptime(start_date, '%Y-%m-%d')
            end_fmt = datetime.strptime(end_date, '%Y-%m-%d')
            valid_months = set()
            while start_fmt <= end_fmt:
                valid_months.add(start_fmt.strftime('%m-%Y'))
                # Move to next month
                start_fmt = (start_fmt.replace(day=28) + timedelta(days=4)).replace(day=1)

        for table in tables:
            parts = table.split("_")
            if len(parts) != 3:
                continue
            table_month_year = f"{parts[1]}-{parts[2]}"
            if table_month_year not in valid_months:
                continue

            cursor.execute(f"SHOW COLUMNS FROM {table}")
            columns = [row[0] for row in cursor.fetchall()]
            error_columns = [col for col in columns if col.startswith('P')]

            if not error_columns:
                continue

            where_clause = ""
            conditions = []
            if selected_divisions:
                conditions.append(f"division IN ({', '.join([repr(div) for div in selected_divisions])})")
            if selected_pcs:
                conditions.append(f"pc IN ({', '.join([repr(pc) for pc in selected_pcs])})")
            if conditions:
                where_clause = f"WHERE {' AND '.join(conditions)}"

            query = f"SELECT SUM({'+'.join(error_columns)}) AS total_errors FROM {table} {where_clause}"
            cursor.execute(query)
            total_errors = cursor.fetchone()[0] or 0

            results.append({"month": table_month_year, "total_errors": total_errors})

        # Sort results by date (YYYY-MM)
        def sort_key(entry):
            return datetime.strptime(entry['month'], '%m-%Y')
        results.sort(key=sort_key)

        return jsonify(results)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Bar chart code (reports page number 2)
from datetime import datetime, timedelta

@app.route('/api/trend-error-report', methods=['GET'])
def trend_error_report():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    cursor = g.db.cursor()
    try:
        selected_divisions = request.args.getlist('division')
        selected_pcs = request.args.getlist('pc')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        print(f"Filters - Divisions: {selected_divisions}, PCs: {selected_pcs}, Start Date: {start_date}, End Date: {end_date}")

        cursor.execute("SHOW TABLES LIKE 'EC_%_%'")
        tables = [row[0] for row in cursor.fetchall()]
        error_totals = {}

        # Create set of valid months based on filter or default to last 12 months
        if not start_date or not end_date:
            today = datetime.today().replace(day=1)
            valid_months = set(
                (today - timedelta(days=30 * i)).strftime('%m-%Y') for i in range(12)
            )
        else:
            start_fmt = datetime.strptime(start_date, '%Y-%m-%d')
            end_fmt = datetime.strptime(end_date, '%Y-%m-%d')
            valid_months = set()
            while start_fmt <= end_fmt:
                valid_months.add(start_fmt.strftime('%m-%Y'))
                start_fmt = (start_fmt.replace(day=28) + timedelta(days=4)).replace(day=1)

        for table in tables:
            parts = table.split("_")
            if len(parts) != 3:
                continue
            table_month_year = f"{parts[1]}-{parts[2]}"
            if table_month_year not in valid_months:
                continue

            cursor.execute(f"SHOW COLUMNS FROM {table}")
            columns = [row[0] for row in cursor.fetchall()]
            error_columns = [col for col in columns if col.startswith('P')]

            if not error_columns:
                continue

            where_clause = ""
            conditions = []
            if selected_divisions:
                conditions.append(f"division IN ({', '.join([repr(div) for div in selected_divisions])})")
            if selected_pcs:
                conditions.append(f"pc IN ({', '.join([repr(pc) for pc in selected_pcs])})")
            if conditions:
                where_clause = f"WHERE {' AND '.join(conditions)}"

            for col in error_columns:
                query = f"SELECT SUM({col}) FROM {table} {where_clause}"
                cursor.execute(query)
                count = cursor.fetchone()[0] or 0
                error_totals[col] = error_totals.get(col, 0) + count

        results = sorted(
            [{"error_code": key, "count": value} for key, value in error_totals.items()],
            key=lambda x: x["count"], reverse=True
        )[:10]  # Top 10 error codes

        return jsonify(results)

    except Exception as e:
        print(f"Error in trend_error_report: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

 

# Line chart code (reports page number 2)
@app.route('/api/drawings-trend', methods=['GET'])
def get_drawings_trend():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500

    cursor = g.db.cursor()
    try:
        # Extract filters
        division = request.args.get('division', '').strip()
        pc = request.args.get('pc', '').strip()
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

        # Generate month-year table names in the format EC_MM_YYYY
        month_table_names = []
        current_dt = start_dt
        while current_dt <= end_dt:
            table_name = f"EC_{current_dt.strftime('%m_%Y')}"
            month_label = current_dt.strftime('%b %Y')  # Example: Mar 2025
            month_table_names.append((table_name, month_label))
            current_dt = current_dt.replace(day=1) + timedelta(days=32)
            current_dt = current_dt.replace(day=1)  # Move to next month start

        # Initialize results for line chart format
        trend_data = {
            "categories": [],  # Labels for X-axis (Month-Year)
            "series": [
                {"name": "Approved Drawings", "data": []},
                {"name": "Rejected Drawings", "data": []}
            ]
        }

        for table, month_label in month_table_names:
            # Check if table exists
            cursor.execute("SHOW TABLES LIKE %s", (table,))
            if not cursor.fetchone():
                continue  # Skip if table doesn't exist

            # Build the query
            query = f"SELECT COALESCE(SUM(Approved_Drawings), 0), COALESCE(SUM(Rejected_Drawings), 0) FROM {table}"
            filters = []
            if division:
                filters.append(f"Division = '{division}'")
            if pc:
                filters.append(f"PC = '{pc}'")

            if filters:
                query += " WHERE " + " AND ".join(filters)

            cursor.execute(query)
            row = cursor.fetchone()
            approved_count = row[0] or 0
            rejected_count = row[1] or 0

            # Append data to response
            trend_data["categories"].append(month_label)
            trend_data["series"][0]["data"].append(approved_count)
            trend_data["series"][1]["data"].append(rejected_count)

        return jsonify(trend_data)
    finally:
        cursor.close()

# Pass Ratio code (reports page number 3)
@app.route('/get-pass-ratio', methods=['POST'])
def get_pass_ratio():
    data = request.json
    division = data.get('division', '')
    pc = data.get('pc', '')
    start_date = data.get('start_date', '')
    end_date = data.get('end_date', '')

    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    cursor = g.db.cursor()

    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'error_db' AND TABLE_NAME LIKE 'EC_%'")
    tables = [row[0] for row in cursor.fetchall()]

    current_year = str(datetime.now().year)

    month_abbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    months_map = {str(i+1).zfill(2) + "_" + current_year: {
        "year": current_year,
        "month": month_abbr[i],
        "accepted_drawings": "NA",
        "total_drawings": "NA",
        "pass_ratio": "NA"
    } for i in range(12)}

    if start_date and end_date:
        start_year, start_month = start_date.split("-")[0], start_date.split("-")[1]
        end_year, end_month = end_date.split("-")[0], end_date.split("-")[1]
        filtered_months = {}

        for year in range(int(start_year), int(end_year) + 1):
            for month in range(1, 13):
                month_str = str(month).zfill(2)
                if (year == int(start_year) and month < int(start_month)) or (year == int(end_year) and month > int(end_month)):
                    continue
                filtered_months[f"{month_str}_{year}"] = {
                    "year": str(year),
                    "month": month_abbr[month - 1],
                    "accepted_drawings": "NA",
                    "total_drawings": "NA",
                    "pass_ratio": "NA"
                }
        months_map = filtered_months 

    for table in tables:
        table_parts = table.split('_')  
        if len(table_parts) == 3:
            table_month, table_year = table_parts[1], table_parts[2]
            table_key = f"{table_month}_{table_year}"

            # 🔹 Skip tables not in the filtered range (if filters are applied)
            if start_date and end_date and table_key not in months_map:
                continue

            # 🔹 Construct SQL Query
            query = f"""
            SELECT 
                '{table_year}' AS year,
                '{month_abbr[int(table_month) - 1]}' AS month,  
                SUM(Approved_Drawings) AS accepted_drawings,
                SUM(Approved_Drawings + Rejected_Drawings) AS total_drawings
            FROM {table}
            """
            conditions = []
            if division:
                conditions.append(f"Division = '{division}'")
            if pc:
                conditions.append(f"PC = '{pc}'")
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

            cursor.execute(query)
            result = cursor.fetchone()

            if result:
                year, month, accepted, total = result
                pass_ratio = round((accepted / total) * 100, 2) if total else "NA"

                months_map[table_key] = {
                    "year": year,
                    "month": month,
                    "accepted_drawings": accepted if total else "NA",
                    "total_drawings": total if total else "NA",
                    "pass_ratio": f"{pass_ratio}%" if pass_ratio != "NA" else "NA"
                }
    cursor.close()
    pass_ratio_data = list(months_map.values())
    return jsonify(pass_ratio_data)


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
                return list(ast.literal_eval(s))
            except Exception:
                pass
    # Fallback: comma-separated string "P1,P22"
    return [p.strip() for p in s.split(',') if p.strip()]

@app.route('/api/employee-report', methods=['GET'])
def employee_report():
    employee_id = (request.args.get('employeeId') or '').strip()
    start_date  = (request.args.get('start_date') or '').strip()
    end_date    = (request.args.get('end_date') or '').strip()

    if not employee_id:
        return jsonify({"error": "Employee ID is required"}), 400

    table_name = f"`{employee_id}`"    # e.g., `EMP_357` or `emp_357`

    # NOTE: Column is "Date" in your emp_* tables (see screenshot)
    query = [f"SELECT Drawing_ID, Revision_num, Error_codes, Reviewer_EMP_ID, Review_Date, Decision FROM {table_name}"]
    args = []

    where = []
    if start_date:
        where.append("Review_Date >= %s")
        args.append(start_date)
    if end_date:
        where.append("Review_Date <= %s")
        args.append(end_date)
    if where:
        query.append("WHERE " + " AND ".join(where))
    query.append("ORDER BY Review_Date DESC")
    sql = " ".join(query)

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500
        
        with g.db.cursor() as cur:
            # Fetch rows
            cur.execute(sql, tuple(args))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]

        # Fetch profile info for summary (name/PC/division)
        emp_name = pc = division = ""
        with g.db.cursor() as cur:
            cur.execute("""
                SELECT EMP_Name, emp_PC, emp_division
                FROM Employees
                WHERE emp_id = %s
            """, (employee_id,))
            r = cur.fetchone()
            if r:
                emp_name, pc, division = r[0] or "", r[1] or "", r[2] or ""


        result = []
        for tup in rows:
            row = dict(zip(cols, tup))
            row["Error_codes"] = _parse_error_codes(row.get("Error_codes"))
            # Attach summary fields so the front-end can read from the first row
            row["Employee_name"] = emp_name
            row["PC"] = pc
            row["Division"] = division
            result.append(row)

        return jsonify(result)

    except pymysql.MySQLError as e:
        return jsonify({"error": str(e)}), 500

# Drawing report code(reports page number 5)
@app.route('/api/drawing-report', methods=['GET'])
def drawing_report():
    drawing_id = (request.args.get('drawingId') or '').strip()
    start_date = (request.args.get('start_date') or '').strip()
    end_date   = (request.args.get('end_date') or '').strip()

    if not drawing_id:
        return jsonify({"error": "Drawing ID is required"}), 400

    table_name = f"`{drawing_id}`"  # e.g., `DR_9096998787`

    query = [f"SELECT Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Error_codes, Date, Drawing_type, Decision FROM {table_name}"]
    args = []

    where = []
    if start_date:
        where.append("Date >= %s")
        args.append(start_date)
    if end_date:
        where.append("Date <= %s")
        args.append(end_date)
    if where:
        query.append("WHERE " + " AND ".join(where))
    query.append("ORDER BY Date DESC")
    sql = " ".join(query)

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500
        
        with g.db.cursor() as cur:
            cur.execute(sql, tuple(args))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]

        result = []
        for tup in rows:
            row = dict(zip(cols, tup))
            row["Error_codes"] = _parse_error_codes(row.get("Error_codes"))
            # The drawing table doesn’t have a Drawing_ID column → include it for the UI
            row["Drawing_ID"] = drawing_id
            result.append(row)

        return jsonify(result)

    except pymysql.MySQLError as e:
        return jsonify({"error": str(e)}), 500



# Down button for employee and drawing report pages
@app.route('/api/drawings/<drawing_id>/<int:revision>/download', methods=['GET'])
def download_drawing(drawing_id, revision):
    """
    Returns the PDF blob from the per-drawing table `<drawing_id>` for the given revision.
    """
    table_name = f"`{drawing_id}`"

    try:
        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({'error': 'Database connection error'}), 500
        
        with g.db.cursor() as cur:
            cur.execute(
                f"SELECT Drawing_PDF FROM {table_name} WHERE Revision_num = %s",
                (revision,)
            )
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
        return jsonify({"error": str(e)}), 500

# Get dropdown data for employees in report page
@app.route('/api/employees-dropdown', methods=['GET'])
def get_employee_ids():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection error"}), 500
    
    cursor = g.db.cursor()
    
    try:
        cursor.execute("SELECT EMP_ID FROM employees;")
        employees = [row[0] for row in cursor.fetchall()]
        return jsonify(employees)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Get dropdown data for drawings in report page
@app.route('/api/drawings-dropdown', methods=['GET'])
def get_drawing_ids():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({"error": "Database connection error"}), 500
    
    cursor = g.db.cursor()
    
    try:
        cursor.execute("SELECT drawing_ID FROM drawings;")
        drawings = [row[0] for row in cursor.fetchall()]
        return jsonify(drawings)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()

# Employee reports page column charts(reports page number 4)
# /api/employee-drawing-status — use `Date` column (and case-insensitive Decision)
@app.route('/api/employee-drawing-status', methods=['GET'])
def employee_drawing_status():
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    cursor = g.db.cursor()
    try:
        employee_id = request.args.get('employeeId')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if not employee_id:
            return jsonify({'error': 'Missing employee_id'}), 400

        # Validate employee_id format to prevent SQL injection
        import re
        if not re.match(r'^[A-Za-z0-9_]+$', employee_id):
            return jsonify({'error': 'Invalid employee_id format'}), 400

        cursor.execute("SHOW TABLES LIKE %s", (employee_id,))
        if not cursor.fetchone():
            return jsonify({})

        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            # Default range: last ~6 months
            end_dt = datetime.today()
            # simple month back-off (kept as-is; adjust if you need exact month arithmetic)
            start_month = max(1, end_dt.month - 5)
            start_dt = end_dt.replace(month=start_month)

        # Safely construct the query with the validated table name
        query = f"""
            SELECT
                DATE_FORMAT(Review_Date, '%%m-%%Y') AS month,
                SUM(CASE WHEN LOWER(Decision) = 'approve' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN LOWER(Decision) = 'reject' THEN 1 ELSE 0 END) AS rejected
            FROM `{employee_id}`
            WHERE Review_Date BETWEEN %s AND %s
            GROUP BY DATE_FORMAT(Review_Date, '%%m-%%Y')
            ORDER BY STR_TO_DATE(DATE_FORMAT(Review_Date, '%%m-%%Y'), '%%m-%%Y')
        """

        cursor.execute(query, (start_dt.strftime('%Y-%m-%d'), end_dt.strftime('%Y-%m-%d')))

        results = {}
        rows = cursor.fetchall()
        for row in rows:
            month, approved, rejected = row
            # keys like EC_01_2025
            results[f"EC_{month.replace('-', '_')}"] = {
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
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    cursor = g.db.cursor()
    try:
        employee_id = request.args.get('employeeId')
        drawing_id = request.args.get('drawingId')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # both table types use the same date column name now
    
        if employee_id:
            table_name = f"{employee_id}"
            date_column = "Review_Date"
            limit = 10
        elif drawing_id:
            table_name = f"{drawing_id}"
            date_column = "Date"
            limit = 5
        else:
            return jsonify({"error": "Missing employee_id or drawing_id"}), 400

        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        if not cursor.fetchone():
            return jsonify([])

        # Handle date filters
        date_filter = ""
        date_params = []
        if start_date and end_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                date_filter = f"WHERE `{date_column}` BETWEEN %s AND %s"
                date_params = [start_dt.strftime('%Y-%m-%d'), end_dt.strftime('%Y-%m-%d')]
            except ValueError:
                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        query = f"SELECT Error_codes FROM `{table_name}` {date_filter}"
        cursor.execute(query, tuple(date_params))
        rows = cursor.fetchall()

        # Process and clean error codes
        error_list = []
        for row in rows:
            raw = row[0]
            if raw:
                cleaned = re.sub(r"[\[\]\"']", "", raw)
                codes = [e.strip() for e in cleaned.split(",") if e.strip()]
                for code in codes:
                    if code.lower() not in ["no errors detected", "no error codes", "no error"]:
                        error_list.append(code.upper())

        counter = Counter(error_list)
        top_errors = counter.most_common(limit)

        results = [{"error_code": code, "count": count} for code, count in top_errors]
        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()



# Submission page start .............
def extract_drawing_id_from_name(filename: str) -> str | None:
    """
    '7058609753-01.pdf' -> 'DR_7058609753'
    Take part before the first '-', ignore any rev/extension.
    """
    if not filename:
      return None
    base = filename.rsplit('/', 1)[-1]
    base = base.rsplit('.', 1)[0]
    core = base.split('-', 1)[0]
    if not core:
      return None
    return f"DR_{core}"

def extract_revision_from_name(filename: str) -> int | None:
    """
    Extract revision number from filename.
    '9096998745-1.pdf' -> 1
    '9096998745-01.pdf' -> 1
    '9096998745-10.pdf' -> 10
    Returns None if no revision number is found.
    """
    if not filename:
        return None
    base = filename.rsplit('/', 1)[-1]
    base = base.rsplit('.', 1)[0]
    parts = base.split('-', 1)
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except (ValueError, IndexError):
        return None

def send_single_summary_email(to_email: str, items: list[tuple[str, int]], creator_emp_id: str, creator_name: str):
    """
    items: list of (drawing_id, revision)
    """
    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        # server.starttls()
        # server.login(EMAIL_SENDER, EMAIL_PASSWORD)

        subject = "Drawings ready for review"
        pairs_str = ', '.join([f"{did} - {rev}" for did, rev in items])
        body = f"""Dear Reviewer,

Multiple drawings have been submitted for your review.

Creator EMP_ID: {creator_emp_id}
Creator Name  : {creator_name}

Drawing_ID - Revision Number:
{pairs_str}

Please log in to the portal to review the submissions.

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
    Accepts multipart/form-data:
      - pdfs: multiple PDF files (same key)  <-- REQUIRED
      - creator_emp_id, reviewer_emp_id, reviewer_email  <-- REQUIRED
      - creator_email, division, team, pc, drawing_type, decision, design_no, client_revision_no  <-- optional
    For each file:
      - Parse drawing_ID from filename -> 'DR_<id>'
      - If new: INSERT with Revision_num=1, else UPDATE & increment Revision_num
      - Store proper PDF bytes for that row
    After all: send ONE email to reviewer listing "Drawing_ID - Revision" pairs.
    """
    try:
        files = request.files.getlist('pdfs')
        if not files:
            return jsonify({"success": False, "message": "At least one PDF is required"}), 400

        # shared metadata
        creator_emp_id = (request.form.get('creator_emp_id') or '').strip()
        reviewer_emp_id = (request.form.get('reviewer_emp_id') or '').strip()
        reviewer_email  = (request.form.get('reviewer_email')  or '').strip()

        if not creator_emp_id or not reviewer_emp_id or not reviewer_email:
            return jsonify({"success": False, "message": "creator_emp_id, reviewer_emp_id and reviewer_email are required"}), 400

        division      = (request.form.get('division') or '').strip()
        team          = (request.form.get('team') or '').strip()
        pc            = (request.form.get('pc') or '').strip()
        drawing_type  = (request.form.get('drawing_type') or '').strip()
        checklist     = (request.form.get('decision') or '').strip()
        # optional extras (not used in DB logic here)
        _design_no    = (request.form.get('design_no') or '').strip()
        _client_rev   = (request.form.get('client_revision_no') or '').strip()

        # Use g.db instead of creating a new connection
        if not hasattr(g, 'db') or g.db is None:
            return jsonify({"success": False, "message": "DB connection failed"}), 500

        results = []  # (drawing_id, new_revision)
        today = datetime.today()

        try:
            with g.db.cursor() as c:
                for f in files:
                    if not f or not f.filename.lower().endswith('.pdf'):
                        continue
                    drawing_id = extract_drawing_id_from_name(f.filename)
                    if not drawing_id:
                        continue

                    # Extract revision from filename (e.g., "9096998745-1.pdf" -> revision 1)
                    revision_from_file = extract_revision_from_name(f.filename)
                    if revision_from_file is None:
                        print(f"Warning: Could not extract revision from filename '{f.filename}', skipping.")
                        continue

                    pdf_bytes = f.read()

                    # Check if this drawing+revision already exists
                    c.execute("""
                        SELECT 1 FROM drawings 
                        WHERE drawing_ID=%s AND Revision_num=%s
                    """, (drawing_id, revision_from_file))
                    
                    if c.fetchone():
                        # Update existing record
                        c.execute("""
                            UPDATE drawings
                               SET Reviewer_EMP_ID=%s,
                                   Creator_EMP_ID=%s,
                                   Date=%s,
                                   CheckList=%s,
                                   Drawing_Type=%s,
                                   Drawing_PDF=%s
                             WHERE drawing_ID=%s AND Revision_num=%s
                        """, (reviewer_emp_id, creator_emp_id, today,
                              checklist, drawing_type, pdf_bytes, drawing_id, revision_from_file))
                    else:
                        # Insert new record
                        c.execute("""
                            INSERT INTO drawings
                                (drawing_ID, Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Date, CheckList, Drawing_Type, Drawing_PDF)
                            VALUES
                                (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (drawing_id, revision_from_file, reviewer_emp_id, creator_emp_id, today,
                              checklist, drawing_type, pdf_bytes))

                results.append((drawing_id, revision_from_file))

            g.db.commit()

            # Lookup creator name once for email
            creator_name = creator_emp_id
            try:
                with g.db.cursor() as c2:
                    c2.execute("SELECT Emp_Name FROM employees WHERE Emp_ID=%s LIMIT 1", (creator_emp_id,))
                    r = c2.fetchone()
                    if r and r[0]:
                        creator_name = r[0]
            except Exception as e:
                print("Creator name lookup failed:", e)

            # Send one summary email
            try:
                send_single_summary_email(
                    to_email=reviewer_email,
                    items=results,
                    creator_emp_id=creator_emp_id,
                    creator_name=creator_name
                )
            except Exception as e:
                print("Email send error:", e)

            return jsonify({
                "success": True,
                "message": "Processed files successfully.",
                "results": [{"drawing_id": did, "revision": rev} for did, rev in results]
            }), 200
        except Exception as e:
            # Rollback in case of error
            try:
                g.db.rollback()
            except:
                pass
            print("submit-batch error:", e)
            return jsonify({"success": False, "message": "Internal Server Error"}), 500

    except Exception as e:
        print("submit-batch error:", e)
        return jsonify({"success": False, "message": "Internal Server Error"}), 500
    
    
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
    Creator table:
      Status:
        - Pending if per-drawing table missing OR row for this rev missing OR Decision blank/unknown
        - Approved if Decision == Approve/Approved for that rev
        - Rejected if Decision == Reject/Rejected for that rev
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    with g.db.cursor() as c:
        c.execute("""
            SELECT drawing_ID, Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Date, Drawing_Type
              FROM drawings
             WHERE Creator_EMP_ID=%s
             ORDER BY Date DESC, drawing_ID ASC, Revision_num DESC
        """, (emp_id,))
        rows = c.fetchall()

        out = []
        for drawing_id, rev, reviewer_id, creator_id, created_date, drawing_type in rows:
            reviewer = get_employee(c, reviewer_id)

            status = 'Pending'
            if table_exists(c, drawing_id):
                dyn = get_dyn_row(c, drawing_id, rev)
                if dyn:
                    decision = (dyn['Decision'] or '').lower()
                    if decision in ('approve', 'approved'):
                        status = 'Approved'
                    elif decision in ('reject', 'rejected'):
                        status = 'Rejected'
                    else:
                        status = 'Pending'
                else:
                    status = 'Pending'
            else:
                status = 'Pending'

            out.append({
                "drawingNo": drawing_id,
                "revisionNo": int(rev),
                "createdDate": created_date.strftime("%Y-%m-%d") if created_date else "",
                "reviewerId": reviewer_id,
                "reviewerName": reviewer["name"],
                "reviewerEmail": reviewer["email"],
                "status": status
            })
    return jsonify(out), 200

@app.route('/requests/reviewer/<emp_id>', methods=['GET'])
def requests_reviewer(emp_id):
    """
    Reviewer table:
      Status:
        - 'Reviewed' if per-drawing table HAS a row for the same Revision_num
        - 'Review'   otherwise
    """
    # Use g.db instead of creating a new connection
    if not hasattr(g, 'db') or g.db is None:
        return jsonify({'error': 'Database connection error'}), 500
    
    with g.db.cursor() as c:
        c.execute("""
            SELECT drawing_ID, Revision_num, Reviewer_EMP_ID, Creator_EMP_ID, Date
              FROM drawings
             WHERE Reviewer_EMP_ID=%s
             ORDER BY Date DESC, drawing_ID ASC, Revision_num DESC
        """, (emp_id,))
        rows = c.fetchall()

        out = []
        for drawing_id, rev, reviewer_id, creator_id, created_date in rows:
            creator = get_employee(c, creator_id)

            status = 'Review'
            last_reviewed = None
            if table_exists(c, drawing_id):
                dyn = get_dyn_row(c, drawing_id, rev)
                if dyn:
                    status = 'Reviewed'
                    if dyn['Date']:
                        last_reviewed = dyn['Date'].strftime("%Y-%m-%d")

            out.append({
                "drawingNo": drawing_id,
                "revisionNo": int(rev),
                "createdDate": created_date.strftime("%Y-%m-%d") if created_date else "",
                "creatorId": creator_id,
                "creatorName": creator["name"],
                "creatorEmail": creator["email"],
                "lastReviewedDate": last_reviewed,
                "status": status
            })
    return jsonify(out), 200

@app.route('/requests/delete/<drawing_id>/<int:revision>', methods=['DELETE'])
def delete_request(drawing_id, revision):
    """
    Delete a request from the drawings table.
    This will remove the request from both incoming (reviewer) and outgoing (creator) views.
    """
    conn = connect_to_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cur:
            # Check if the drawing exists
            cur.execute("""
                SELECT 1 FROM drawings 
                WHERE Drawing_ID=%s AND Revision_num=%s
            """, (drawing_id, revision))
            
            if not cur.fetchone():
                return jsonify({"error": "Request not found"}), 404
            
            # Delete from the main drawings table
            cur.execute("""
                DELETE FROM drawings 
                WHERE Drawing_ID=%s AND Revision_num=%s
            """, (drawing_id, revision))
            
            # Also delete from per-drawing table if it exists
            if table_exists(cur, drawing_id):
                tname = _safe_table_name(drawing_id)
                cur.execute(
                    f"DELETE FROM {tname} WHERE Revision_num=%s",
                    (revision,)
                )
            
            conn.commit()
            return jsonify({"ok": True, "message": "Request deleted successfully"}), 200
            
    except Exception as e:
        conn.rollback()
        print(f"Error deleting request: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
        
# Requests end


# Requests PDF downloads and seeing PDF

# @app.route("/drawings/<drawing_id>/<int:revision>/pdf/view", methods=["GET"])
# def view_pdf(drawing_id, revision):
#     conn = connect_to_db()
#     cursor = conn.cursor()
#     cursor.execute("""
#         SELECT Drawing_PDF 
#         FROM drawings 
#         WHERE Drawing_ID = %s AND Revision_num = %s
#     """, (drawing_id, revision))
#     row = cursor.fetchone()
#     cursor.close()
#     conn.close()

#     if not row or not row[0]:
#         return {"error": "PDF not found"}, 404

#     pdf_blob = row[0]   # MEDIUMBLOB
#     return Response(pdf_blob, mimetype="application/pdf")

# @app.route("/drawings/<drawing_id>/<int:revision>/pdf/download", methods=["GET"])
# def download_pdf(drawing_id, revision):
#     conn = connect_to_db()
#     cursor = conn.cursor()
#     cursor.execute("""
#         SELECT Drawing_PDF 
#         FROM drawings 
#         WHERE Drawing_ID = %s AND Revision_num = %s
#     """, (drawing_id, revision))
#     row = cursor.fetchone()
#     cursor.close()
#     conn.close()

#     if not row or not row[0]:
#         return {"error": "PDF not found"}, 404

#     pdf_blob = row[0]
#     return send_file(
#         io.BytesIO(pdf_blob),
#         mimetype="application/pdf",
#         as_attachment=True,
#         download_name=f"{drawing_id}_Rev{revision}.pdf"
#     )

def _safe_table_name(name: str) -> str:
    # allow DR_ and alnums/underscore only
    if not re.fullmatch(r'[A-Za-z0-9_]+', name or ''):
        raise ValueError("Invalid table name")
    return f"`{name}`"

def _fetch_pdf_blob(conn, drawing_id: str, revision: int):
    tname = _safe_table_name(drawing_id)

    with conn.cursor() as cur:
        # try per-drawing table first
        try:
            cur.execute("SHOW TABLES LIKE %s", (drawing_id,))
            if cur.fetchone():
                cur.execute(
                    f"SELECT Drawing_PDF FROM {tname} WHERE Revision_num=%s",
                    (revision,)
                )
                row = cur.fetchone()
                if row and row[0]:
                    return row[0]
        except Exception:
            pass

        # fallback: global drawings table
        cur.execute("""
            SELECT Drawing_PDF
            FROM drawings
            WHERE Drawing_ID=%s AND Revision_num=%s
        """, (drawing_id, revision))
        row = cur.fetchone()
        return row[0] if row and row[0] else None


@app.route("/drawings/<drawing_id>/<int:revision>/pdf/view", methods=["GET"])
def view_pdf(drawing_id, revision):
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
#
# Requests PDF downloads and seeing PDF ends


@app.route("/drawings/<drawing_id>/<int:revision>/pdf/annotated/download", methods=["POST"])
def download_annotated_pdf(drawing_id, revision):
    """
    Return a *temporary* PDF with additional annotations baked in as real
    PDF annotation objects (so page.annots() in fitz can see them),
    without modifying what is stored in the database.

    Expects JSON body:
      {
        "annotations": [
          { "page": 1, "x": 0.5, "y": 0.2, "text": "..." },
          ...
        ]
      }
    where x,y are normalized (0–1) relative to the page width/height.
    """
    payload = request.get_json(silent=True) or {}
    annotations = payload.get("annotations") or []

    print(f"📝 Generating annotated PDF for {drawing_id} Rev {revision}")
    print(f"📝 Received {len(annotations)} annotations")

    conn = connect_to_db()
    if conn is None:
        return dbg_fail("annotated-pdf-db", "Database connection is not established", code=500)

    try:
        blob = _fetch_pdf_blob(conn, drawing_id, revision)
        if not blob:
            return jsonify({"error": "PDF not found"}), 404

        # Open original PDF from DB
        doc = fitz.open(stream=blob, filetype="pdf")
        print(f"📄 Opened PDF with {len(doc)} pages")

        annotations_added = 0
        for ann in annotations:
            try:
                page_index = int(ann.get("page", 1)) - 1
                if page_index < 0 or page_index >= len(doc):
                    print(f"⚠️ Skipping annotation - page {page_index+1} out of range")
                    continue
                page = doc[page_index]
                rect = page.rect

                # Normalized coordinates → page coordinates
                x_norm = float(ann.get("x", 0.0))
                y_norm = float(ann.get("y", 0.0))
                x = rect.x0 + x_norm * rect.width
                y = rect.y0 + y_norm * rect.height

                text = str(ann.get("text") or "").strip()
                if not text:
                    print(f"⚠️ Skipping annotation - empty text")
                    continue

                # Add a standard text annotation icon at that point.
                # fitz will store the text in annot.info["content"],
                # which is exactly what extract_annotations(...) expects.
                page.add_text_annot(fitz.Point(x, y), text)
                annotations_added += 1
                print(f"✅ Added annotation on page {page_index+1}: '{text[:50]}...'")
            except Exception as e:
                # Don't fail the whole export for a single bad annotation
                print(f"❌ Failed to add annotation: {e}, data: {ann}")
                continue

        print(f"✅ Successfully added {annotations_added}/{len(annotations)} annotations")

        out_bytes = doc.write()
        doc.close()

        download_name = f"{drawing_id}_Rev{str(revision).zfill(2)}_annotated.pdf"
        print(f"📦 Sending annotated PDF: {download_name} ({len(out_bytes)} bytes)")
        
        return send_file(
            io.BytesIO(out_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=download_name
        )
    except Exception as e:
        print(f"❌ Error generating annotated PDF: {e}")
        return dbg_fail("annotated-pdf-generate", e)
    finally:
        conn.close()

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

    drawing_id = (request.args.get('drawing_id') or '').strip()
    rev_param  = (request.args.get('revision') or '').strip()

    if not drawing_id:
        return jsonify({"ok": False, "error": "drawing_id is required"}), 400

    try:
        cur = db.cursor()

        # 1) Find the latest revision for this drawing
        cur.execute("SELECT MAX(Revision_num) FROM drawings WHERE Drawing_ID=%s", (drawing_id,))
        row = cur.fetchone()
        if not row or row[0] is None:
            return jsonify({"ok": False, "error": "No rows found for this Drawing_ID"}), 404
        max_rev = int(row[0])

        # 2) Decide which revision to use
        requested_rev = None
        if rev_param.isdigit():
            requested_rev = int(rev_param)

        chosen_rev = max_rev
        if requested_rev is not None:
            cur.execute(
                "SELECT 1 FROM drawings WHERE Drawing_ID=%s AND Revision_num=%s",
                (drawing_id, requested_rev)
            )
            if cur.fetchone():
                chosen_rev = requested_rev  # exact revision exists
            # else: keep fallback to max_rev

        # 3) Pull the chosen row from drawings
        cur.execute("""
            SELECT Creator_EMP_ID, Reviewer_EMP_ID, Revision_num, `Date`, Drawing_type
            FROM drawings
            WHERE Drawing_ID=%s AND Revision_num=%s
        """, (drawing_id, chosen_rev))
        drow = cur.fetchone()
        if not drow:
            return jsonify({"ok": False, "error": "No matching drawing row"}), 404

        creator_id, reviewer_id, rev_in_row, date_val, drawing_type = drow

        # 4) Creator org info
        cur.execute("""
            SELECT emp_PC, emp_division, emp_team
            FROM Employees
            WHERE emp_id=%s
        """, (creator_id,))
        erow = cur.fetchone() or ('', '', '')
        emp_PC, emp_division, emp_team = erow

        # 5) Whether a PDF exists
        cur.execute("""
            SELECT CASE WHEN Drawing_PDF IS NULL THEN 0 ELSE 1 END AS has_pdf
            FROM drawings
            WHERE Drawing_ID=%s AND Revision_num=%s
        """, (drawing_id, chosen_rev))
        has_pdf = bool((cur.fetchone() or (0,))[0])

        design_no_plain = drawing_id[3:] if drawing_id.startswith('DR_') else drawing_id

        response_data = {
            "ok": True,
            "drawing_id": drawing_id,
            "design_no_plain": design_no_plain,
            "requested_revision": requested_rev,
            "used_revision": rev_in_row,
            "revision_no": rev_in_row,  # Add this for frontend compatibility
            "used_latest": (rev_in_row == max_rev),
            "creator_id": creator_id or "",
            "reviewer_id": reviewer_id or "",
            "emp_PC":     emp_PC or "",
            "emp_division": emp_division or "",
            "emp_team":     emp_team or "",
            "has_pdf": has_pdf,
            "Drawing_Type": drawing_type or "",
            # Keep ISO if you ever want it; UI doesn't have to show it
            "reviewed_date": (date_val.isoformat() if date_val else None)
        }
        
        print(f"📤 BACKEND /prefill-upload response: drawing_id={drawing_id}, revision_no={rev_in_row}, requested={requested_rev}")
        
        return jsonify(response_data)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Unexpected: {e}"}), 500
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
    Replaces drawings.Drawing_PDF for (Drawing_ID, Revision_num) with the uploaded annotated PDF.
    Expects multipart/form-data with 'file' (the PDF). Optional 'filename' for logging.
    """
    file = request.files.get('file')
    if file is None:
        return jsonify({'error': 'missing file'}), 400

    pdf_bytes = file.read()
    filename = request.form.get('filename', '')

    conn = connect_to_db()
    try:
        with conn.cursor() as cur:
            # Make sure the row exists
            cur.execute("""
                SELECT 1 FROM drawings
                WHERE Drawing_ID=%s AND Revision_num=%s
                """, (drawing_id, revision))
            if cur.fetchone() is None:
                return jsonify({'error': 'row not found'}), 404

            # Update the blob
            cur.execute("""
                UPDATE drawings
                SET Drawing_PDF=%s
                WHERE Drawing_ID=%s AND Revision_num=%s
                """, (pdf_bytes, drawing_id, revision))
        conn.commit()
        return jsonify({'ok': True, 'filename': filename})
    except Exception as e:
        conn.rollback()
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
        
        file_path = os.path.join(annotations_dir, f"{drawing_id}.json")
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
        file_path = os.path.join(annotations_dir, f"{drawing_id}.json")
        
        if not os.path.exists(file_path):
            return jsonify({"annotations": []}), 200
        
        with open(file_path, 'r') as f:
            annotations = json.load(f)
        
        return jsonify({"annotations": annotations}), 200
    except Exception as e:
        print(f"Error loading annotations: {e}")
        return jsonify({"error": str(e)}), 500


# Canvas end
if __name__ == '__main__':
    app.run(debug=True, port=5000)
    # serve(app, port=5000, threads=4)
