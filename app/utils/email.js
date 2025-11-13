// app/utils/email.js
import nodemailer from 'nodemailer';

// === E-PASTA IESTATĪJUMI (no env mainīgajiem) ===
const EMAIL_USER = process.env.EMAIL_USER || 'albertsgarkajs@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'fallback-pass'; // nekad nav jāizmanto
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = Number(process.env.EMAIL_PORT) || 587;

// === Nodemailer transporter ===
export const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false, // 587 → STARTTLS
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    debug: false, // mainīt uz true testēšanai
    logger: false
});

// === PĀRBAUDE: Vai transporter gatavs? ===
transporter.verify((error, success) => {
    if (error) {
        console.error('[EMAIL] Transporter kļūda:', error.message);
    } else {
        console.log('[EMAIL] E-pasta serveris gatavs!');
    }
});

/**
 * Nosūta e-pastu
 * @param {Object} options - nodemailer sendMail opcijas
 * @returns {Promise}
 */
export async function sendEmail(options) {
    try {
        const info = await transporter.sendMail({
            from: `"Latgales Zoodārzs" <${EMAIL_USER}>`,
            ...options
        });
        console.log(`[EMAIL] Nosūtīts: ${info.messageId} → ${options.to}`);
        return info;
    } catch (err) {
        console.error('[EMAIL] Kļūda nosūtot:', err.message);
        throw err;
    }
}