import os
import re
import pymysql

def parse_html_and_seed():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    html_file = os.path.join(base_dir, '../../original_submission.html')
    
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the table body for the checklist
    tbody_match = re.search(r'<tbody>(.*?)</tbody>', content, re.DOTALL)
    if not tbody_match:
        print("Could not find tbody in HTML")
        return
    
    tbody = tbody_match.group(1)
    
    # Find all rows
    rows = re.findall(r'<tr>(.*?)</tr>', tbody, re.DOTALL)
    
    checkpoints = []
    for idx, row in enumerate(rows):
        # Extract td contents
        tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(tds) >= 16:
            # Clean up the text
            clean_tds = [re.sub(r'<[^>]+>', '', td).strip() for td in tds]
            
            # Map columns
            checkpoint = {
                'seq_nr': clean_tds[0],
                'standard_ref': clean_tds[1].replace('\n', ' ').replace('  ', ' '),
                'part_val': clean_tds[2],
                'piping_val': clean_tds[3],
                'welded_val': clean_tds[4],
                'other_val': clean_tds[5],
                'ferro_val': clean_tds[6],
                'non_ferro_val': clean_tds[7],
                'casted_machined_val': clean_tds[8],
                'machined_non_casted_val': clean_tds[9],
                'sheet_metal_val': clean_tds[10],
                'foam_decals_val': clean_tds[11],
                'assembly_val': clean_tds[12],
                'instruction_val': clean_tds[13],
                'information_val': clean_tds[14],
                'safety_labels_val': clean_tds[15],
                'display_order': idx + 1
            }
            checkpoints.append(checkpoint)

    # Database connection
    # Load env vars
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

    db = pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "atlascopco_drawing_db"),
        charset='utf8mb4'
    )

    cursor = db.cursor()
    
    # Ensure tables exist
    with open('create_checklist_tables.sql', 'r') as sql_file:
        sql_script = sql_file.read()
        for statement in sql_script.split(';'):
            if statement.strip():
                cursor.execute(statement)
    
    db.commit()

    # Clear existing and insert new
    cursor.execute("TRUNCATE TABLE cadq_checklist")
    
    for cp in checkpoints:
        sql = """
        INSERT INTO cadq_checklist (
            seq_nr, standard_ref, part_val, piping_val, welded_val, other_val, 
            ferro_val, non_ferro_val, casted_machined_val, machined_non_casted_val, 
            sheet_metal_val, foam_decals_val, assembly_val, instruction_val, 
            information_val, safety_labels_val, display_order, team_name
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL
        )
        """
        cursor.execute(sql, (
            cp['seq_nr'], cp['standard_ref'], cp['part_val'], cp['piping_val'], 
            cp['welded_val'], cp['other_val'], cp['ferro_val'], cp['non_ferro_val'], 
            cp['casted_machined_val'], cp['machined_non_casted_val'], 
            cp['sheet_metal_val'], cp['foam_decals_val'], cp['assembly_val'], 
            cp['instruction_val'], cp['information_val'], cp['safety_labels_val'],
            cp['display_order']
        ))
    
    db.commit()
    cursor.close()
    db.close()
    
    print(f"Successfully seeded {len(checkpoints)} checkpoints into the database.")

if __name__ == '__main__':
    parse_html_and_seed()
