const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;
const dbPath = path.join(__dirname, 'antigravity.db');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Large limit for excel data
app.use(express.static(__dirname)); // Serve frontend files (Supabase is used for database)

// Database Initialization
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database opening error: ', err);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            advertiser TEXT,
            timestamp INTEGER,
            period TEXT,
            mediaList TEXT,
            totalSpend REAL,
            avgRoas REAL,
            data TEXT,
            aiData TEXT,
            analysisMode TEXT
        )`);
    }
});

// API Endpoints

// 1. Get all reports (Metadata only for list view)
app.get('/api/reports', (req, res) => {
    const query = `SELECT id, advertiser, timestamp, period, mediaList, totalSpend, avgRoas, analysisMode FROM reports ORDER BY timestamp DESC`;
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // Parse mediaList back to array
        const results = rows.map(row => ({
            ...row,
            mediaList: JSON.parse(row.mediaList)
        }));
        res.json(results);
    });
});

// 2. Get specific report detail
app.get('/api/reports/:id', (req, res) => {
    const query = `SELECT * FROM reports WHERE id = ?`;
    db.get(query, [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Report not found' });
            return;
        }
        res.json({
            ...row,
            mediaList: JSON.parse(row.mediaList),
            data: JSON.parse(row.data),
            aiData: row.aiData ? JSON.parse(row.aiData) : null
        });
    });
});

// 3. Save report
app.post('/api/reports', (req, res) => {
    const r = req.body;
    const query = `INSERT OR REPLACE INTO reports (id, advertiser, timestamp, period, mediaList, totalSpend, avgRoas, data, aiData, analysisMode) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
        r.id,
        r.advertiser,
        r.timestamp,
        r.period,
        JSON.stringify(r.mediaList),
        r.totalSpend,
        r.avgRoas,
        JSON.stringify(r.data),
        r.aiData ? JSON.stringify(r.aiData) : null,
        r.analysisMode
    ];

    db.run(query, params, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, id: r.id });
    });
});

// 4. Delete report
app.delete('/api/reports/:id', (req, res) => {
    const query = `DELETE FROM reports WHERE id = ?`;
    db.run(query, [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, deleted: this.changes });
    });
});

// Start Server
app.listen(port, () => {
    console.log(`--------------------------------------------------`);
    console.log(`AntiGravity Server is running!`);
    console.log(`Local Access: http://localhost:${port}`);
    console.log(`LAN Access:   http://[Your-PC-IP]:${port}`);
    console.log(`--------------------------------------------------`);
});
