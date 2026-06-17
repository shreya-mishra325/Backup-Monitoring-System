# Backup Monitoring System

A web-based application to monitor database server instances (running on
different IP addresses across the company) and manage their backups — view
status, schedule backups, and trigger immediate backups.

**Tech Stack**
- Frontend: HTML, CSS, JavaScript (vanilla, no framework, `fetch`-based AJAX)
- Backend: Node.js + Express.js (REST JSON API)
- Database: MySQL 8.0 (via `mysql2`)
- Auth: express-session + bcrypt password hashing

---

## 1. Folder Structure

```
BackupMonitoringSystem/
│
├── sql/
│   └── schema.sql                  -- DB schema + seed data
│
├── backend/
│   ├── server.js                   -- Express app entry point
│   ├── package.json
│   ├── .env.example                -- copy to .env and edit
│   │
│   ├── db/
│   │   └── pool.js                 -- MySQL connection pool
│   │
│   ├── middleware/
│   │   └── auth.js                 -- requireAuth session guard
│   │
│   ├── routes/
│   │   ├── auth.js                 -- /api/session, /api/login, /api/logout
│   │   ├── instances.js            -- /api/instances/*
│   │   └── backup.js               -- /api/backup/*
│   │
│   └── scripts/
│       ├── hashPassword.js         -- print a bcrypt hash for any password
│       └── seedAdmin.js            -- create/update the default admin user
│
└── frontend/
    ├── css/
    │   └── style.css
    ├── js/
    │   ├── app.js                  -- shared topbar/tabs/session check
    │   ├── login.js
    │   ├── home.js
    │   └── addInstance.js
    │
    ├── login.html        -- Login page (wireframe page 1)
    ├── home.html          -- Dashboard: instance list + details + backup config (wireframe page 2)
    ├── addInstance.html   -- Add New Instance form (wireframe page 3)
    ├── three.html         -- Placeholder tab
    └── four.html          -- Placeholder tab
```
---

## 2. Database Setup

1. Start MySQL and run the schema script:
   ```bash
   mysql -u root -p < sql/schema.sql
   ```
   This creates the database `backup_monitor_db` with tables:
   - `users` — login credentials
   - `instances` — monitored DB server instances (ICARD, etc., with seed data)
   - `backup_schedules` — scheduled backup jobs
   - `backup_history` — log of every backup run

2. Create the default admin user (bcrypt hashes can't be hard-coded safely
   in the SQL file, so this is done via a script — see step 4 below).
---

## 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your MySQL credentials:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your_mysql_password>
DB_NAME=backup_monitor_db
SESSION_SECRET=some-long-random-string
PORT=3000
```

---

## 4. Create the Default Admin User

```bash
cd backend
node scripts/seedAdmin.js
```

This creates a user `admin` with password `admin123` (or pass your own:
`node scripts/seedAdmin.js myuser mypassword`).

---

## 5. Run the App

```bash
cd backend
npm start
```

Or for auto-reload during development:
```bash
npm run dev
```

Open your browser at:
```
http://localhost:3000
```

Log in with `admin` / `admin123` (or whatever you set in step 4).

---

## 6. API Reference

| Method | Endpoint                              | Auth | Description |
|--------|----------------------------------------|------|-------------|
| GET    | `/api/session`                          | No   | `{ loggedIn, username }` |
| POST   | `/api/login`                            | No   | Body: `{ username, password }` → `{ success, username? }` |
| GET    | `/api/logout`                           | No   | Destroys session |
| GET    | `/api/instances`                        | Yes  | List all instances |
| GET    | `/api/instances/:id`                    | Yes  | Single instance details |
| GET    | `/api/instances/check-connection?ip=&port=` | Yes | `{ status: "Connected"\|"Disconnected" }` |
| POST   | `/api/instances`                        | Yes  | Body: `{ action: "add"\|"checkAndAdd", instanceName, databaseType, instanceIp, portNumber }` |
| POST   | `/api/backup/schedule`                  | Yes  | Body: `{ instanceId, backupLocation, backupPath, backupDateTime }` (format `dd.mm.yyyy hh:mm AM/PM`) |
| POST   | `/api/backup/now`                       | Yes  | Body: `{ instanceId, backupLocation, backupPath }` |

"Yes" auth endpoints require an active session (set via `/api/login`);
unauthenticated requests get `401 { error, loggedIn: false }`.

---

## 7. Application Flow (maps to wireframe)

### Page 1 — Login (`login.html`)
- Posts `{ username, password }` to `/api/login`.
- On success: server creates a session cookie, frontend redirects to `home.html`.
- On failure: error message shown inline.
- All other pages call `/api/session` on load (via `app.js`/`initLayout`)
  and redirect to `login.html` if not authenticated.

### Page 2 — Home (`home.html`)
- **Left panel**: List of all instances (name + IP + green/red status dot),
  fetched from `GET /api/instances`. Clicking an instance re-renders the
  details panel without a full page reload.
- **Right panel — Instance Details**: Instance Name, Database Type,
  Instance IP:Port, Status, Last Down Time, Last Backup Date, Last Backup
  Location, Last Backup Duration, Last Backup File Size, Last Backup Remark.
- **Configure Backup**:
  - *Schedule Backup* (left): Backup Location (Local Drive / Google Drive /
    Filer Server), Path, and Date & Time (`dd.mm.yyyy hh:mm AM/PM`) →
    `POST /api/backup/schedule`. As per the wireframe note, scheduling a new
    backup automatically cancels any previously active schedule for that
    instance.
  - *Backup Now* (right): Backup Location + Path → `POST /api/backup/now`.
    Logs a `backup_history` row, updates the instance's "Last Backup"
    fields, then the dashboard re-fetches instances to show the new values.

### Page 3 — Add New Instance (`addInstance.html`)
- Fields: Instance Name, Database Type, Instance IP, Port Number.
- **Check Connection** → `GET /api/instances/check-connection?ip=&port=`,
  which opens a raw TCP socket to the given IP:port (3-second timeout) and
  reports Connected/Disconnected.
- **Submit** → `POST /api/instances` (`action: "add"` normally, or
  `"checkAndAdd"` if Check Connection was used first, which also stores the
  resulting status).

### Tabs "Three" / "Four"
- Placeholder pages matching the wireframe's extra tabs, ready for future
  features (e.g. Backup History/Reports, Settings/User Management).

---

## 8. Notes on "Different Servers / IP Addresses"

Each row in `instances` represents a separate database server identified by
its own `instance_ip` + `port_number`. The **Check Connection** feature
(`routes/instances.js` → `checkTcpConnection`) opens a real TCP socket to
that IP/port to verify reachability — this is how the system monitors
servers across the company's network regardless of which machine they run on.

The actual backup execution (`mysqldump`, Oracle `expdp`/RMAN, etc.) is
stubbed in `routes/backup.js` with a simulated duration/file size — replace
that section with real `child_process` calls to your backup tooling for
each database type in production.

---

## 9. Security Notes

- Passwords are hashed with bcrypt (cost factor 10).
- Sessions are stored server-side via `express-session` (default in-memory
  store — for production, use a persistent store like
  `connect-mysql-session` or Redis).
- Set a strong, random `SESSION_SECRET` in `.env` for production.
- Consider adding HTTPS (`cookie.secure = true`) and rate-limiting on
  `/api/login` for production deployments.