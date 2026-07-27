import json
import re

files_to_fix = [
    'C:/INDUSTRY PROJ/ATLAS COPCO/Atlas-Copco-DrawLogAI/primary_checklist.json'
]

for file_path in files_to_fix:
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for item in data:
        ref = item.get('standard_ref', '')
        # Fix whitespace blocks
        ref = re.sub(r'\s{2,}', ' ', ref)
        # Fix typos
        ref = ref.replace('Portugese', 'Portuguese')
        ref = ref.replace('acc.Atlas', 'acc. Atlas')
        ref = ref.replace('unambigously', 'unambiguously')
        ref = ref.replace('needeed (PED, ASME,ÔÇª.)', 'needed (PED, ASME, ...)')
        ref = ref.replace('needeed (PED, ASME,\u00d4\u00c7\u00aa.)', 'needed (PED, ASME, ...)')
        ref = ref.replace('needeed (PED, ASME,\u00e2\u20ac\u00a6.)', 'needed (PED, ASME, ...)')
        ref = ref.replace('english', 'English')
        ref = ref.replace('does not relates', 'does not relate')
        ref = ref.replace('\"Approved\'', '\"Approved\"')
        
        item['standard_ref'] = ref
        
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

print('Fixed primary_checklist.json')
