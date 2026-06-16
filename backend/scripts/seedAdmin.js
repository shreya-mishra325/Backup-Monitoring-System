require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

async function main() {
    const username = process.argv[2] || 'admin';
    const password = process.argv[3] || 'admin123';
    const fullName = 'Administrator';

    const hash = await bcrypt.hash(password, 10);

    try {
        const [existing] = await pool.query('SELECT user_id FROM users WHERE username = ?', [username]);

        if (existing.length > 0) {
            await pool.query('UPDATE users SET password = ?, full_name = ? WHERE username = ?', [hash, fullName, username]);
            console.log(`Updated existing user "${username}" with new password.`);
        } else {
            await pool.query(
                'INSERT INTO users (username, password, full_name) VALUES (?, ?, ?)',
                [username, hash, fullName]
            );
            console.log(`Created user "${username}".`);
        }
        console.log(`Login with: ${username} / ${password}`);
    } catch (err) {
        console.error('Error seeding admin user:', err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
