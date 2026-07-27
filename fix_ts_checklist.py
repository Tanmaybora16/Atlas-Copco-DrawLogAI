import json
import re

with open('primary_checklist.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

ts_content = 'const PRIMARY_CHECKLIST = [\n'
for i, item in enumerate(data):
    ts_content += '  {\n'
    for k, v in item.items():
        if isinstance(v, str):
            val = json.dumps(v)
            ts_content += f'    \"{k}\": {val},\n'
        else:
            ts_content += f'    \"{k}\": {v},\n'
    ts_content += '  }'
    if i < len(data) - 1:
        ts_content += ','
    ts_content += '\n'
ts_content += '];'

ts_path = 'frontend/src/app/cadq-config/cadq-config.component.ts'
with open(ts_path, 'r', encoding='utf-8') as f:
    original = f.read()

start_idx = original.find('const PRIMARY_CHECKLIST = [')
end_idx = original.find('];', start_idx) + 2

if start_idx != -1 and end_idx != -1:
    new_content = original[:start_idx] + ts_content + original[end_idx:]
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Updated cadq-config.component.ts')
else:
    print('Could not find const PRIMARY_CHECKLIST in ts file')
