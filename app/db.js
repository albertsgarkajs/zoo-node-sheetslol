// db.js
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const dbPath = isProd ? '/tmp/db.sqlite' : path.join(__dirname, 'db.sqlite');

// Kopē DB no saknes uz /tmp (Render)
if (isProd && fs.existsSync('./db.sqlite') && !fs.existsSync(dbPath)) {
    fs.copyFileSync('./db.sqlite', dbPath);
    console.log('[DB] Copied db.sqlite → /tmp/db.sqlite');
}

// Izveido DB objektu
const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('[DB] Connection error:', err);
    else console.log(`[DB] Connected to ${dbPath}`);
});

// Promisify funkcijas
export const dbRun = (sql, params = []) => 
    new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });

export const dbGet = (sql, params = []) => 
    new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

export const dbAll = (sql, params = []) => 
    new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

// Eksportējam arī pašu DB (ja vajag citur)
export const db = sqliteDb;