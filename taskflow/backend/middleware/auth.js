const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow-secret-key-change-in-production';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, avatar_color FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireProjectAccess(req, res, next) {
  const projectId = req.params.projectId || req.body.project_id;
  if (!projectId) return next();

  const member = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, req.user.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (!member && req.user.role !== 'admin' && project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a project member' });
  }

  req.project = project;
  req.projectMember = member;
  next();
}

function requireProjectAdmin(req, res, next) {
  const projectId = req.params.projectId || req.body.project_id;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const isOwner = project.owner_id === req.user.id;
  const isGlobalAdmin = req.user.role === 'admin';
  const member = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, req.user.id);
  const isProjectAdmin = member && member.role === 'admin';

  if (!isOwner && !isGlobalAdmin && !isProjectAdmin) {
    return res.status(403).json({ error: 'Project admin access required' });
  }

  req.project = project;
  next();
}

module.exports = { authenticate, requireAdmin, requireProjectAccess, requireProjectAdmin, JWT_SECRET };
