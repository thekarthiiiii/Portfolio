'use strict';
/* Zero-dependency portfolio backend (Node 18+).
   - Scrypt-hashed admin password (initial password: "k" — change it in Security & Password)
   - Draft / published / previous-version storage in ./data
   - Validated image/PDF uploads in ./uploads
   Run:  node server.js   (PORT env var optional) */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname, PUB = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const UP = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
[DATA, UP].forEach(d => fs.mkdirSync(d, { recursive: true }));

const P = n => path.join(DATA, n);
const readJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJ = (p, o) => { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, p); };

/* ---------- initial data ---------- */
const seed = readJ(path.join(PUB, 'content.json'), {});
if (!fs.existsSync(P('published.json'))) writeJ(P('published.json'), seed);
if (!fs.existsSync(P('draft.json'))) writeJ(P('draft.json'), readJ(P('published.json'), seed));

/* ---------- auth ---------- */
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  ({ salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') });
const checkPw = (pw, a) => {
  const h = crypto.scryptSync(String(pw), a.salt, 64), b = Buffer.from(a.hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
};
if (!fs.existsSync(P('auth.json'))) writeJ(P('auth.json'), { ...hashPw('k'), isDefault: true });

const sessions = new Map(); // token -> expiry
const fails = new Map();    // ip -> {n, until}
const SESSION_MS = 2 * 3600e3;
const ip = req => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';
const authed = req => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const e = sessions.get(t);
  if (e && e > Date.now()) { sessions.set(t, Date.now() + SESSION_MS); return t; }
  sessions.delete(t); return null;
};

/* ---------- helpers ---------- */
const send = (res, code, obj, extra = {}) => {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': b.length, ...extra });
  res.end(b);
};
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const readBody = (req, limit = 14e6) => new Promise((ok, no) => {
  let n = 0; const ch = [];
  req.on('data', c => { n += c.length; if (n > limit) { no(fail(413, 'Payload too large')); req.destroy(); return; } ch.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { no(fail(400, 'Invalid JSON')); } });
  req.on('error', no);
});

function clean(v, d = 0) {
  if (d > 8) return null;
  if (typeof v === 'string') return v.slice(0, 6000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 300).map(x => clean(x, d + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 80)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
      o[k] = clean(v[k], d + 1);
    }
    return o;
  }
  return null;
}
function validateContent(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw fail(400, 'Content must be an object');
  c = clean(c);
  for (const k of ['skills', 'works', 'certs', 'experience', 'education', 'socials']) if (!Array.isArray(c[k])) c[k] = [];
  for (const k of ['personal', 'hero', 'about', 'contact', 'footer', 'settings', 'titles', 'theme', 'glass']) if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) c[k] = {};
  if (JSON.stringify(c).length > 1.5e6) throw fail(413, 'Content too large');
  return c;
}

const sniff = b => {
  if (b.length < 12) return null;
  const s = (a, z) => b.toString('latin1', a, z);
  if (b[0] === 0x89 && s(1, 4) === 'PNG') return 'png';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'webp';
  if (s(0, 4) === 'GIF8') return 'gif';
  if (s(0, 4) === '%PDF') return 'pdf';
  return null; // SVG and everything else rejected (XSS risk)
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function serveStatic(req, res, base, rel, cache) {
  let f;
  try { f = path.normalize(path.join(base, decodeURIComponent(rel))); } catch { res.writeHead(400); return res.end(); }
  if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, ...SEC });
    fs.createReadStream(f).pipe(res);
  });
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const m = req.method, r = url.pathname.replace(/^\/api/, '');

  if (m === 'GET' && r === '/health') return send(res, 200, { ok: true });
  if (m === 'GET' && r === '/content') return send(res, 200, readJ(P('published.json'), seed));

  if (m === 'POST' && r === '/login') {
    const k = ip(req), f = fails.get(k);
    if (f && f.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Wait a minute and retry.' });
    const { password } = await readBody(req, 4096);
    const a = readJ(P('auth.json'));
    if (typeof password === 'string' && checkPw(password, a)) {
      fails.delete(k);
      const t = crypto.randomBytes(32).toString('hex');
      sessions.set(t, Date.now() + SESSION_MS);
      return send(res, 200, { token: t, defaultPassword: !!a.isDefault });
    }
    const n = (f ? f.n : 0) + 1;
    fails.set(k, { n, until: n >= 5 ? Date.now() + 60e3 : 0 });
    if (n >= 5) fails.set(k, { n: 0, until: Date.now() + 60e3 });
    await new Promise(z => setTimeout(z, 400));
    return send(res, 401, { error: 'Invalid password' });
  }

  const tok = authed(req);
  if (!tok) return send(res, 401, { error: 'Not authorised' });

  if (m === 'POST' && r === '/logout') { sessions.delete(tok); return send(res, 200, { ok: true }); }
  if (m === 'GET' && r === '/session') return send(res, 200, { ok: true, defaultPassword: !!readJ(P('auth.json')).isDefault });
  if (m === 'GET' && r === '/draft') return send(res, 200, { draft: readJ(P('draft.json')), published: readJ(P('published.json')), defaultPassword: !!readJ(P('auth.json')).isDefault });
  if (m === 'PUT' && r === '/draft') { const c = validateContent(await readBody(req)); writeJ(P('draft.json'), c); return send(res, 200, { ok: true, draft: c }); }

  if (m === 'POST' && r === '/publish') {
    const d = readJ(P('draft.json')), old = readJ(P('published.json'));
    writeJ(P('prev.json'), old);
    const bk = path.join(DATA, 'backups'); fs.mkdirSync(bk, { recursive: true });
    writeJ(path.join(bk, new Date().toISOString().replace(/[:.]/g, '-') + '.json'), old);
    fs.readdirSync(bk).sort().slice(0, -15).forEach(f => fs.unlinkSync(path.join(bk, f)));
    writeJ(P('published.json'), d);
    try { writeJ(path.join(PUB, 'content.json'), d); } catch { /* read-only FS: API remains source of truth */ }
    return send(res, 200, { ok: true, published: d });
  }
  if (m === 'POST' && r === '/revert') {
    const prev = readJ(P('prev.json'), null);
    if (!prev) return send(res, 404, { error: 'No previous version exists yet' });
    const cur = readJ(P('published.json'));
    writeJ(P('published.json'), prev); writeJ(P('draft.json'), prev); writeJ(P('prev.json'), cur);
    try { writeJ(path.join(PUB, 'content.json'), prev); } catch { }
    return send(res, 200, { ok: true, content: prev });
  }
  if (m === 'POST' && r === '/discard') { const p = readJ(P('published.json')); writeJ(P('draft.json'), p); return send(res, 200, { ok: true, draft: p }); }

  if (m === 'POST' && r === '/upload') {
    const b = await readBody(req);
    if (typeof b.data !== 'string') throw fail(400, 'Missing file data');
    const buf = Buffer.from(b.data, 'base64');
    if (buf.length > 10e6) throw fail(413, 'File too large (10 MB max)');
    const ext = sniff(buf);
    if (!ext) throw fail(415, 'Unsupported file. Allowed: PNG, JPG, WEBP, GIF, PDF');
    const slug = String(b.name || 'file').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
    const name = `${slug}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UP, name), buf);
    return send(res, 200, { ok: true, url: '/uploads/' + name, name, size: buf.length });
  }
  if (m === 'GET' && r === '/media') {
    const used = JSON.stringify(readJ(P('draft.json'))) + JSON.stringify(readJ(P('published.json')));
    const files = fs.readdirSync(UP).filter(f => !f.startsWith('.')).map(f => {
      const st = fs.statSync(path.join(UP, f));
      return { name: f, url: '/uploads/' + f, size: st.size, time: st.mtimeMs, type: f.endsWith('.pdf') ? 'pdf' : 'image', used: used.includes('/uploads/' + f) };
    }).sort((a, b) => b.time - a.time);
    return send(res, 200, { files });
  }
  let mm;
  if (m === 'DELETE' && (mm = r.match(/^\/media\/([\w.-]+)$/))) {
    const f = path.join(UP, mm[1]);
    if (!f.startsWith(UP) || !fs.existsSync(f)) return send(res, 404, { error: 'Not found' });
    const used = JSON.stringify(readJ(P('draft.json'))) + JSON.stringify(readJ(P('published.json')));
    if (used.includes('/uploads/' + mm[1])) return send(res, 409, { error: 'File is still used by the site. Remove it from the content first.' });
    fs.unlinkSync(f); return send(res, 200, { ok: true });
  }
  if (m === 'GET' && r === '/export') return send(res, 200, { exportedAt: new Date().toISOString(), published: readJ(P('published.json')), draft: readJ(P('draft.json')) }, { 'Content-Disposition': 'attachment; filename="portfolio-backup.json"' });

  if (m === 'POST' && r === '/password') {
    const { current, next } = await readBody(req, 4096), a = readJ(P('auth.json'));
    if (!checkPw(current || '', a)) return send(res, 401, { error: 'Current password is incorrect' });
    if (typeof next !== 'string' || next.length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' });
    writeJ(P('auth.json'), { ...hashPw(next), isDefault: false });
    sessions.clear();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Unknown endpoint' });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      Object.entries(SEC).forEach(([k, v]) => res.setHeader(k, v));
      return await api(req, res, url);
    }
    if (url.pathname.startsWith('/uploads/')) return serveStatic(req, res, UP, url.pathname.slice(9), 'public, max-age=31536000, immutable');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, PUB, url.pathname === '/' ? 'index.html' : url.pathname, url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('.json') ? 'no-cache' : 'public, max-age=3600');
  } catch (e) {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Server error' });
    if (!e.code) console.error(e);
  }
}).listen(PORT, () => console.log(`Portfolio running on http://localhost:${PORT}`));
