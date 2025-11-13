// routes/admin.js
import express from 'express';
import { db } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// === KONSTANTES ===
const ROLES = [
    'Vivāriju dzīvnieku kopējs I', 'Vivāriju dzīvnieku kopējs II', 'Vivāriju dzīvnieku kopējs III',
    'Zootehniķis', 'Veterinārārsts', 'Veterinārārsta asistents', 'Entomologs'
];

// === /api/users (admin panelim) ===
router.get('/users', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    try {
        const users = await db.all('SELECT id, username, email, role, is_active FROM users ORDER BY username');
        res.json(users);
    } catch (err) {
        console.error('[ADMIN] /users kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/weekly-schedule (GET) ===
router.get('/weekly-schedule', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    try {
        const rows = await db.all('SELECT role, weekday, task_id FROM weekly_schedule ORDER BY role, weekday');
        const schedule = {};

        rows.forEach(r => {
            const role = r.role?.trim() || 'Bez lomas';
            const day = parseInt(r.weekday);
            if (!role || day < 1 || day > 7) return;

            if (!schedule[role]) schedule[role] = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
            schedule[role][day].push(r.task_id);
        });

        res.json(schedule);
    } catch (err) {
        console.error('[ADMIN] /weekly-schedule GET kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/weekly-schedule (POST) ===
router.post('/weekly-schedule', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    const { role, weekday, taskIds } = req.body;
    if (!ROLES.includes(role) || weekday < 1 || weekday > 7) {
        return res.status(400).json({ error: 'Nederīgi dati' });
    }

    try {
        await db.run('DELETE FROM weekly_schedule WHERE role = ? AND weekday = ?', [role, weekday]);
        if (Array.isArray(taskIds) && taskIds.length > 0) {
            const stmt = await db.prepare('INSERT INTO weekly_schedule (role, weekday, task_id) VALUES (?, ?, ?)');
            for (const id of taskIds) await stmt.run(role, weekday, id);
            await stmt.finalize();
        }
        console.log(`[ADMIN] Grafiks atjaunots: ${role} → ${weekday}. diena`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] /weekly-schedule POST kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/replace (aizvietojums) ===
router.post('/replace', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    const { main_role, substitute_user } = req.body;
    if (!ROLES.includes(main_role) || (substitute_user && !ROLES.includes(substitute_user))) {
        return res.status(400).json({ error: 'Nederīga loma' });
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        await db.run('DELETE FROM daily_substitutes WHERE main_role = ?', [main_role]);
        if (substitute_user) {
            await db.run('INSERT INTO daily_substitutes (main_role, substitute_user, date) VALUES (?, ?, ?)',
                [main_role, substitute_user, today]);
            console.log(`[ADMIN] Aizvietojums: ${main_role} → ${substitute_user}`);
        } else {
            console.log(`[ADMIN] Aizvietojums noņemts: ${main_role}`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] /replace kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/update-role ===
router.post('/update-role', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    const { user_id, new_role } = req.body;
    const uid = parseInt(user_id);

    try {
        const target = await db.get('SELECT role FROM users WHERE id = ?', [uid]);
        if (!target) return res.status(404).json({ error: 'Lietotājs nav atrasts' });

        const wasAdmin = target.role === 'Admin';
        const willBeAdmin = new_role === 'Admin';
        const removingAdmin = wasAdmin && !willBeAdmin;

        if (removingAdmin) {
            const adminCount = await db.get('SELECT COUNT(*) as c FROM users WHERE role = "Admin" AND is_active = 1');
            if (adminCount.c <= 1) {
                return res.status(403).json({ error: 'NEVAR noņemt pēdējo Admin!' });
            }
        }

        const allowed = [...ROLES, 'Admin', null];
        if (new_role !== null && !allowed.includes(new_role)) {
            return res.status(400).json({ error: 'Nederīga loma!' });
        }

        await db.run('UPDATE users SET role = ? WHERE id = ?', [new_role || null, uid]);
        console.log(`[ADMIN] Loma mainīta: user ${uid} → ${new_role || 'bez'}`);
        res.json({ success: true });

        // Broadcast
        if (global.io) {
            global.io.emit('users-updated');
            global.io.emit('tasks-updated');
        }
    } catch (err) {
        console.error('[ADMIN] /update-role kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/user-status ===
router.post('/user-status', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    const { userId, is_active } = req.body;
    try {
        await db.run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] /user-status kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/user-delete ===
router.post('/user-delete', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    const { userId } = req.body;
    try {
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] /user-delete kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/tasks-with-icons ===
router.get('/tasks-with-icons', requireRole(['Admin', 'Zoologs']), async (req, res) => {
    try {
        const tasks = await db.all('SELECT id, name, cage FROM tasks ORDER BY name');
        const iconsDir = path.join(__dirname, '..', 'public', 'task-icons');
        const icons = fs.existsSync(iconsDir) ? fs.readdirSync(iconsDir) : [];

        tasks.forEach(t => {
            const iconFile = icons.find(f => f.startsWith(t.id + '.'));
            t.icon = iconFile ? `/task-icons/${iconFile}` : null;
        });

        res.json(tasks);
    } catch (err) {
        console.error('[ADMIN] /tasks-with-icons kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/upload-task-icon (multer vēlāk pievienosim middleware) ===
router.post('/upload-task-icon', requireRole(['Admin', 'Zoologs']), (req, res) => {
    res.status(501).json({ error: 'Multer vēl nav pievienots' });
});

// === /api/delete-task-icon ===
router.delete('/delete-task-icon/:taskId', requireRole(['Admin', 'Zoologs']), (req, res) => {
    const taskId = req.params.taskId;
    const iconsDir = path.join(__dirname, '..', 'public', 'task-icons');
    try {
        const files = fs.readdirSync(iconsDir).filter(f => f.startsWith(taskId + '.'));
        files.forEach(f => fs.unlinkSync(path.join(iconsDir, f)));
        console.log(`Ikona dzēsta: task ID ${taskId}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] /delete-task-icon kļūda:', err);
        res.status(500).json({ error: 'FS kļūda' });
    }
});

export default router;