
import pymysql
import os

def connect_to_db():
    try:
        db = pymysql.connect(
            host="localhost",
            user="root",
            password="root",
            database="atlascopco_drawing_db",
            cursorclass=pymysql.cursors.DictCursor
        )
        print("Connected to database")
        return db
    except Exception as e:
        print(f"Failed to connect: {e}")
        return None

def apply_sql_file(file_path):
    db = connect_to_db()
    if not db:
        return

    try:
        with open(file_path, 'r') as f:
            sql_content = f.read()

        # Split generic SQL statements (simplified)
        # This simple split might not handle all edge cases but should work for this specific script
        statements = sql_content.split(';')

        with db.cursor() as cursor:
            for statement in statements:
                if statement.strip():
                    try:
                        cursor.execute(statement)
                        print(f"Executed: {statement[:50]}...")
                    except Exception as e:
                        print(f"Error executing statement: {statement[:50]}...\nError: {e}")
        
        db.commit()
        print("All changes applied successfully.")
    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    apply_sql_file("structure_updates.sql")
