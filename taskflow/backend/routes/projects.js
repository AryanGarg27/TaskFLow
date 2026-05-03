const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, requireProjectAccess, requireProjectAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects - get all projects for current user
router.get('/', authenticate, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, u.name as owner_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as done_count,
      (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    WHERE p.owner_id = ? OR p.id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY p.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json({ projects });
});

// POST /api/projects
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 chars'),
  body('description').optional().trim().isLength({ max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description } = req.body;
  const result = db.prepare(
    'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)'
  ).run(name, description || null, req.user.id);

  // Auto-add creator as admin member
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ project });
});

// GET /api/projects/:projectId
router.get('/:projectId', authenticate, requireProjectAccess, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM projects p JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.projectId);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role as global_role, u.avatar_color, pm.role as project_role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).all(req.params.projectId);

  res.json({ project, members });
});

// PUT /api/projects/:projectId
router.put('/:projectId', authenticate, requireProjectAdmin, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('status').optional().isIn(['active', 'archived', 'completed']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, status } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, description !== undefined ? description : null, status || null, req.params.projectId);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  res.json({ project: updated });
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', authenticate, requireProjectAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:projectId/members
router.post('/:projectId/members', authenticate, requireProjectAdmin, [
  body('user_id').isInt().withMessage('User ID required'),
  body('role').optional().isIn(['admin', 'member']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { user_id, role = 'member' } = req.body;
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.projectId, user_id);
  if (existing) return res.status(409).json({ error: 'User already in project' });

  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(req.params.projectId, user_id, role);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role as global_role, u.avatar_color, pm.role as project_role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).all(req.params.projectId);

  res.status(201).json({ members });
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', authenticate, requireProjectAdmin, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (project.owner_id === parseInt(req.params.userId)) {
    return res.status(400).json({ error: 'Cannot remove project owner' });
  }
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
