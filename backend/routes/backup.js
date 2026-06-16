const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

function parseBackupDateTime(str) {
    if (!str) return null;

    const match = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;

    let [, day, month, year, hours, minutes, ampm] = match;
    day = parseInt(day, 10);
    month = parseInt(month, 10) - 1;
    year = parseInt(year, 10);
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

    const date = new Date(year, month, day, hours, minutes, 0);
    return isNaN(date.getTime()) ? null : date;
}

function toMysqlDatetime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
}

router.post('/schedule', async (req, res) => {
    const { instanceId, backupLocation, backupPath, backupDateTime } = req.body;
    const id = parseInt(instanceId, 10);

    if (!id || !backupLocation || !backupPath || !backupDateTime) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const parsedDate = parseBackupDateTime(backupDateTime);
    if (!parsedDate) {
        return res.json({ success: false, message: 'Invalid date/time format. Use dd.mm.yyyy hh:mm AM/PM' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `UPDATE backup_schedules SET status = 'Cancelled'
             WHERE instance_id = ? AND status = 'Scheduled'`,
            [id]
        );

        await conn.query(
            `INSERT INTO backup_schedules (instance_id, backup_location, backup_path, backup_datetime, status)
             VALUES (?, ?, ?, ?, 'Scheduled')`,
            [id, backupLocation, backupPath, toMysqlDatetime(parsedDate)]
        );

        await conn.commit();
        res.json({ success: true, message: `Backup scheduled successfully for ${backupDateTime}` });

    } catch (err) {
        await conn.rollback();
        console.error('Error scheduling backup:', err);
        res.json({ success: false, message: 'Failed to schedule backup.' });
    } finally {
        conn.release();
    }
});

router.post('/now', async (req, res) => {
    const { instanceId, backupLocation, backupPath } = req.body;
    const id = parseInt(instanceId, 10);

    if (!id || !backupLocation || !backupPath) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    try {
        const [instRows] = await pool.query('SELECT instance_id FROM instances WHERE instance_id = ?', [id]);
        if (instRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Instance not found.' });
        }

        const startTime = new Date();
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const endTime = new Date();
        const duration = formatDuration(endTime - startTime);
        const fileSize = '10MB';
        const remark = 'Backup completed successfully.';

        await pool.query(
            `INSERT INTO backup_history
                (instance_id, backup_location, backup_path, backup_type, start_time, end_time, duration, file_size, result_status, remark)
             VALUES (?, ?, ?, 'Manual', ?, ?, ?, ?, 'Success', ?)`,
            [id, backupLocation, backupPath, toMysqlDatetime(startTime), toMysqlDatetime(endTime), duration, fileSize, remark]
        );

        await pool.query(
            `UPDATE instances
                SET last_backup_date = NOW(),
                    last_backup_location = ?,
                    last_backup_duration = ?,
                    last_backup_file_size = ?,
                    last_backup_remark = ?
              WHERE instance_id = ?`,
            [backupPath, duration, fileSize, remark, id]
        );
        res.json({ success: true, message: remark, duration, fileSize });

    } catch (err) {
        console.error('Error running backup:', err);
        res.status(500).json({ success: false, message: 'Failed to run backup.' });
    }
});

module.exports = router;
