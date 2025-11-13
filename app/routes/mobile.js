// routes/mobile.js
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// === /api/mobile-tasks ===
router.get('/mobile-tasks', requireAuth, async (req, res) => {
    const userRole = req.session.user.role;
    const today = new Date();
    const weekday = today.getDay() === 0 ? 7 : today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    console.log(`[mobile-tasks] User: ${userRole}, Weekday: ${weekday}, Date: ${todayStr}`);

    const result = {};
    const ROLES = [
        'Vivāriju dzīvnieku kopējs I', 'Vivāriju dzīvnieku kopējs II', 'Vivāriju dzīvnieku kopējs III',
        'Zootehniķis', 'Veterinārārsts', 'Veterinārārsta asistents', 'Entomologs'
    ];
    ROLES.forEach(r => result[r] = { tasks: [], substitute: '' });

    try {
        // 1. Šodienas uzdevumi
        const rows = await db.all(`
            SELECT ws.role, t.id, t.cage, t.name 
            FROM weekly_schedule ws 
            JOIN tasks t ON ws.task_id = t.id 
            WHERE ws.weekday = ? 
            ORDER BY t.cage
        `, [weekday]);

        rows.forEach(row => {
            if (result[row.role]) result[row.role].tasks.push({ id: row.id, cage: row.cage, name: row.name });
        });

        // 2. Aizvietojumi
        const subs = await db.all('SELECT main_role, substitute_user FROM daily_substitutes WHERE date = ?', [todayStr]);
        subs.forEach(s => {
            if (s.substitute_user && result[s.main_role]) {
                result[s.main_role].substitute = s.substitute_user;
            }
        });

        // 3. Lietotāja uzdevumi (ja nav Admin/Zoologs)
        if (!['Admin', 'Zoologs'].includes(userRole)) {
            const finalTasks = new Set();
            const substituteLabels = [];

            // Ko es aizvietoju?
            const iReplace = subs
                .filter(sub => sub.substitute_user === userRole)
                .map(sub => sub.main_role);
            if (iReplace.length > 0) {
                substituteLabels.push(`Aizvieto: ${iReplace.join(', ')}`);
                iReplace.forEach(r => result[r]?.tasks.forEach(t => finalTasks.add(t.id)));
            }

            // Kas mani aizvieto?
            const replacesMe = subs
                .filter(sub => sub.main_role === userRole && sub.substitute_user)
                .map(sub => sub.substitute_user);
            if (replacesMe.length > 0) {
                substituteLabels.push(`Aizvieto: ${replacesMe.join(', ')}`);
                replacesMe.forEach(r => result[r]?.tasks.forEach(t => finalTasks.add(t.id)));
            }

            // Paša uzdevumi
            if (result[userRole] && !replacesMe.includes(userRole)) {
                result[userRole].tasks.forEach(t => finalTasks.add(t.id));
            }

            const taskObjects = [];
            finalTasks.forEach(id => {
                for (const role in result) {
                    const found = result[role].tasks.find(t => t.id === id);
                    if (found) {
                        taskObjects.push(found);
                        break;
                    }
                }
            });

            const finalSubstitute = substituteLabels.join(' | ') || '';
            console.log(`[mobile-tasks] Nosūta ${taskObjects.length} uzdevumus`);
            return res.json({ tasks: taskObjects, substitute: finalSubstitute });
        }

        // Adminam — visi uzdevumi
        const allTasks = [];
        Object.values(result).forEach(roleData => allTasks.push(...roleData.tasks));
        res.json({ tasks: allTasks, substitute: 'Admin' });

    } catch (err) {
        console.error('[mobile-tasks] Kļūda:', err);
        res.status(500).json({ error: 'Servera kļūda' });
    }
});

// === /api/mobile-complete ===
router.post('/mobile-complete', requireAuth, async (req, res) => {
    const { animal_id } = req.body;
    const { username } = req.session.user;
    const today = new Date().toISOString().split('T')[0];

    try {
        await db.run('INSERT OR REPLACE INTO completed_tasks (animal_id, completed_by, date) VALUES (?, ?, ?)', 
            [animal_id, username, today]);
        console.log(`Mobile: Task ${animal_id} completed by ${username}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Mobile complete error:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/mobile-cancel ===
router.post('/mobile-cancel', requireAuth, async (req, res) => {
    const { animal_id } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
        await db.run('DELETE FROM completed_tasks WHERE animal_id = ? AND date = ?', [animal_id, today]);
        console.log(`Mobile: Task ${animal_id} canceled`);
        res.json({ success: true });
    } catch (err) {
        console.error('Mobile cancel error:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/mobile-actions ===
router.post('/mobile-actions', requireAuth, async (req, res) => {
    const { animal_id, actions } = req.body;
    const { username } = req.session.user;
    const today = new Date().toISOString().split('T')[0];

    if (!Array.isArray(actions) || actions.length === 0) {
        return res.json({ success: true });
    }

    try {
        const stmt = await db.prepare('INSERT INTO actions (animal_id, action, username, date) VALUES (?, ?, ?, ?)');
        for (const action of actions) {
            await stmt.run(animal_id, action, username, today);
        }
        await stmt.finalize();
        console.log(`Mobile: ${actions.length} actions on ${animal_id} by ${username}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Mobile actions error:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/mobile-comment ===
router.post('/mobile-comment', requireAuth, async (req, res) => {
    const { animal_id, comment } = req.body;
    const { username } = req.session.user;
    const timestamp = new Date().toISOString();

    try {
        const result = await db.run(`
            INSERT INTO comments (animal_id, user, comment, timestamp, resolved, parent_id) 
            VALUES (?, ?, ?, ?, 0, 0)
        `, [animal_id, username, comment, timestamp]);
        console.log(`Mobile comment by ${username} on ${animal_id}`);
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        console.error('Mobile comment error:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/mobile-user ===
router.get('/mobile-user', requireAuth, (req, res) => {
    res.json({ username: req.session.user.username, role: req.session.user.role });
});

export default router;