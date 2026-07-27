
import sys
sys.path.append('backend/Atlashost')
from app import app, connect_to_db
import json

with app.test_client() as client:
    print('Testing GET /api/cadq-checklist')
    res = client.get('/api/cadq-checklist')
    print('GET response:', res.status_code, res.data[:100])

    print('\nTesting POST /api/cadq-checklist')
    new_item = {
        'seq_nr': '99.0',
        'standard_ref': 'Test rule',
        'part_val': 'M',
        'team_name': 'Global',
        'display_order': 99
    }
    res = client.post('/api/cadq-checklist', json=new_item)
    print('POST response:', res.status_code, res.data)

    print('\nTesting GET again to see if it was added')
    res = client.get('/api/cadq-checklist')
    items = json.loads(res.data)
    test_item_id = None
    if isinstance(items, list):
        for item in items:
            if item.get('seq_nr') == '99.0':
                test_item_id = item.get('id')
                break
    print('Found test item ID:', test_item_id)

    if test_item_id:
        print(f'\nTesting DELETE /api/cadq-checklist/{test_item_id}')
        res = client.delete(f'/api/cadq-checklist/{test_item_id}')
        print('DELETE response:', res.status_code, res.data)

