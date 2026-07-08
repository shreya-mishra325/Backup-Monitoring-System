const express = require('express');
const net     = require('net');
const pool    = require('../db/pool');

const router = express.Router();

function checkTcpConnection(ip, port, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const finish = (result) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve(result);
        };

        const DEBUG = false;
        socket.setTimeout(timeoutMs);

        socket.once('connect', () => {
            if (DEBUG) {
                console.log(`[TCP] Connected to ${ip}:${port}`);
            }
            finish(true);
        });

        socket.once('timeout', () => {
            if (DEBUG) {
                console.log(`[TCP] Timeout while connecting to ${ip}:${port}`);
            }
            finish(false);
        });

        socket.once('error', (err) => {
            if (DEBUG) {
                console.log(`[TCP] Error for ${ip}:${port} -> ${err.message}`);
            }
            finish(false);
        });

        socket.connect(port, ip);
    });
}

router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM instances ORDER BY instance_name'
        );
        return res.json(
            rows.map(r => mapInstance(r, false))
        );
    } catch (err) {
        console.error('Error fetching instances:', err);
        return res.status(500).json({
            error: 'Failed to fetch instances.'
        });
    }
});

router.get('/refresh-status', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT instance_id, instance_ip, port_number FROM instances'
        );
        for (const row of rows) {
            const connected = await checkTcpConnection(
                row.instance_ip,
                row.port_number,
                1000
            );
            await pool.query(
                'UPDATE instances SET status=? WHERE instance_id=?',
                [
                    connected ? 'Connected' : 'Disconnected',
                    row.instance_id
                ]
            );
        }
        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false
        });
    }
});

router.get('/check-connection', async (req, res) => {
    const { ip, port } = req.query;
    console.log('\n====== CHECK CONNECTION ======');
    console.log('IP:', ip);
    console.log('PORT:', port);

    const portNum = parseInt(port, 10);

    if (!ip || !portNum) {
        return res.status(400).json({
            status: 'Disconnected',
            error: 'IP and Port are required.'
        });
    }

    try {
        const connected = await checkTcpConnection(ip, portNum);

        console.log('RESULT:', connected ? 'CONNECTED' : 'DISCONNECTED');

        return res.json({
            status: connected ? 'Connected' : 'Disconnected'
        });

    } catch (err) {
        console.error('CHECK CONNECTION ERROR:', err);

        return res.status(500).json({
            status: 'Disconnected',
            error: err.message
        });
    }
});


router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid instance id.' });

    try {
        const [rows] = await pool.query('SELECT * FROM instances WHERE instance_id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Instance not found.' });
        res.json(mapInstance(rows[0], false));
    } catch (err) {
        console.error('Error fetching instance:', err);
        res.status(500).json({ error: 'Failed to fetch instance.' });
    }
});

router.post('/', async (req, res) => {
    const {
        action, instanceName, databaseType,
        instanceIp, portNumber, dbUsername, dbPassword
    } = req.body;

    if (!['add', 'checkAndAdd'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Unknown action.' });
    }

    const port = parseInt(portNumber, 10);

    if (!instanceName || !databaseType || !instanceIp || !port) {
        return res.status(400).json({ success: false, message: 'Instance Name, Type, IP and Port are required.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO instances
                (instance_name, database_type, instance_ip, port_number, db_username, db_password, status)
             VALUES (?, ?, ?, ?, ?, ?, 'Disconnected')`,
            [instanceName, databaseType, instanceIp, port,
             dbUsername || 'root', dbPassword || '']
        );

        const newId = result.insertId;

        if (action === 'checkAndAdd') {
            const connected = await checkTcpConnection(instanceIp, port);
            const status    = connected ? 'Connected' : 'Disconnected';
            const sql       = status === 'Disconnected'
                ? 'UPDATE instances SET status = ?, last_down_time = NOW() WHERE instance_id = ?'
                : 'UPDATE instances SET status = ? WHERE instance_id = ?';
            await pool.query(sql, [status, newId]);
        }

        const [rows] = await pool.query('SELECT * FROM instances WHERE instance_id = ?', [newId]);
        res.json({ success: true, instance: mapInstance(rows[0], false) });

    } catch (err) {
        console.error('Error adding instance:', err);
        res.status(500).json({ success: false, message: 'Failed to add instance.' });
    }
});

function mapInstance(row, includePassword = false) {
    const obj = {
        instanceId:         row.instance_id,
        instanceName:       row.instance_name,
        databaseType:       row.database_type,
        instanceIp:         row.instance_ip,
        portNumber:         row.port_number,
        dbUsername:         row.db_username,
        status:             row.status,
        lastDownTime:       row.last_down_time,
        lastBackupDate:     row.last_backup_date,
        lastBackupLocation: row.last_backup_location,
        lastBackupDuration: row.last_backup_duration,
        lastBackupFileSize: row.last_backup_file_size,
        lastBackupRemark:   row.last_backup_remark,
    };
    if (includePassword) obj.dbPassword = row.db_password;
    return obj;
}

router.put('/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);

    const {
        instanceName,
        instanceIp,
        portNumber,
        dbUsername,
        dbPassword
    } = req.body;

    try {
        await pool.query(
            `UPDATE instances
             SET instance_name = ?,
                 instance_ip = ?,
                 port_number = ?,
                 db_username = ?,
                 db_password = ?
             WHERE instance_id = ?`,
            [
                instanceName,
                instanceIp,
                portNumber,
                dbUsername,
                dbPassword,
                id
            ]
        );
        res.json({
            success: true,
            message: "Instance updated successfully."
        });

    } catch (err) {
        console.error("Error updating instance:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update instance."
        });
    }
});
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await pool.query(
        'DELETE FROM instances WHERE instance_id=?',
        [id]
    );
    res.json({ success: true });
});

module.exports = router;
module.exports.checkTcpConnection = checkTcpConnection;
