// app/server.js
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

// === PORT (Render gaida 8080, bet mēs klausāmies jebkuru) ===
const PORT = process.env.PORT || 10000;

// === APP & SERVER ===
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// === MIDDLEWARE ===
app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statiskie faili no /app/app (Docker root)
app.use(express.static('/app/app'));

// Papildu: /public → tieši no /app/app/public
app.use('/public', express.static('/app/app/public'));

app.use(detectMobile);
app.use(noCache);

// Socket.IO sesijas
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
attachIO(io);

// === ROUTES (katrā sava ceļš!) ===
app.use('/api', apiRouter);
app.use('/admin', adminRouter);     // ← nevis /api
app.use('/mobile', mobileRouter);   // ← nevis /api

// === FALLBACK: visi nezināmie ceļi → login.html ===
app.get('*', (req, res) => {
    res.sendFile('login.html', { root: '/app/app' });
});

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