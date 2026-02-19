import unittest
import json
from app import app, connect_to_db

class ReactivationTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
        self.test_div_name = "TEST_REACTIVATE_DIV"
        self.test_team_name = "TEST_REACTIVATE_TEAM"
        self.test_pc_name = "TEST_REACTIVATE_PC"
        
        # Clean up before start
        self.cleanup()

    def tearDown(self):
        self.cleanup()
        
    def cleanup(self):
        db = connect_to_db()
        if db:
            with db.cursor() as c:
                c.execute("DELETE FROM structure_pcs WHERE name = %s", (self.test_pc_name,))
                c.execute("DELETE FROM structure_divisions WHERE name = %s", (self.test_div_name,))
                c.execute("DELETE FROM structure_teams WHERE name = %s", (self.test_team_name,))
            db.commit()
            db.close()

    def test_division_reactivation(self):
        # 1. Create
        resp = self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        self.assertEqual(resp.status_code, 201)
        
        # Get ID
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        div_id = next(d['id'] for d in data if d['name'] == self.test_div_name)

        # 2. Delete
        resp = self.app.delete(f'/api/structure/divisions/{div_id}')
        self.assertEqual(resp.status_code, 200)
        
        # Verify it's gone from active list
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_div_name for d in data)
        self.assertFalse(found)

        # 3. Create again (Should Reactivate)
        resp = self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        self.assertEqual(resp.status_code, 201)
        
        # Verify it's active again
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_div_name for d in data)
        self.assertTrue(found)

        # 4. Create again (Should Fail)
        resp = self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        self.assertEqual(resp.status_code, 400)

    def test_team_reactivation(self):
        # 1. Create
        resp = self.app.post('/api/structure/teams', json={'name': self.test_team_name})
        self.assertEqual(resp.status_code, 201)
        
        # Get ID
        resp = self.app.get('/api/structure/teams')
        data = json.loads(resp.data)
        team_id = next(d['id'] for d in data if d['name'] == self.test_team_name)

        # 2. Delete
        resp = self.app.delete(f'/api/structure/teams/{team_id}')
        self.assertEqual(resp.status_code, 200)

        # 3. Create again (Should Reactivate)
        resp = self.app.post('/api/structure/teams', json={'name': self.test_team_name})
        self.assertEqual(resp.status_code, 201)

        # 4. Create again (Should Fail)
        resp = self.app.post('/api/structure/teams', json={'name': self.test_team_name})
        self.assertEqual(resp.status_code, 400)

    def test_pc_reactivation(self):
        # Setup Division
        self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        div_id = next(d['id'] for d in data if d['name'] == self.test_div_name)

        # 1. Create PC
        resp = self.app.post('/api/structure/pcs', json={'name': self.test_pc_name, 'division_id': div_id})
        self.assertEqual(resp.status_code, 201)
        
        # Get ID
        resp = self.app.get('/api/structure/pcs')
        data = json.loads(resp.data)
        pc_id = next(d['id'] for d in data if d['name'] == self.test_pc_name)

        # 2. Delete PC
        resp = self.app.delete(f'/api/structure/pcs/{pc_id}')
        self.assertEqual(resp.status_code, 200)

        # 3. Create again (Should Reactivate)
        resp = self.app.post('/api/structure/pcs', json={'name': self.test_pc_name, 'division_id': div_id})
        self.assertEqual(resp.status_code, 201)

        # 4. Create again (Should Fail)
        resp = self.app.post('/api/structure/pcs', json={'name': self.test_pc_name, 'division_id': div_id})
        self.assertEqual(resp.status_code, 400)

if __name__ == '__main__':
    unittest.main()
