const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

function listWindowsDrives() {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drivePath = `${letter}:\\`;
        try {
            if (fs.existsSync(drivePath)) drives.push(drivePath);
        } catch (_) {}
    }
    return drives;
}

router.get('/list', (req, res) => {
    try {
        const reqPath = req.query.path;
        if (!reqPath) {
            if (process.platform === 'win32') {
                return res.json({
                    path: null,
                    parent: null,
                    directories: listWindowsDrives().map(d => ({ name: d, path: d }))
                });
            }
            const rootEntries = fs.readdirSync('/', { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => ({ name: e.name, path: path.join('/', e.name) }))
                .sort((a, b) => a.name.localeCompare(b.name));
            return res.json({ path: '/', parent: null, directories: rootEntries });
        }

        const resolved = path.resolve(reqPath);

        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            return res.status(400).json({ error: 'That path does not exist or is not a folder.' });
        }

        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const directories = entries
            .filter(e => e.isDirectory())
            .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const isWindowsDriveRoot = process.platform === 'win32' && /^[A-Za-z]:\\?$/.test(resolved);
        const isUnixRoot = resolved === '/';
        const parentDir = path.dirname(resolved);

        res.json({
            path: resolved,
            parent: (isWindowsDriveRoot || isUnixRoot) ? null : parentDir,
            directories
        });

    } catch (err) {
        console.error('Filesystem browse error:', err);
        res.status(500).json({ error: 'Failed to list folder. Check server permissions.' });
    }
});

module.exports = router;
