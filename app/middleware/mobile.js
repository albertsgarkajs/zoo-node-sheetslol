// middleware/mobile.js
const MOBILE_UA = [
    /Android/i,
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /BlackBerry/i,
    /Windows Phone/i
];

export function detectMobile(req, res, next) {
    const ua = req.headers['user-agent'] || '';
    const isMobile = MOBILE_UA.some(regex => regex.test(ua));

    req.isMobile = isMobile;

    // Ja ir mobilā ierīce + pieprasa dashboard.html → pārvirzām
    if (isMobile && req.path === '/dashboard.html') {
        return res.redirect('/mobile-dashboard.html');
    }

    next();
}