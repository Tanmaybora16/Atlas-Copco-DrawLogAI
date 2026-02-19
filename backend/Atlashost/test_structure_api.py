import unittest
import json
from app import app, connect_to_db

class StructureApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
        # Ensure clean state or use a test DB? 
        # For now, we will just add test data and delete it.
        self.test_div_name = "TEST_DIVISION_XYZ"
        self.test_team_name = "TEST_TEAM_XYZ"
        self.test_pc_name = "TEST_PC_XYZ"

    def tearDown(self):
        # Clean up
        db = connect_to_db()
        if db:
            with db.cursor() as c:
                c.execute("DELETE FROM structure_pcs WHERE name = %s", (self.test_pc_name,))
                c.execute("DELETE FROM structure_divisions WHERE name = %s", (self.test_div_name,))
                c.execute("DELETE FROM structure_teams WHERE name = %s", (self.test_team_name,))
            db.commit()
            db.close()

    def test_division_crud(self):
        # CREATE
        resp = self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        self.assertEqual(resp.status_code, 201)

        # READ
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_div_name for d in data)
        self.assertTrue(found)
        
        # Get ID
        div_id = next(d['id'] for d in data if d['name'] == self.test_div_name)

        # DELETE
        resp = self.app.delete(f'/api/structure/divisions/{div_id}')
        self.assertEqual(resp.status_code, 200)

        # VERIFY DELETE
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_div_name for d in data)
        self.assertFalse(found)

    def test_team_crud(self):
        # CREATE
        resp = self.app.post('/api/structure/teams', json={'name': self.test_team_name})
        self.assertEqual(resp.status_code, 201)

        # READ
        resp = self.app.get('/api/structure/teams')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_team_name for d in data)
        self.assertTrue(found)

        # Get ID
        team_id = next(d['id'] for d in data if d['name'] == self.test_team_name)

        # DELETE
        resp = self.app.delete(f'/api/structure/teams/{team_id}')
        self.assertEqual(resp.status_code, 200)

    def test_pc_crud(self):
        # Need a division first
        self.app.post('/api/structure/divisions', json={'name': self.test_div_name})
        resp = self.app.get('/api/structure/divisions')
        data = json.loads(resp.data)
        div_id = next(d['id'] for d in data if d['name'] == self.test_div_name)

        # CREATE PC
        resp = self.app.post('/api/structure/pcs', json={'name': self.test_pc_name, 'division_id': div_id})
        self.assertEqual(resp.status_code, 201)

        # READ PC
        resp = self.app.get('/api/structure/pcs')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_pc_name for d in data)
        self.assertTrue(found)

        # FILTER PC BY DIVISION
        resp = self.app.get(f'/api/structure/pcs?division_id={div_id}')
        data = json.loads(resp.data)
        found = any(d['name'] == self.test_pc_name for d in data)
        self.assertTrue(found)

        # Get ID
        pc_id = next(d['id'] for d in data if d['name'] == self.test_pc_name)

        # DELETE PC
        resp = self.app.delete(f'/api/structure/pcs/{pc_id}')
        self.assertEqual(resp.status_code, 200)

        # CLEANUP DIVISION
        self.app.delete(f'/api/structure/divisions/{div_id}')

if __name__ == '__main__':
    unittest.main()
