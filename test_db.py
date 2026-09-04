import pymysql
import os

# Load env vars
for env_path in ["backend/.env", "backend/../.env", ".env"]:
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"): continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip("'\"")

db = pymysql.connect(
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASSWORD", ""),
    database=os.getenv("DB_NAME", "atlascopco_drawing_db"),
    charset='utf8mb4'
)

cursor = db.cursor(pymysql.cursors.DictCursor)

team_name = "TSG 2"
query = """
    SELECT u.emp_id, u.name as emp_name, ec.code as error_code, ec.description as error_description, COUNT(rec.error_code_id) as error_count
    FROM users u
    LEFT JOIN drawings d ON u.id = d.creator_id
    LEFT JOIN drawing_revisions dr ON d.id = dr.drawing_id
    LEFT JOIN revision_error_codes rec ON dr.id = rec.revision_id
    LEFT JOIN error_codes ec ON rec.error_code_id = ec.id
    WHERE u.team = %s
    GROUP BY u.emp_id, u.name, ec.code, ec.description
"""
cursor.execute(query, (team_name,))
errors = cursor.fetchall()
print(f"Total rows: {len(errors)}")
for e in errors:
    print(e)

db.close()
