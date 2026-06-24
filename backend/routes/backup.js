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

function runBackup(instance, backupDir) {
    return new Promise((resolve, reject) => {
        const filename  = makeFilename(instance.instance_name, instance.database_type);
        const filePath  = path.join(backupDir, filename);
        const startTime = Date.now();

        const type = (instance.database_type || '').toLowerCase();
        const ip   = instance.instance_ip;
        const port = instance.port_number;
        const user = instance.db_username || 'root';
        const pass = instance.db_password || '';

        let cmd, args, env;

        if (type.includes('mysql')) {
            cmd = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe';
            args = [
                `-h${ip}`,
                `-P${port}`,
                `-u${user}`,
                `--all-databases`,
                `--single-transaction`,
                `--routines`,
                `--triggers`,
                `--result-file=${filePath}`,
            ];
            env = { ...process.env, MYSQL_PWD: pass };

        } else if (type.includes('oracle')) {
            cmd  = 'exp';
            args = [
                `${user}/${pass}@${ip}:${port}/ORCL`,
                `FILE=${filePath}`,
                `FULL=Y`,
                `LOG=${filePath}.log`,
            ];
            env = { ...process.env };

        } else if (type.includes('postgresql') || type.includes('postgres')) {
            cmd  = 'pg_dump';
            args = [
                `-h`, ip,
                `-p`, String(port),
                `-U`, user,
                `-F`, 'c',          
                `-f`, filePath,
                `--no-password`,
            ];
            env = { ...process.env, PGPASSWORD: pass };

        } else {
            cmd  = 'mysqldump';
            args = [
                `-h${ip}`, `-P${port}`, `-u${user}`,
                `--all-databases`, `--single-transaction`,
                `--result-file=${filePath}`,
            ];
            env = { ...process.env, MYSQL_PWD: pass };
        }

        console.log(`[Backup] Running: ${cmd} ${args.filter(a => !a.includes(pass)).join(' ')}`);

        const proc = spawn(cmd, args, { env, shell: false });

        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            const duration = formatDuration(Date.now() - startTime);

            if (code !== 0) {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
                return reject(new Error(`${cmd} exited with code ${code}. ${stderr.trim()}`));
            }

            let fileSize = '0 B';
            try {
                const stats = fs.statSync(filePath);
                fileSize = formatFileSize(stats.size);
            } catch (_) {}

            resolve({
                filePath,
                fileSize,
                duration,
                remark: `Backup completed successfully. File: ${filename}`,
            });
        });

        proc.on('error', (err) => {
            if (err.code === 'ENOENT') {
                return reject(new Error(
                    `'${cmd}' not found. Make sure it is installed and on your system PATH.\n` +
                    `  MySQL  -> install MySQL client tools (includes mysqldump)\n` +
                    `  Oracle -> install Oracle Instant Client\n` +
                    `  PostgreSQL -> install PostgreSQL client`
                ));
            }
            reject(err);
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
    let filePath, fileSize, duration, remark, resultStatus;

    try {
        const dir = ensureBackupDir(backupPath);
        const result = await runBackup(instance, dir);

        filePath     = result.filePath;
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
            start_time, end_time, duration, file_size, result_status, remark)
         VALUES (?, ?, ?, 'Manual', ?, ?, ?, ?, ?, ?)`,
        [id, backupLocation || 'Local Drive', backupPath,
         toMysqlDatetime(startTime), toMysqlDatetime(endTime),
         duration, fileSize, resultStatus, remark]
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

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `UPDATE backup_schedules SET status = 'Cancelled'
              WHERE instance_id = ? AND status = 'Scheduled'`,
            [id]
        );

        const [result] = await conn.query(
            `INSERT INTO backup_schedules
                (instance_id, backup_location, backup_path, backup_datetime, status)
             VALUES (?, ?, ?, ?, 'Scheduled')`,
            [id, backupLocation, backupPath, toMysqlDatetime(parsedDate)]
        );
        await conn.commit();

        scheduleBackupJob({
            scheduleId:     result.insertId,
            instanceId:     id,
            backupLocation,
            backupPath,
            runAt:          parsedDate,
        });

        res.json({ success: true, message: `Backup scheduled for ${backupDateTime}` });

    } catch (err) {
        await conn.rollback();
        console.error('Schedule error:', err);
        res.json({ success: false, message: 'Failed to schedule backup.' });
    } finally {
        conn.release();
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
        let fileSize, duration, remark, resultStatus;

        try {
            const dir    = ensureBackupDir(backupPath);
            const result = await runBackup(instance, dir);
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
                 start_time, end_time, duration, file_size, result_status, remark)
             VALUES (?, ?, ?, 'Scheduled', ?, ?, ?, ?, ?, ?)`,
            [instanceId, backupLocation, backupPath,
             toMysqlDatetime(startTime), toMysqlDatetime(endTime),
             duration, fileSize, resultStatus, remark]
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
                h.start_time AS backupDate,
                i.instance_name AS instanceName,
                UPPER(h.result_status) AS status,
                h.remark

            FROM backup_history h
            JOIN instances i
            ON h.instance_id=i.instance_id
            ORDER BY h.start_time DESC
            LIMIT 15
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

module.exports = router;