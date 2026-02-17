import pymysql
import os

def connect_to_db():
    try:
        db = pymysql.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", "root"),
            database=os.getenv("DB_NAME", "atlascopco_drawing_db"),
            autocommit=True,
            charset='utf8mb4',
        )
        print("[SUCCESS] Database connected")
        return db
    except Exception as e:
        print("[ERROR] Database connection failed:", e)
        return None

def add_column():
    db = connect_to_db()
    if not db:
        return

    try:
        with db.cursor() as cursor:
            # Check if column exists
            cursor.execute("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'drawing_revisions'
                  AND column_name = 'task_number'
            """)
            exists = cursor.fetchone()[0]

            if exists:
                print("[INFO] Column 'task_number' already exists in 'drawing_revisions'.")
            else:
                print("[INFO] Adding 'task_number' column to 'drawing_revisions'...")
                cursor.execute("ALTER TABLE drawing_revisions ADD COLUMN task_number VARCHAR(50)")
                print("[SUCCESS] Column 'task_number' added successfully.")

    except Exception as e:
        print(f"[ERROR] Failed to modify table: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    add_column()
