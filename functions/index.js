const functions = require('firebase-functions/v1');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'asia-southeast2'; // Jakarta
const DAILY_LIMIT = 100; // panggilan AI per user per hari

// Keys dibaca dari functions/.env (tidak pernah sampai ke browser)
const getSharedKeys = () =>
    (process.env.AI_SHARED_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

const detectKeyProvider = (key) => {
    const k = (key || '').trim();
    if (k.startsWith('sk-ant')) return 'anthropic';
    if (k.startsWith('sk-')) return 'openai';
    if (k.startsWith('AIza')) return 'google';
    if (k.startsWith('AQ.')) return 'google';
    return null;
};

const GOOGLE_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];
const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
const ANTHROPIC_MODELS = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'];

async function checkRateLimit(uid) {
    const today = new Date().toISOString().split('T')[0];
    const ref = db.collection('_aiUsage').doc(uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const count = data.date === today ? (data.count || 0) : 0;
        if (count >= DAILY_LIMIT) {
            throw new HttpsError('resource-exhausted',
                'Batas penggunaan AI harian tercapai. Coba lagi besok, atau pasang API key pribadimu di Pengaturan.');
        }
        tx.set(ref, { date: today, count: count + 1 });
    });
}

// ---------- Provider callers (server-side: tanpa masalah CORS) ----------

async function callGoogle(key, model, systemPrompt, contents) {
    const preferred = GOOGLE_MODELS.includes(model) ? model : 'gemini-3.5-flash';
    const chain = [preferred, ...GOOGLE_MODELS.filter(m => m !== preferred)];
    const payload = {
        system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents
    };
    for (let i = 0; i < chain.length; i++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chain[i]}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const isLast = i === chain.length - 1;
        if ([400, 403, 404, 429, 503].includes(res.status) && !isLast) continue;
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Google API Error (${res.status}): ${errText.substring(0, 150)}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    throw new Error('All Gemini models failed (429) for this key.');
}

async function callOpenAI(key, model, messages) {
    const m = OPENAI_MODELS.includes(model) ? model : 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: m, messages })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API Error (${res.status}): ${errText.substring(0, 150)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(key, model, systemPrompt, messages) {
    const m = ANTHROPIC_MODELS.includes(model) ? model : 'claude-sonnet-4-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m, max_tokens: 4096, system: systemPrompt, messages })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API Error (${res.status}): ${errText.substring(0, 150)}`);
    }
    const data = await res.json();
    return data.content?.find(b => b.type === 'text')?.text || '';
}

const isFallbackable = (errMsg) => {
    const statusMatch = (errMsg || '').match(/\((\d{3})\)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : null;
    return (status !== null && (status === 401 || status === 403 || status === 404 || status === 429 || status >= 500)) ||
        (errMsg || '').includes('All Gemini models failed') || (errMsg || '').includes('fetch failed');
};

// ---------- Endpoints ----------

exports.aiChat = functions.region(REGION).runWith({ timeoutSeconds: 120, memory: '256MB' }).https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'Harus login untuk memakai AI.');

    const { messages, provider = 'google', model = '' } = data || {};
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new HttpsError('invalid-argument', 'messages harus berupa array.');
    }
    const totalChars = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
    if (totalChars > 200000) throw new HttpsError('invalid-argument', 'Pesan terlalu panjang.');

    await checkRateLimit(context.auth.uid);

    const keys = getSharedKeys().filter(k => detectKeyProvider(k) === provider);
    if (keys.length === 0) {
        throw new HttpsError('failed-precondition', `Server tidak punya key untuk provider ${provider}. Pakai API key pribadi di Pengaturan.`);
    }

    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const nonSystem = messages.filter(m => m.role !== 'system');

    let lastError = null;
    for (const key of keys) {
        try {
            if (provider === 'google') {
                const contents = nonSystem.map(m => {
                    if (Array.isArray(m.content)) {
                        return { role: m.role === 'user' ? 'user' : 'model', parts: m.content };
                    }
                    return {
                        role: m.role === 'user' ? 'user' : 'model',
                        parts: [{ text: m.content }]
                    };
                });
                return { text: await callGoogle(key, model, systemPrompt, contents) };
            }
            if (provider === 'openai') {
                const oaMessages = messages.map(m => ({
                    role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
                    content: m.content
                }));
                return { text: await callOpenAI(key, model, oaMessages) };
            }
            if (provider === 'anthropic') {
                const antMessages = nonSystem.map(m => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: m.content
                }));
                return { text: await callAnthropic(key, model, systemPrompt, antMessages) };
            }
            throw new HttpsError('invalid-argument', `Provider tidak dikenal: ${provider}`);
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            console.error(`aiChat key failed:`, err.message);
            lastError = err;
            if (!isFallbackable(err.message)) break;
        }
    }
    throw new HttpsError('resource-exhausted',
        `Semua key server untuk ${provider} sedang limit. ${lastError ? lastError.message.substring(0, 100) : ''}`);
});

exports.aiVision = functions.region(REGION).runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'Harus login untuk memakai AI.');

    const { imageBase64, mimeType = 'image/jpeg', prompt, provider = 'google', model = '' } = data || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        throw new HttpsError('invalid-argument', 'imageBase64 wajib diisi.');
    }
    if (imageBase64.length > 8 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Gambar terlalu besar (maks ~6MB).');

    await checkRateLimit(context.auth.uid);

    const keys = getSharedKeys().filter(k => detectKeyProvider(k) === provider);
    if (keys.length === 0) {
        throw new HttpsError('failed-precondition', `Server tidak punya key untuk provider ${provider}.`);
    }

    let lastError = null;
    for (const key of keys) {
        try {
            let rawText = '';
            if (provider === 'google') {
                const contents = [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: imageBase64 } }
                    ]
                }];
                rawText = await callGoogle(key, model, '', contents);
            } else if (provider === 'openai') {
                rawText = await callOpenAI(key, model, [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
                    ]
                }]);
            } else if (provider === 'anthropic') {
                rawText = await callAnthropic(key, model, '', [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                        { type: 'text', text: prompt }
                    ]
                }]);
            } else {
                throw new HttpsError('invalid-argument', `Provider tidak dikenal: ${provider}`);
            }
            return { text: rawText };
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            console.error(`aiVision key failed:`, err.message);
            lastError = err;
            if (!isFallbackable(err.message)) break;
        }
    }
    throw new HttpsError('resource-exhausted',
        `Semua key server untuk ${provider} sedang limit. ${lastError ? lastError.message.substring(0, 100) : ''}`);
});

// ---------- Jembatan identitas Lomeal → Logym (0-klik, provider apa pun) ----------
// 2 project Firebase terpisah = OAuth client beda, jadi popup Google gak bisa
// dipakai ulang antar keduanya. Lomeal kirim ID token-nya sendiri (provider apa
// pun: Google/email/dst), function ini verifikasi, cari/bikin user Logym dengan
// email yang sama, balikin custom token — Lomeal signInWithCustomToken(authLogym,
// token) tanpa klik. verify-only app: cukup projectId, tanpa service account key
// project lain.
//
// Keamanan: HANYA link ke akun Logym yang sudah ada kalau email_verified true
// (Google selalu verified). Email/password Lomeal yang belum verifikasi TIDAK
// pernah dicocokkan ke akun manapun — dapat identitas baru sendiri dulu, biar
// gak ada celah orang daftar pakai email siapa aja buat ambil alih akun Logym.
const lomealVerifyApp = admin.initializeApp({ projectId: 'lomeal-id' }, 'lomeal-verify');

exports.bridgeLomealAuth = functions.region(REGION).https.onCall(async (data, context) => {
    const { lomealIdToken } = data || {};
    if (!lomealIdToken) throw new HttpsError('invalid-argument', 'lomealIdToken wajib diisi.');

    const decoded = await admin.auth(lomealVerifyApp).verifyIdToken(lomealIdToken);
    if (!decoded.email) throw new HttpsError('failed-precondition', 'Akun Lomeal ini tidak punya email.');

    const profile = { email: decoded.email, displayName: decoded.name || undefined, photoURL: decoded.picture || undefined };
    let logymUser;
    if (decoded.email_verified) {
        try {
            logymUser = await admin.auth().getUserByEmail(decoded.email);
        } catch {
            logymUser = await admin.auth().createUser({ ...profile, emailVerified: true });
        }
    } else {
        try {
            logymUser = await admin.auth().createUser(profile);
        } catch (e) {
            if (e.code === 'auth/email-already-exists') {
                throw new HttpsError('failed-precondition', 'Verifikasi email Lomeal-mu dulu sebelum bisa sambung ke Logym.');
            }
            throw e;
        }
    }

    const customToken = await admin.auth().createCustomToken(logymUser.uid);
    return { customToken };
});
