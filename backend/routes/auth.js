const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
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

module.exports = router;
