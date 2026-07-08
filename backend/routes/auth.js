const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/session', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ loggedIn: true, username: req.session.user.username });
    }
    return res.json({ loggedIn: false });
});

router.post('/login', async (req, res) => {
    console.log('LOGIN REQUEST:', req.body);
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: 'Username and password are required.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT user_id, username, password, full_name FROM users WHERE username = ?',
            [username]
        );
        if (rows.length === 0) {
            return res.json({ success: false, message: 'Invalid username or password.' });
        }
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.json({ success: false, message: 'Invalid username or password.' });
        }
        req.session.user = {
            userId: user.user_id,
            username: user.username,
            fullName: user.full_name
        };
        return res.json({ success: true, username: user.username });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false, message: 'Error logging out.' });
        }
        res.clearCookie('connect.sid');
        return res.json({ success: true });
    });
});

router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.json({ success: false, message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    try {
        const userId = req.session.user.userId;
        const [rows] = await pool.query(
            'SELECT password FROM users WHERE user_id = ?',
            [userId]
        );
        if (rows.length === 0) {
            return res.json({ success: false, message: 'User not found.' });
        }
        const match = await bcrypt.compare(currentPassword, rows[0].password);
        if (!match) {
            return res.json({ success: false, message: 'Current password is incorrect.' });
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password = ? WHERE user_id = ?',
            [hashed, userId]
        );
        return res.json({ success: true, message: 'Password updated successfully.' });

    } catch (err) {
        console.error('Change password error:', err);
        return res.status(500).json({ success: false, message: 'Server error updating password.' });
    }
});

module.exports = router;
