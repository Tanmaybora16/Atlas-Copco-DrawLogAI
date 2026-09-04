import sys
with open(r'c:\INDUSTRY PROJ\ATLAS COPCO\Atlas-Copco-DrawLogAI\frontend\src\app\canvas\canvas.component.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'loadPdfFromBuffer' in line or 'onFileSelected' in line:
        for j in range(max(0, i-5), min(len(lines), i+30)):
            try:
                print(f"{j+1}: {lines[j].strip()}")
            except:
                print(f"{j+1}: [UNPRINTABLE LINE]")
        print("---")
