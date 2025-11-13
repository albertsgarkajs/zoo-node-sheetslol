// utils/cron.js
import cron from 'node-cron';
import { db } from '../db.js';
import { transporter } from './email.js';

console.log('[CRON] Inicializē dienas ziņojumu...');

/**
 * Dienas ziņojums — katru dienu plkst. 17:30 (Rīga)
 * Nosūta e-pastu ar:
 *   - Kopā uzdevumi
 *   - Izpildīti / neizpildīti
 *   - Pa lomām
 */
cron.schedule('30 17 * * *', async () => {
    try {
        console.log('Generating daily report...');
        const today = new Date().toISOString().split('T')[0];
        const todayLv = new Date().toLocaleString('lv-LV', { timeZone: 'Europe/Riga' });
        const weekday = (new Date().getDay() || 7); // 1=Pirmdiena ... 7=Svētdiena

        // 1. Visi šodienas uzdevumi no weekly_schedule
        const allTasks = await db.all(`
            SELECT
                ws.role,
                COALESCE(t.name, 'Nezināms dzīvnieks') AS name,
                COALESCE(t.cage, '??') AS cage,
                t.id AS task_id
            FROM weekly_schedule ws
            LEFT JOIN tasks t ON ws.task_id = t.id
            WHERE ws.weekday = ?
            ORDER BY COALESCE(ws.role, 'Bez lomas'), name
        `, [weekday]);

        if (allTasks.length === 0) {
            const html = `
                <h2>Dienas ziņojums - ${today}</h2>
                <p><strong>Laiks:</strong> ${todayLv}</p>
                <p>Šodien grafikā nav uzdevumu!</p>
                <hr><em>Latgales Zoodārzs</em>
            `;
            await transporter.sendMail({
                from: '"Latgales Zoodārzs" <albertsgarkajs@gmail.com>',
                to: 'albertsgarkajs@gmail.com',
                subject: `Ziņojums - ${today} (nav uzdevumu)`,
                html
            });
            console.log('Sent (no tasks)');
            return;
        }

        // 2. Izpildītie uzdevumi
        const completed = await db.all(`
            SELECT
                ct.animal_id,
                COALESCE(t.name, 'Nezināms') AS name,
                COALESCE(t.cage, '??') AS cage,
                COALESCE(ws.role, 'Bez lomas') AS role,
                ct.completed_by
            FROM completed_tasks ct
            JOIN weekly_schedule ws ON ws.task_id = ct.animal_id AND ws.weekday = ?
            LEFT JOIN tasks t ON ct.animal_id = t.id
            WHERE ct.date = ?
        `, [weekday, today]);

        const completedIds = completed.map(c => c.animal_id);
        const pending = allTasks.filter(t => !completedIds.includes(t.task_id));

        // Grupēšana pa lomām
        const groupByRole = (items) => {
            const groups = {};
            items.forEach(item => {
                const role = (item.role || '').trim() || 'Bez lomas';
                if (!groups[role]) groups[role] = [];
                groups[role].push(item);
            });
            return groups;
        };

        const completedByRole = groupByRole(completed);
        const pendingByRole = groupByRole(pending);

        const total = allTasks.length;
        const done = completed.length;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;

        // HTML ģenerēšana
        const roleHtml = Object.keys({ ...completedByRole, ...pendingByRole })
            .sort()
            .map(role => {
                const c = completedByRole[role] || [];
                const p = pendingByRole[role] || [];
                return `
                    <h4>${role} (${c.length} | ${p.length})</h4>
                    <table border="1" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
                        <tr style="background:#f0f0f0;">
                            <th>Dzīvnieks</th><th>Krātiņš</th><th>Statuss</th><th>Izpildīja</th>
                        </tr>
                        ${c.map(x => `
                            <tr style="background:#e8f5e9;">
                                <td>${x.name}</td><td>${x.cage}</td><td>Done</td><td>${x.completed_by}</td>
                            </tr>`).join('')}
                        ${p.map(x => `
                            <tr style="background:#ffebee;">
                                <td>${x.name}</td><td>${x.cage}</td><td>Pending</td><td>—</td>
                            </tr>`).join('')}
                    </table>`;
            }).join('');

        const html = `
            <h2>Dienas ziņojums - ${today}</h2>
            <p><strong>Laiks:</strong> ${todayLv}</p>
            <p><strong>Kopā:</strong> ${total} | <strong>Izpildīti:</strong> ${done} | <strong>Neizpildīti:</strong> ${total - done} | <strong>${rate}%</strong></p>

            <h3>Pa lomām</h3>
            ${roleHtml}

            <h3>Vispārējais saraksts</h3>
            <h4>Izpildītie (${done})</h4>
            ${done > 0 ? `
                <table border="1" style="border-collapse: collapse; width: 100%;">
                    <tr style="background:#f0f0f0;"><th>Dzīvnieks</th><th>Krātiņš</th><th>Izpildīja</th></tr>
                    ${completed.map(c => `
                        <tr style="background:#e8f5e9;">
                            <td>${c.name}</td><td>${c.cage}</td><td>${c.completed_by}</td>
                        </tr>`).join('')}
                </table>` : '<p>Nav.</p>'}

            <h4>Neizpildītie (${total - done})</h4>
            ${pending.length > 0 ? `
                <ul>${pending.map(p => `<li>${p.cage} – ${p.name}</li>`).join('')}</ul>` : '<p>Visi izpildīti!</p>'}

            <hr><p><em>Automātisks ziņojums no Latgales Zoodārza sistēmas</em></p>
        `;

await sendEmail({
    to: 'albertsgarkajs@gmail.com',
    subject: `Dienas ziņojums - ${today} (${rate}%)`,
    html
});

        console.log(`Daily report sent: ${done}/${total} (${rate}%)`);
    } catch (err) {
        console.error('CRON ERROR:', err);
    }
}, {
    scheduled: true,
    timezone: "Europe/Riga"
});

console.log('[CRON] Dienas ziņojums ieplānots: 17:30 katru dienu');