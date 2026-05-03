import { useState, useEffect } from 'react';
import { tasksAPI, authAPI } from '../api';
import { format, parseISO, isPast } from 'date-fns';

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function TaskModal({ task, projectId, members, onClose, onSave, onDelete, currentUser }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    assignee_id: task?.assignee_id || '',
    due_date: task?.due_date || '',
    project_id: projectId,
  });
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (task?.id) {
      tasksAPI.getComments(task.id).then(res => setComments(res.data.comments));
    }
  }, [task?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
      };
      let result;
      if (task?.id) {
        result = await tasksAPI.update(task.id, payload);
      } else {
        result = await tasksAPI.create(payload);
      }
      onSave(result.data.task);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      await tasksAPI.delete(task.id);
      onDelete(task.id);
    } catch (err) {
      setError('Failed to delete task');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const res = await tasksAPI.addComment(task.id, { content: commentText });
      setComments(c => [...c, res.data.comment]);
      setCommentText('');
    } catch {}
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2 className="modal-title">{task?.id ? 'Edit Task' : 'New Task'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {task?.id && (currentUser?.role === 'admin' || task.creator_id === currentUser?.id) && (
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
            )}
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        {task?.id && (
          <div style={{ padding: '0 24px' }}>
            <div className="tabs">
              <button className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
              <button className={`tab ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>
                Comments {comments.length > 0 && `(${comments.length})`}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <form onSubmit={handleSave}>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  className="form-input"
                  placeholder="Task title"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required minLength={2}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  placeholder="Add details..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Assignee</label>
                  <select className="form-select" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : task?.id ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'comments' && task?.id && (
          <div className="modal-body">
            <div style={{ marginBottom: 20 }}>
              {comments.length === 0 && (
                <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>No comments yet. Be the first!</p>
              )}
              {comments.map(c => (
                <div key={c.id} className="comment">
                  <div className="avatar avatar-sm" style={{ background: c.avatar_color }}>{getInitials(c.user_name)}</div>
                  <div className="comment-body">
                    <div className="comment-header">
                      <span className="comment-author">{c.user_name}</span>
                      <span className="comment-time">{format(new Date(c.created_at), 'MMM d, h:mm a')}</span>
                    </div>
                    <p className="comment-text">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleComment} style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Write a comment..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary btn-sm">Post</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
