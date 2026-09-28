import re
with open(r'c:\INDUSTRY PROJ\ATLAS COPCO\Atlas-Copco-DrawLogAI\backend\Atlashost\app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '/pdf/view' in line or 'def get_drawing_pdf' in line or 'def view_pdf' in line:
        for j in range(max(0, i-5), min(len(lines), i+30)):
            print(f"{j+1}: {lines[j].strip()}")
