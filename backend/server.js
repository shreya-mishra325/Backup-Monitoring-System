require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const instanceRoutes = require('./routes/instances');
const backupRoutes = require('./routes/backup');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 30 * 60 * 1000 
    }
}));

app.use('/api', authRoutes);
app.use('/api/instances', requireAuth, instanceRoutes);
app.use('/api/backup', requireAuth, backupRoutes);

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);
    res.status(500).json({ success: false, message: err.message });
});
app.listen(PORT, () => {
    console.log(`Backup Monitoring System running at http://localhost:${PORT}`);
});
