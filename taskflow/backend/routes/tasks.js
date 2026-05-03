const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks - get all tasks for current user (dashboard)
router.get('/', authenticate, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, p.name as project_name,
      u1.name as assignee_name, u1.avatar_color as assignee_color,
      u2.name as creator_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    WHERE t.assignee_id = ? OR t.creator_id = ? OR t.project_id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY t.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id);
  res.json({ tasks });
});

// GET /api/tasks/dashboard - stats for dashboard
router.get('/dashboard', authenticate, (req, res) => {
  const userId = req.user.id;

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < DATE('now') AND status != 'done' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN priority = 'urgent' AND status != 'done' THEN 1 ELSE 0 END) as urgent
    FROM tasks
    WHERE assignee_id = ? OR creator_id = ? OR project_id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
  `).get(userId, userId, userId);

  const recentTasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name, u.avatar_color as assignee_color
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.assignee_id = ? OR t.creator_id = ? OR t.project_id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY t.updated_at DESC LIMIT 10
  `).all(userId, userId, userId);

  const projectStats = db.prepare(`
    SELECT p.id, p.name, p.status,
      COUNT(t.id) as task_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5
  `).all(userId, userId);

  res.json({ stats, recentTasks, projectStats });
});

// GET /api/tasks/project/:projectId
router.get('/project/:projectId', authenticate, requireProjectAccess, (req, res) => {
  const { status, priority, assignee_id } = req.query;
  let query = `
    SELECT t.*, u1.name as assignee_name, u1.avatar_color as assignee_color, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (assignee_id) { query += ' AND t.assignee_id = ?'; params.push(assignee_id); }

  query += ' ORDER BY CASE t.priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks
router.post('/', authenticate, [
  body('title').trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2-200 chars'),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('project_id').isInt().withMessage('Project ID required'),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assignee_id').optional().isInt(),
  body('due_date').optional().isISO8601(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, project_id, status = 'todo', priority = 'medium', assignee_id, due_date } = req.body;

  // Check project access
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(project_id, req.user.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!member && req.user.role !== 'admin' && project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a project member' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, project_id, status, priority, assignee_id, creator_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || null, project_id, status, priority, assignee_id || null, req.user.id, due_date || null);

  const task = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar_color as assignee_color, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ task });
});

// PUT /api/tasks/:id
router.put('/:id', authenticate, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Check access
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { title, description, status, priority, assignee_id, due_date } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      assignee_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assignee_id END,
      due_date = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title || null, description !== undefined ? description : null, status || null, priority || null,
    assignee_id !== undefined ? 1 : null, assignee_id !== undefined ? (assignee_id || null) : null,
    due_date !== undefined ? 1 : null, due_date !== undefined ? (due_date || null) : null,
    req.params.id);

  const updated = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar_color as assignee_color, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    WHERE t.id = ?
  `).get(req.params.id);

  res.json({ task: updated });
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticate, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
  const isCreator = task.creator_id === req.user.id;
  if (!isCreator && req.user.role !== 'admin' && !(member && member.role === 'admin')) {
    return res.status(403).json({ error: 'Only task creator or project admin can delete' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// GET /api/tasks/:id/comments
router.get('/:id/comments', authenticate, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_color
    FROM task_comments c JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ comments });
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', authenticate, [
  body('content').trim().isLength({ min: 1, max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const result = db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, req.body.content);
  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_color
    FROM task_comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ comment });
});

module.exports = router;
