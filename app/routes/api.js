// routes/api.js
import express from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import crypto from 'crypto';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

// === KONSTANTES ===
const ROLES = [
    'Vivāriju dzīvnieku kopējs I', 'Vivāriju dzīvnieku kopējs II', 'Vivāriju dzīvnieku kopējs III',
    'Zootehniķis', 'Veterinārārsts', 'Veterinārārsta asistents', 'Entomologs'
];

// === /api/tasks ===
router.get('/tasks', async (req, res) => {
    try {
        const rows = await db.all('SELECT id, cage, name FROM tasks ORDER BY cage');
        console.log(`[API] /tasks → ${rows.length} uzdevumi`);
        res.json(rows);
    } catch (err) {
        console.error('[API] /tasks kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/daily-tasks ===
router.get('/daily-tasks', requireAuth, async (req, res) => {
    const userRole = req.session.user.role;
    const today = new Date();
    const weekday = today.getDay() === 0 ? 7 : today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    const result = {};
    ROLES.forEach(r => result[r] = { tasks: [], substitute: '' });

    try {
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

        const subs = await db.all('SELECT main_role, substitute_user FROM daily_substitutes WHERE date = ?', [todayStr]);
        subs.forEach(s => {
            if (s.substitute_user && result[s.main_role]) {
                result[s.main_role].substitute = s.substitute_user;
            }
        });

        if (!['Admin', 'Zoologs'].includes(userRole)) {
            const finalTasks = new Set();
            const substituteLabels = [];

            const iReplace = subs.filter(sub => sub.substitute_user === userRole).map(sub => sub.main_role);
            if (iReplace.length > 0) {
                substituteLabels.push(`Aizvieto: ${iReplace.join(', ')}`);
                iReplace.forEach(r => result[r]?.tasks.forEach(t => finalTasks.add(t.id)));
            }

            const replacesMe = subs.filter(sub => sub.main_role === userRole && sub.substitute_user).map(sub => sub.substitute_user);
            if (replacesMe.length > 0) {
                substituteLabels.push(`Aizvieto: ${replacesMe.join(', ')}`);
                replacesMe.forEach(r => result[r]?.tasks.forEach(t => finalTasks.add(t.id)));
            }

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
            return res.json({ tasks: taskObjects, substitute: finalSubstitute });
        }

        res.json(result);
    } catch (err) {
        console.error('[API] /daily-tasks kļūda:', err);
        res.status(500).json({ error: 'Servera kļūda' });
    }
});

// === /api/complete-task ===
router.post('/complete-task', requireAuth, async (req, res) => {
    const { animal_id } = req.body;
    const { username } = req.session.user;
    const today = new Date().toISOString().split('T')[0];

    try {
        await db.run('INSERT OR REPLACE INTO completed_tasks (animal_id, completed_by, date) VALUES (?, ?, ?)', 
            [animal_id, username, today]);
        res.json({ success: true });
    } catch (err) {
        console.error('[API] /complete-task kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/cancel-task ===
router.post('/cancel-task', requireAuth, async (req, res) => {
    const { animal_id } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
        await db.run('DELETE FROM completed_tasks WHERE animal_id = ? AND date = ?', [animal_id, today]);
        res.json({ success: true });
    } catch (err) {
        console.error('[API] /cancel-task kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/mark-actions ===
router.post('/mark-actions', requireAuth, async (req, res) => {
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
        res.json({ success: true });
    } catch (err) {
        console.error('[API] /mark-actions kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/forgot-password ===
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-pasts obligāts' });

    try {
        const user = await db.get('SELECT id, username FROM users WHERE email = ? AND is_active = 1', [email]);
        if (!user) {
            return res.json({ success: true, message: 'Ja e-pasts reģistrēts, saite nosūtīta.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;
        await db.run('INSERT INTO password_resets (user_id, token, expires) VALUES (?, ?, ?)', [user.id, token, expires]);

        const resetLink = `http://192.168.1.231:3000/reset-password.html?token=${token}`;
        await sendEmail({
            to: email,
            subject: 'Paroles atiestatīšana',
            html: `
                <h2>Sveiks, ${user.username}!</h2>
                <p>Klikšķini uz saites, lai atiestatītu paroli:</p>
                <p style="margin:15px 0;"><a href="${resetLink}" style="background:#0066cc;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">Atiestatīt paroli</a></p>
                <p><small>Saite derīga 1 stundu.</small></p>
            `
        });

        res.json({ success: true, message: 'Saite nosūtīta!' });
    } catch (err) {
        console.error('[API] /forgot-password kļūda:', err);
        res.status(500).json({ error: 'Servera kļūda' });
    }
});

// === /api/reset-password ===
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Trūkst datu' });

    try {
        const row = await db.get('SELECT user_id, expires FROM password_resets WHERE token = ?', [token]);
        if (!row || row.expires < Date.now()) {
            return res.status(400).json({ error: 'Nederīga vai beigusies saite' });
        }

        const hash = crypto.createHash('sha256').update(password).digest('hex');
        await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
        await db.run('DELETE FROM password_resets WHERE token = ?', [token]);

        res.json({ success: true });
    } catch (err) {
        console.error('[API] /reset-password kļūda:', err);
        res.status(500).json({ error: 'DB kļūda' });
    }
});

// === /api/user ===
router.get('/user', requireAuth, (req, res) => {
    res.json({ username: req.session.user.username, role: req.session.user.role });
});

export default router;