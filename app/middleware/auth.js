// middleware/auth.js
import session from 'express-session';
const { default: connectSQLite3 } = await import('connect-sqlite3');
const SQLiteStore = connectSQLite3(session);

// === SESSION IESTATĪJUMI (VIENA VIETA!) ===
export const sessionMiddleware = session({
    store: new SQLiteStore({
        db: 'session.sqlite',
        dir: '/tmp'  // ← RENDER: tikai /tmp ir rakstāms
    }),
    secret: process.env.SESSION_SECRET || 'change-me-in-production-12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS tikai prod
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 stundas
        sameSite: 'lax'
    }
});

// === SOCKET.IO + GLOBĀLĀ BROADCAST ===
let ioRef = null;

export function attachIO(io) {
    ioRef = io;
    global.io = io;
    global.broadcastAnimalsUpdate = () => {
        if (ioRef) {
            ioRef.emit('animals-updated');
            console.log('[SOCKET] Broadcast: animals-updated');
        }
    };
}

// === AUTORIZĀCIJAS HELPERI ===
export function requireAuth(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Nav autorizēts' });
    }
    next();
}

export function requireRole(roles) {
    return (req, res, next) => {
        if (!req.session?.user || !roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Piekļuve liegta' });
        }
        next();
    };
}

// === LOGIN / LOGOUT HELPERI (var izmantot route'os) ===
export function loginUser(req, user) {
    req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
    };
}

export function logoutUser(req) {
    req.session.destroy(() => {});
}