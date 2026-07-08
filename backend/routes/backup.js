const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { spawn } = require('child_process');
const pool     = require('../db/pool');
const router = express.Router();

function toMysqlDatetime(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} ` +
           `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function formatDuration(ms) {
    const secs = Math.round(ms / 1000);
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

function formatFileSize(bytes) {
    if (bytes < 1024)           return `${bytes} B`;
    if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseBackupDateTime(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let [, day, month, year, hours, minutes, ampm] = m;
    hours = parseInt(hours, 10);
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    const d = new Date(+year, +month - 1, +day, hours, +minutes, 0);
    return isNaN(d.getTime()) ? null : d;
}

function ensureBackupDir(backupPath) {
    const dir = path.resolve(backupPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function makeFilename(instanceName, dbType) {
    const now  = new Date();
    const pad  = (n) => String(n).padStart(2, '0');
    const ts   = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_` +
                 `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ext  = dbType.toLowerCase().includes('oracle') ? 'dmp' : 'sql';
    const safe = instanceName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `backup_${safe}_${ts}.${ext}`;
}

async function getUserDatabases(instance) {
    const mysql = require("mysql2/promise");
    const conn = await mysql.createConnection({
        host: instance.instance_ip,
        port: instance.port_number,
        user: instance.db_username || "root",
        password: instance.db_password || ""
    });

    const [rows] = await conn.query("SHOW DATABASES");
    await conn.end();

    const systemSchemas = [
        "information_schema",
        "mysql",
        "performance_schema",
        "sys"
    ];

    return rows
        .map(r => r.Database)
        .filter(db => !systemSchemas.includes(db));
}

async function runBackup(instance, backupDir) {

    const filename = makeFilename(instance.instance_name, instance.database_type);
    const filePath = path.join(backupDir, filename);
    const startTime = Date.now();

    const type = (instance.database_type || '').toLowerCase();
    const ip = instance.instance_ip;
    const port = instance.port_number;
    const user = instance.db_username || 'root';
    const pass = instance.db_password || '';

    let cmd, args, env;

    if (type.includes('mysql')) {

        cmd = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe';

        const databases = await getUserDatabases(instance);

        if (databases.length === 0) {
            throw new Error("No user databases found.");
        }

        args = [
            `-h${ip}`,
            `-P${port}`,
            `-u${user}`,
            "--databases",
            ...databases,
            "--single-transaction",
            "--routines",
            "--triggers",
            `--result-file=${filePath}`
        ];

        env = {
            ...process.env,
            MYSQL_PWD: pass
        };

    }
    else if (type.includes('oracle')) {

        cmd = 'exp';

        args = [
            `${user}/${pass}@${ip}:${port}/ORCL`,
            `FILE=${filePath}`,
            `FULL=Y`,
            `LOG=${filePath}.log`
        ];

        env = { ...process.env };

    }
    else if (type.includes('postgres')) {

        cmd = 'pg_dump';

        args = [
            "-h", ip,
            "-p", String(port),
            "-U", user,
            "-F", "c",
            "-f", filePath,
            "--no-password"
        ];

        env = {
            ...process.env,
            PGPASSWORD: pass
        };

    }
    else {

        throw new Error("Unsupported database type.");

    }

    console.log(
        `[Backup] Running: ${cmd} ${args.filter(a => !String(a).includes(pass)).join(" ")}`
    );

    return new Promise((resolve, reject) => {

        const proc = spawn(cmd, args, {
            env,
            shell: false
        });

        let stderr = "";

        proc.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });

        proc.on("error", err => {

            if (err.code === "ENOENT") {

                return reject(new Error(
                    `'${cmd}' not found. Make sure it is installed and on your PATH.`
                ));

            }

            reject(err);

        });

        proc.on("close", code => {

            const duration = formatDuration(Date.now() - startTime);

            if (code !== 0) {

                try {
                    if (fs.existsSync(filePath))
                        fs.unlinkSync(filePath);
                } catch (_) {}

                return reject(
                    new Error(`${cmd} exited with code ${code}. ${stderr.trim()}`)
                );

            }

            let fileSize = "0 B";

            try {

                fileSize = formatFileSize(fs.statSync(filePath).size);

            } catch (_) {}

            resolve({

                filePath,
                fileName: filename,
                fileSize,
                duration,
                remark: `Backup completed successfully. File: ${filename}`

            });

        });

    });

}

router.post('/now', async (req, res) => {
    const { instanceId, backupLocation, backupPath } = req.body;
    const id = parseInt(instanceId, 10);

    if (!id || !backupPath) {
        return res.json({ success: false, message: 'instanceId and backupPath are required.' });
    }
    const [rows] = await pool.query('SELECT * FROM instances WHERE instance_id = ?', [id]);
    if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Instance not found.' });
    }
    const instance = rows[0];

    const startTime = new Date();
    let filePath, fileName, fileSize, duration, remark, resultStatus;

    try {
        const dir = ensureBackupDir(backupPath);
        const result = await runBackup(instance, dir);

        filePath     = result.filePath;
        fileName     = result.fileName;
        fileSize     = result.fileSize;
        duration     = result.duration;
        remark       = result.remark;
        resultStatus = 'Success';

    } catch (err) {
        console.error('[Backup] Error:', err.message);
        duration     = formatDuration(Date.now() - startTime.getTime());
        fileSize     = '0 B';
        remark       = `Backup failed: ${err.message}`;
        resultStatus = 'Failed';
    }

    const endTime = new Date();

    await pool.query(
        `INSERT INTO backup_history
            (instance_id, backup_location, backup_path, backup_type,
            start_time, end_time, duration, file_size, file_name, result_status, remark)
         VALUES (?, ?, ?, 'Manual', ?, ?, ?, ?, ?, ?, ?)`,
        [id, backupLocation || 'Local Drive', backupPath,
         toMysqlDatetime(startTime), toMysqlDatetime(endTime),
         duration, fileSize, fileName || null, resultStatus, remark]
    );

    await pool.query(
        `UPDATE instances
            SET last_backup_date     = NOW(),
                last_backup_location = ?,
                last_backup_duration = ?,
                last_backup_file_size= ?,
                last_backup_remark   = ?
          WHERE instance_id = ?`,
        [backupPath, duration, fileSize, remark, id]
    );

    return res.json({
        success:  resultStatus === 'Success',
        message:  remark,
        duration,
        fileSize,
    });
});

router.post('/schedule', async (req, res) => {
    const { instanceId, backupLocation, backupPath, backupDateTime } = req.body;
    const id = parseInt(instanceId, 10);

    if (!id || !backupLocation || !backupPath || !backupDateTime) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const parsedDate = parseBackupDateTime(backupDateTime);
    if (!parsedDate) {
        return res.json({
            success: false,
            message: 'Invalid date/time. Use format: dd.mm.yyyy hh:mm AM/PM'
        });
    }

    if (parsedDate.getTime() <= Date.now()) {
        return res.json({ success: false, message: 'Please choose a future date and time.' });
    }

    const conn = await pool.getConnection();
    try {
        const mysqlDateTime = toMysqlDatetime(parsedDate);

        const [conflicts] = await conn.query(
            `SELECT schedule_id FROM backup_schedules
              WHERE status = 'Scheduled' AND backup_datetime = ?`,
            [mysqlDateTime]
        );
        if (conflicts.length > 0) {
            return res.json({
                success: false,
                message: 'Another backup is already scheduled for that exact date & time. Please choose a different time.'
            });
        }

        await conn.beginTransaction();

        const [result] = await conn.query(
            `INSERT INTO backup_schedules
                (instance_id, backup_location, backup_path, backup_datetime, status)
             VALUES (?, ?, ?, ?, 'Scheduled')`,
            [id, backupLocation, backupPath, mysqlDateTime]
        );
        await conn.commit();

        scheduleBackupJob({
            scheduleId:     result.insertId,
            instanceId:     id,
            backupLocation,
            backupPath,
            runAt:          parsedDate,
        });

        res.json({ success: true, message: `Backup scheduled for ${backupDateTime}`, scheduleId: result.insertId });

    } catch (err) {
        await conn.rollback();
        console.error('Schedule error:', err);
        res.json({ success: false, message: 'Failed to schedule backup.' });
    } finally {
        conn.release();
    }
});

router.put('/schedule/:id', async (req, res) => {
    const scheduleId = parseInt(req.params.id, 10);
    const { backupLocation, backupPath, backupDateTime } = req.body;

    if (!scheduleId || !backupLocation || !backupPath || !backupDateTime) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const parsedDate = parseBackupDateTime(backupDateTime);
    if (!parsedDate) {
        return res.json({
            success: false,
            message: 'Invalid date/time. Use format: dd.mm.yyyy hh:mm AM/PM'
        });
    }

    if (parsedDate.getTime() <= Date.now()) {
        return res.json({ success: false, message: 'Please choose a future date and time.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM backup_schedules WHERE schedule_id = ?`,
            [scheduleId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Scheduled backup not found.' });
        }
        const schedule = rows[0];
        if (schedule.status !== 'Scheduled') {
            return res.json({ success: false, message: 'Only pending scheduled backups can be edited.' });
        }

        const mysqlDateTime = toMysqlDatetime(parsedDate);

        const [conflicts] = await pool.query(
            `SELECT schedule_id FROM backup_schedules
              WHERE status = 'Scheduled' AND backup_datetime = ? AND schedule_id != ?`,
            [mysqlDateTime, scheduleId]
        );
        if (conflicts.length > 0) {
            return res.json({
                success: false,
                message: 'Another backup is already scheduled for that exact date & time. Please choose a different time.'
            });
        }

        await pool.query(
            `UPDATE backup_schedules
                SET backup_location = ?, backup_path = ?, backup_datetime = ?
              WHERE schedule_id = ?`,
            [backupLocation, backupPath, mysqlDateTime, scheduleId]
        );

        const existingJob = scheduledJobs.get(scheduleId);
        if (existingJob) {
            clearTimeout(existingJob);
            scheduledJobs.delete(scheduleId);
        }

        scheduleBackupJob({
            scheduleId,
            instanceId: schedule.instance_id,
            backupLocation,
            backupPath,
            runAt: parsedDate,
        });

        res.json({ success: true, message: 'Scheduled backup updated successfully.' });

    } catch (err) {
        console.error('Reschedule error:', err);
        res.status(500).json({ success: false, message: 'Failed to update scheduled backup.' });
    }
});

router.delete('/schedule/:id', async (req, res) => {
    const scheduleId = parseInt(req.params.id, 10);
    if (!scheduleId) {
        return res.status(400).json({ success: false, message: 'Invalid schedule id.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT status FROM backup_schedules WHERE schedule_id = ?`,
            [scheduleId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Scheduled backup not found.' });
        }
        if (rows[0].status !== 'Scheduled') {
            return res.json({ success: false, message: 'Only pending scheduled backups can be cancelled.' });
        }

        const existingJob = scheduledJobs.get(scheduleId);
        if (existingJob) {
            clearTimeout(existingJob);
            scheduledJobs.delete(scheduleId);
        }

        await pool.query(
            `UPDATE backup_schedules SET status = 'Cancelled' WHERE schedule_id = ?`,
            [scheduleId]
        );

        res.json({ success: true, message: 'Scheduled backup cancelled.' });

    } catch (err) {
        console.error('Cancel schedule error:', err);
        res.status(500).json({ success: false, message: 'Failed to cancel scheduled backup.' });
    }
});

const scheduledJobs = new Map();

function scheduleBackupJob({ scheduleId, instanceId, backupLocation, backupPath, runAt }) {
    const delay = runAt.getTime() - Date.now();
    if (delay < 0) {
        console.warn(`[Scheduler] Schedule ${scheduleId} is in the past — skipping.`);
        return;
    }
    console.log(`[Scheduler] Job ${scheduleId} registered. Fires in ${Math.round(delay/1000)}s at ${runAt}`);

    const handle = setTimeout(async () => {
        scheduledJobs.delete(scheduleId);
        console.log(`[Scheduler] Running scheduled backup ${scheduleId} for instance ${instanceId}`);

        const [rows] = await pool.query('SELECT * FROM instances WHERE instance_id = ?', [instanceId]);
        if (rows.length === 0) return;

        const instance  = rows[0];
        const startTime = new Date();
        let fileName, fileSize, duration, remark, resultStatus;

        try {
            const dir    = ensureBackupDir(backupPath);
            const result = await runBackup(instance, dir);
            fileName     = result.fileName;
            fileSize     = result.fileSize;
            duration     = result.duration;
            remark       = result.remark;
            resultStatus = 'Success';
        } catch (err) {
            console.error('[Scheduler] Backup failed:', err.message);
            duration     = formatDuration(Date.now() - startTime.getTime());
            fileSize     = '0 B';
            remark       = `Scheduled backup failed: ${err.message}`;
            resultStatus = 'Failed';
        }

        const endTime = new Date();

        await pool.query(
            `INSERT INTO backup_history
                (instance_id, backup_location, backup_path, backup_type,
                 start_time, end_time, duration, file_size, file_name, result_status, remark)
             VALUES (?, ?, ?, 'Scheduled', ?, ?, ?, ?, ?, ?, ?)`,
            [instanceId, backupLocation, backupPath,
             toMysqlDatetime(startTime), toMysqlDatetime(endTime),
             duration, fileSize, fileName || null, resultStatus, remark]
        );

        await pool.query(
            `UPDATE instances
                SET last_backup_date = NOW(), last_backup_location = ?,
                    last_backup_duration = ?, last_backup_file_size = ?,
                    last_backup_remark = ?
              WHERE instance_id = ?`,
            [backupPath, duration, fileSize, remark, instanceId]
        );

        await pool.query(
            `UPDATE backup_schedules SET status = ? WHERE schedule_id = ?`,
            [resultStatus === 'Success' ? 'Completed' : 'Failed', scheduleId]
        );

        console.log(`[Scheduler] Job ${scheduleId} finished: ${resultStatus}`);

    }, delay);

    scheduledJobs.set(scheduleId, handle);
}

async function reloadScheduledJobs() {
    try {
        const [rows] = await pool.query(
            `SELECT s.*, i.instance_ip, i.port_number, i.db_username, i.db_password
               FROM backup_schedules s
               JOIN instances i USING (instance_id)
              WHERE s.status = 'Scheduled' AND s.backup_datetime > NOW()`
        );

        rows.forEach(row => {
            scheduleBackupJob({
                scheduleId:     row.schedule_id,
                instanceId:     row.instance_id,
                backupLocation: row.backup_location,
                backupPath:     row.backup_path,
                runAt:          new Date(row.backup_datetime),
            });
        });
        if (rows.length > 0) {
            console.log(`[Scheduler] Reloaded ${rows.length} pending scheduled job(s).`);
        }
    } catch (err) {
        console.error('[Scheduler] Failed to reload jobs:', err.message);
    }
}
reloadScheduledJobs();

router.get('/reports', async (req, res) => {
    try {
        const [[instanceCount]] = await pool.query(`
            SELECT COUNT(*) AS totalInstances
            FROM instances
        `);
        const [[backupSummary]] = await pool.query(`
            SELECT
                COUNT(*) AS totalBackups,
                SUM(result_status='Success') AS successfulBackups,
                SUM(result_status='Failed') AS failedBackups
            FROM backup_history
        `);

        const [sizeRows] = await pool.query(`
            SELECT file_size
            FROM backup_history
            WHERE file_size IS NOT NULL
        `);

        let totalSize = 0;

        sizeRows.forEach(r => {
            if (!r.file_size) return;
            const value = parseFloat(r.file_size);
            if (isNaN(value)) return;
            if (r.file_size.includes('KB'))
                totalSize += value / 1024;
            else if (r.file_size.includes('MB'))
                totalSize += value;
            else if (r.file_size.includes('GB'))
                totalSize += value * 1024;
        });

        const averageSize = sizeRows.length === 0 ? "0 MB" : (totalSize / sizeRows.length).toFixed(2) + " MB";
        const total = backupSummary.totalBackups || 0;
        const success = backupSummary.successfulBackups || 0;
        const successRate = total === 0 ? "0%" : ((success * 100) / total).toFixed(1) + "%";
        const [instanceSummary] = await pool.query(`
            SELECT
                i.instance_name AS instanceName,
                COUNT(h.history_id) AS total,
                SUM(h.result_status='Success') AS success,
                SUM(h.result_status='Failed') AS failed
            FROM instances i
            LEFT JOIN backup_history h
            ON i.instance_id=h.instance_id
            GROUP BY i.instance_id
            ORDER BY i.instance_name
        `);

        const [recentActivity] = await pool.query(`
            SELECT
                h.history_id AS historyId,
                h.start_time AS backupDate,
                i.instance_name AS instanceName,
                UPPER(h.result_status) AS status,
                h.remark,
                h.file_name AS fileName

            FROM backup_history h
            JOIN instances i
            ON h.instance_id=i.instance_id
            ORDER BY h.start_time DESC
            LIMIT 10
        `);

        res.json({
            summary: {
                totalInstances: instanceCount.totalInstances,
                totalBackups: backupSummary.totalBackups || 0,
                successfulBackups: backupSummary.successfulBackups || 0,
                failedBackups: backupSummary.failedBackups || 0,
                successRate,
                averageBackupSize: averageSize
            },
            instanceSummary,
            recentActivity
        });
    }
    catch (err) {
        console.error("Reports Error:", err);
        res.status(500).json({
            error: "Failed to generate reports."
        });
    }
});

router.get("/export", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                h.history_id,
                i.instance_name,
                h.backup_type,
                h.backup_location,
                h.backup_path,
                h.start_time,
                h.end_time,
                h.duration,
                h.file_size,
                h.result_status,
                h.remark

            FROM backup_history h
            JOIN instances i
            ON h.instance_id = i.instance_id
            ORDER BY h.start_time DESC
        `);
        let csv = "History ID,Instance Name,Backup Type,Backup Location,Backup Path,Start Time,End Time,Duration,File Size,Status,Remark\n";
        rows.forEach(r => {

            csv += `"${r.history_id}",`;
            csv += `"${r.instance_name}",`;
            csv += `"${r.backup_type}",`;
            csv += `"${r.backup_location}",`;
            csv += `"${r.backup_path}",`;
            csv += `"${r.start_time}",`;
            csv += `"${r.end_time}",`;
            csv += `"${r.duration}",`;
            csv += `"${r.file_size}",`;
            csv += `"${r.result_status}",`;
            csv += `"${(r.remark || "").replace(/"/g,'""')}"\n`;

        });
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=backup-history.csv"
        );
        res.setHeader(
            "Content-Type",
            "text/csv"
        );
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to export CSV.");
    }
});

router.get('/download/:historyId', async (req, res) => {
    const id = parseInt(req.params.historyId, 10);
    if (!id) {
        return res.status(400).json({ error: 'Invalid backup id.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT backup_path, file_name, result_status FROM backup_history WHERE history_id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Backup record not found.' });
        }

        const record = rows[0];

        if (record.result_status !== 'Success' || !record.file_name) {
            return res.status(400).json({ error: 'No downloadable file for this backup.' });
        }

        const filePath = path.join(path.resolve(record.backup_path), record.file_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Backup file no longer exists on the server.' });
        }

        res.download(filePath, record.file_name);

    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download backup file.' });
    }
});

router.get('/schedules', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                s.schedule_id      AS scheduleId,
                i.instance_name    AS instanceName,
                s.backup_location  AS backupLocation,
                s.backup_path      AS backupPath,
                s.backup_datetime  AS backupDatetime,
                s.status           AS status,
                s.created_at       AS createdAt
            FROM backup_schedules s
            JOIN instances i ON s.instance_id = i.instance_id
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching scheduled backup history:', err);
        res.status(500).json({ error: 'Failed to fetch scheduled backup history.' });
    }
});

module.exports = router;