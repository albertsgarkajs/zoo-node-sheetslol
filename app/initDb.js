// initDb.js
import { db } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  console.log('[DB] Initializing tables and seed data...');

  // 1. Izveido tabulas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT,
      email TEXT,
      is_active INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cage TEXT,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS cage_history (
      task_id INTEGER PRIMARY KEY,
      cages TEXT DEFAULT '',
      dates TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_cage_history_task ON cage_history(task_id);

    CREATE TABLE IF NOT EXISTS weekly_schedule (
      role TEXT,
      weekday INTEGER,
      task_id INTEGER,
      PRIMARY KEY (role, weekday, task_id)
    );

    CREATE TABLE IF NOT EXISTS daily_substitutes (
      main_role TEXT,
      substitute_user TEXT,
      date TEXT,
      PRIMARY KEY (main_role, date)
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      token TEXT UNIQUE,
      expires INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER,
      action TEXT,
      username TEXT,
      date TEXT
    );

    CREATE TABLE IF NOT EXISTS completed_tasks (
      animal_id INTEGER,
      completed_by TEXT,
      date TEXT,
      PRIMARY KEY (animal_id, date)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER,
      user TEXT,
      comment TEXT,
      timestamp TEXT,
      resolved INTEGER DEFAULT 0,
      parent_id INTEGER DEFAULT 0
    );
  `);

  console.log('[DB] Tables created');

  // 2. Inicializē admin lietotājus
  const initialUsers = [
    ['admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Admin', 'admin@example.com', 1],
    ['Zoologs', 'e5ab0b213d8af8e68a31ae1661a6abb65f85c5c2927bf29bdb4b700b58ffc678', 'Zoologs', 'albertsgarkajs@gmail.com', 1],
    // ... pārējie
  ];

  for (const u of initialUsers) {
    const exists = await db.get('SELECT 1 FROM users WHERE username = ?', [u[0]]);
    if (!exists) {
      await db.run(
        'INSERT INTO users (username, password_hash, role, email, is_active) VALUES (?, ?, ?, ?, ?)',
        u
      );
    }
  }

  // 3. Seed tasks no animals.json
  const row = await db.get('SELECT COUNT(*) as count FROM tasks');
  if (row.count === 0) {
    const animalsPath = path.join(__dirname, 'animals.json');
    if (fs.existsSync(animalsPath)) {
      const animals = JSON.parse(fs.readFileSync(animalsPath, 'utf8'));
      const stmt = db.prepare('INSERT OR IGNORE INTO tasks (id, cage, name) VALUES (?, ?, ?)');
      for (const [i, a] of animals.entries()) {
        await stmt.run(i + 1, a.cage, a.name);
      }
      await stmt.finalize();
      console.log(`[SEED] ${animals.length} tasks loaded from animals.json`);
    }
  }

  console.log('[DB] Initialization complete');
}