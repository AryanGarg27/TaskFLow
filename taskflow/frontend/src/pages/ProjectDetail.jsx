import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectsAPI, tasksAPI, authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { TaskModal } from '../components/TaskModal';
import { format, isPast, parseISO } from 'date-fns';

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];
const PRIORITY_DOT = { low: '#5f5f7a', medium: '#60a5fa', high: '#f5c542', urgent: '#ff6b6b' };

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('board');
  const [taskModal, setTaskModal] = useState(null); // null | 'new' | task obj
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ user_id: '', role: 'member' });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      projectsAPI.get(id),
      tasksAPI.byProject(id),
      authAPI.users(),
    ]).then(([pRes, tRes, uRes]) => {
      setProject(pRes.data.project);
      setMembers(pRes.data.members);
      setTasks(tRes.data.tasks);
      setAllUsers(uRes.data.users);
      setSettingsForm({ name: pRes.data.project.name, description: pRes.data.project.description || '', status: pRes.data.project.status });
    }).catch(err => {
      if (err.response?.status === 403 || err.response?.status === 404) navigate('/projects');
    }).finally(() => setLoading(false));
  }, [id]);

  const reloadTasks = () => tasksAPI.byProject(id).then(r => setTasks(r.data.tasks));

  const isProjectAdmin = user?.role === 'admin' || project?.owner_id === user?.id ||
    members.find(m => m.id === user?.id)?.project_role === 'admin';

  const handleTaskSave = (task) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id);
      if (idx >= 0) { const updated = [...prev]; updated[idx] = task; return updated; }
      return [...prev, task];
    });
    setTaskModal(null);
  };

  const handleTaskDelete = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setTaskModal(null);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const res = await tasksAPI.update(taskId, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data.task : t));
    } catch {}
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await projectsAPI.addMember(id, addMemberForm);
      setMembers(res.data.members);
      setShowAddMember(false);
      setAddMemberForm({ user_id: '', role: 'member' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await projectsAPI.removeMember(id, userId);
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    try {
      const res = await projectsAPI.update(id, settingsForm);
      setProject(res.data.project);
      setShowSettings(false);
    } catch {}
  };

  const handleDeleteProject = async () => {
    if (!confirm('Delete this project? This will delete all tasks too.')) return;
    try {
      await projectsAPI.delete(id);
      navigate('/projects');
    } catch {}
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!project) return null;

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key);
    return acc;
  }, {});

  const nonMembers = allUsers.filter(u => !members.find(m => m.id === u.id));

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link to="/projects" style={{ color: 'var(--text3)', textDecoration: 'none', fontSize: 13 }}>Projects</Link>
            <span style={{ color: 'var(--text3)' }}>›</span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{project.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title">{project.name}</h1>
            <span className={`badge badge-${project.status}`}>{project.status}</span>
          </div>
          {project.description && <p className="page-subtitle">{project.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isProjectAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(true)}>⚙ Settings</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setTaskModal('new')}>
            + New Task
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>Board</button>
          <button className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>List</button>
          <button className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
            Members ({members.length})
          </button>
        </div>

        {/* BOARD VIEW */}
        {activeTab === 'board' && (
          <div className="kanban-board">
            {COLUMNS.map(col => (
              <div key={col.key} className={`kanban-col col-${col.key}`}>
                <div className="kanban-col-header">
                  <div className="kanban-col-title">
                    <div className="kanban-col-dot" />
                    {col.label}
                  </div>
                  <span className="kanban-count">{tasksByStatus[col.key].length}</span>
                </div>
                <div className="kanban-tasks">
                  {tasksByStatus[col.key].map(task => {
                    const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'done';
                    return (
                      <div
                        key={task.id}
                        className={`task-card ${isOverdue ? 'overdue' : ''}`}
                        onClick={() => setTaskModal(task)}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[task.priority], flexShrink: 0, marginTop: 4 }} />
                          <div className="task-title" style={{ margin: 0 }}>{task.title}</div>
                        </div>
                        <div className="task-meta">
                          {task.due_date && (
                            <span className={`task-due ${isOverdue ? 'overdue' : ''}`}>
                              📅 {format(parseISO(task.due_date), 'MMM d')}
                            </span>
                          )}
                          {task.assignee_name && (
                            <div className="task-assignee" style={{ marginLeft: 'auto' }}>
                              <div className="avatar avatar-sm" style={{ background: task.assignee_color }}>
                                {getInitials(task.assignee_name)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="kanban-add">
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--text3)' }}
                    onClick={() => setTaskModal('new')}
                  >
                    + Add task
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LIST VIEW */}
        {activeTab === 'list' && (
          <div>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No tasks yet</div>
                <div className="empty-desc">Create your first task to get this project moving.</div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTaskModal('new')}>Create Task</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 90px 120px 32px', gap: 12, padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due Date</span><span></span>
                </div>
                {tasks.map(task => {
                  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'done';
                  return (
                    <div
                      key={task.id}
                      className="task-card"
                      style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 90px 120px 32px', gap: 12, alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => setTaskModal(task)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[task.priority], flexShrink: 0 }} />
                        <span className="task-title" style={{ margin: 0 }}>{task.title}</span>
                      </div>
                      <span className={`badge badge-${task.status}`} style={{ width: 'fit-content' }}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className={`badge badge-${task.priority}`} style={{ width: 'fit-content' }}>
                        {task.priority}
                      </span>
                      <div>
                        {task.assignee_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="avatar avatar-sm" style={{ background: task.assignee_color }}>{getInitials(task.assignee_name)}</div>
                            <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee_name}</span>
                          </div>
                        ) : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>}
                      </div>
                      <span className={`task-due ${isOverdue ? 'overdue' : ''}`}>
                        {task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : '—'}
                      </span>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={e => { e.stopPropagation(); setTaskModal(task); }}
                        title="Edit"
                      >
                        ✎
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MEMBERS VIEW */}
        {activeTab === 'members' && (
          <div style={{ maxWidth: 600 }}>
            <div className="section-header">
              <h2 className="section-title">Team Members</h2>
              {isProjectAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddMember(true)}>
                  + Add Member
                </button>
              )}
            </div>

            <div className="card">
              {members.map(m => (
                <div key={m.id} className="member-row">
                  <div className="avatar" style={{ background: m.avatar_color }}>{getInitials(m.name)}</div>
                  <div className="member-info">
                    <div className="member-name">{m.name} {m.id === user?.id && <span style={{ color: 'var(--text3)', fontSize: 11 }}>(you)</span>}</div>
                    <div className="member-email">{m.email}</div>
                  </div>
                  <span className={`badge badge-${m.project_role}`}>{m.project_role}</span>
                  {m.global_role === 'admin' && <span className="badge badge-admin">admin</span>}
                  {isProjectAdmin && m.id !== user?.id && project.owner_id !== m.id && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleRemoveMember(m.id)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add member modal */}
            {showAddMember && (
              <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddMember(false)}>
                <div className="modal">
                  <div className="modal-header">
                    <h2 className="modal-title">Add Member</h2>
                    <button className="btn btn-ghost btn-icon" onClick={() => setShowAddMember(false)}>✕</button>
                  </div>
                  <form onSubmit={handleAddMember}>
                    <div className="modal-body">
                      {error && <div className="alert alert-error">{error}</div>}
                      <div className="form-group">
                        <label className="form-label">User</label>
                        <select className="form-select" value={addMemberForm.user_id} onChange={e => setAddMemberForm(f => ({ ...f, user_id: e.target.value }))} required>
                          <option value="">Select a user...</option>
                          {nonMembers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Project Role</label>
                        <select className="form-select" value={addMemberForm.role} onChange={e => setAddMemberForm(f => ({ ...f, role: e.target.value }))}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary">Add Member</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Modal */}
      {taskModal !== null && (
        <TaskModal
          task={taskModal === 'new' ? null : taskModal}
          projectId={parseInt(id)}
          members={members}
          currentUser={user}
          onClose={() => setTaskModal(null)}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Project Settings</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateProject}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={settingsForm.name} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={settingsForm.description} onChange={e => setSettingsForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={settingsForm.status} onChange={e => setSettingsForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="divider" />
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>Danger Zone</p>
                  <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteProject}>
                    Delete Project
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
