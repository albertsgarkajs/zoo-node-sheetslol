// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { sessionMiddleware, attachIO } from './middleware/auth.js';
import { detectMobile } from './middleware/mobile.js';
import { noCache } from './middleware/antiCache.js';
import { initDb } from './initDb.js';
import apiRouter from './routes/api.js';
import adminRouter from './routes/admin.js';
import mobileRouter from './routes/mobile.js';
import './utils/cron.js'; // ← automātiski startē

const PORT = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// === MIDDLEWARE ===
app.use(sessionMiddleware);
app.use(express.static('.'));
app.use('/public', express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(detectMobile);
app.use(noCache);

io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
attachIO(io);

// === ROUTES ===
app.use('/api', apiRouter);
app.use('/api', adminRouter);
app.use('/api', mobileRouter);

// === FALLBACK ===
app.get('*', (req, res) => res.sendFile('login.html', { root: '.' }));

// === START ===
(async () => {
    try {
        await initDb();
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on :${PORT}`);
        });
    } catch (err) {
        console.error('Startup failed:', err);
        process.exit(1);
    }
})();