# TaskFlow — Team Task Manager

A full-stack team task management application with role-based access control, project management, and a Kanban board interface.

🚀 **Live Demo**: [Deploy to Railway first, then add URL here]

---

## Features

### Authentication
- JWT-based signup/login
- Persistent sessions (7-day token expiry)
- Role selection on signup (Admin / Member)

### Role-Based Access Control
- **Admin**: Full access to all projects, tasks, and users
- **Member**: Access only to projects they own or are invited to
- **Project Admin**: Manage members and project settings within a project
- **Project Member**: Create and manage tasks within a project

### Projects
- Create, edit, archive, and delete projects
- Invite team members with roles (Admin / Member)
- Project progress tracking with completion percentage
- Project status: Active, Completed, Archived

### Tasks
- Create tasks with title, description, priority, status, assignee, and due date
- Kanban board view (To Do → In Progress → Review → Done)
- List view with sortable columns
- Task comments/discussion thread
- Overdue task highlighting
- Priority levels: Low, Medium, High, Urgent

### Dashboard
- Summary stats: Total, In Progress, Done, Overdue, Urgent
- Recent task activity
- Project progress overview

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Vite |
| Styling | Custom CSS with CSS variables (dark theme) |
| Backend | Node.js, Express.js |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT + bcryptjs |
| Deployment | Railway |

---

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/taskflow.git
cd taskflow

# Install dependencies
npm install --prefix backend
npm install --prefix frontend

# Start backend (port 5000)
npm run dev:backend

# In another terminal, start frontend (port 5173)
npm run dev:frontend
```

Open http://localhost:5173

### Environment Variables (Backend)

Create `backend/.env`:
```
PORT=5000
NODE_ENV=development
JWT_SECRET=dev-secret-key
```

---

## Deployment on Railway

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### Step 2: Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `taskflow` repository
4. Railway auto-detects `railway.toml` and runs the build

### Step 3: Set Environment Variables

In Railway dashboard → your service → Variables:
```
NODE_ENV=production
JWT_SECRET=your-super-long-random-secret-key
PORT=5000
```

### Step 4: Add Persistent Storage (for SQLite)

1. In Railway dashboard → your service → **Add Volume**
2. Mount path: `/data`
3. Add env variable: `DB_PATH=/data/taskflow.db`

> Without a volume, data resets on each deploy. Add a volume for persistence.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register new user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |
| GET | /api/auth/users | List all users |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List user's projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Get project + members |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| POST | /api/projects/:id/members | Add member |
| DELETE | /api/projects/:id/members/:userId | Remove member |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks/dashboard | Get dashboard stats |
| GET | /api/tasks/project/:id | List tasks by project |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/tasks/:id/comments | Get comments |
| POST | /api/tasks/:id/comments | Add comment |

---

## Database Schema

```
users ──< project_members >── projects
                                 │
                              tasks ──< task_comments
                                 │
                              users (assignee)
```

---

## Project Structure

```
taskflow/
├── backend/
│   ├── db/
│   │   └── database.js      # SQLite setup & schema
│   ├── middleware/
│   │   └── auth.js          # JWT + RBAC middleware
│   ├── routes/
│   │   ├── auth.js          # Auth endpoints
│   │   ├── projects.js      # Project endpoints
│   │   └── tasks.js         # Task endpoints
│   ├── server.js            # Express app
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx   # Sidebar layout
│   │   │   └── TaskModal.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── ProjectDetail.jsx
│   │   │   ├── Projects.jsx
│   │   │   └── Signup.jsx
│   │   ├── api.js           # Axios client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   └── package.json
├── railway.toml
├── package.json
└── README.md
```

---

## License

MIT
