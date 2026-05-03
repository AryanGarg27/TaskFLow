import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tasksAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { format, isPast, parseISO } from 'date-fns';

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const PRIORITY_COLORS = { low: '#5f5f7a', medium: '#60a5fa', high: '#f5c542', urgent: '#ff6b6b' };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tasksAPI.dashboard()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const { stats = {}, recentTasks = [], projectStats = [] } = data || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card stat-total">
            <div className="stat-label">Total Tasks</div>
            <div className="stat-value">{stats.total || 0}</div>
          </div>
          <div className="stat-card stat-todo">
            <div className="stat-label">To Do</div>
            <div className="stat-value" style={{ color: 'var(--text2)' }}>{stats.todo || 0}</div>
          </div>
          <div className="stat-card stat-progress">
            <div className="stat-label">In Progress</div>
            <div className="stat-value">{stats.in_progress || 0}</div>
          </div>
          <div className="stat-card stat-done">
            <div className="stat-label">Completed</div>
            <div className="stat-value">{stats.done || 0}</div>
          </div>
          <div className="stat-card stat-overdue">
            <div className="stat-label">Overdue</div>
            <div className="stat-value">{stats.overdue || 0}</div>
          </div>
          <div className="stat-card stat-urgent">
            <div className="stat-label">Urgent</div>
            <div className="stat-value">{stats.urgent || 0}</div>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 24 }}>
          {/* Recent Tasks */}
          <div>
            <div className="section-header">
              <h2 className="section-title">Recent Tasks</h2>
              <Link to="/projects" className="btn btn-ghost btn-sm">View all →</Link>
            </div>

            {recentTasks.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px' }}>
                <div className="empty-icon">📋</div>
                <div className="empty-title">No tasks yet</div>
                <div className="empty-desc">Create a project and add tasks to get started.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentTasks.map(task => {
                  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'done';
                  return (
                    <div key={task.id} className={`task-card ${isOverdue ? 'overdue' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div className="task-title">{task.title}</div>
                        <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
                      </div>
                      <div className="task-meta">
                        <span className="task-project">{task.project_name}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} title={task.priority} />
                        {task.due_date && (
                          <span className={`task-due ${isOverdue ? 'overdue' : ''}`}>
                            📅 {format(parseISO(task.due_date), 'MMM d')}
                          </span>
                        )}
                        {task.assignee_name && (
                          <div className="task-assignee">
                            <div className="avatar avatar-sm" style={{ background: task.assignee_color }}>
                              {getInitials(task.assignee_name)}
                            </div>
                            <span>{task.assignee_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Projects overview */}
          <div>
            <div className="section-header">
              <h2 className="section-title">Projects</h2>
              <Link to="/projects" className="btn btn-ghost btn-sm">View all →</Link>
            </div>

            {projectStats.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px' }}>
                <div className="empty-icon">📁</div>
                <div className="empty-title">No projects yet</div>
                <div className="empty-desc">Create your first project to get started.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projectStats.map(p => {
                  const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                      <div className="card card-hover">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                          <span className={`badge badge-${p.status}`}>{p.status}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                          <span>{p.task_count} tasks</span>
                          <span>{pct}% done</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
