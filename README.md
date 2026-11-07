# Karthik portfolio — glass edition + admin

Run: `node server.js` (Node 18+, no npm install needed) → http://localhost:3000
Open the admin: click the bulb 5 times quickly (or visit `/#admin`).
Initial password: `k` — change it in Security & Password right away.

- Content: `data/published.json` (live), `data/draft.json` (private), `data/prev.json` + `data/backups/` (history)
- Uploads: `uploads/` (PNG/JPG/WEBP/GIF/PDF only, content-sniffed, 10 MB max)
- Password: scrypt hash in `data/auth.json` (never sent to the browser)

## Hosting
GitHub Pages is static, so it cannot run this backend. Deploy the whole folder to any Node host
(Render, Railway, Fly.io, a VPS) and attach a persistent disk to `data/` and `uploads/`
(or set DATA_DIR / UPLOAD_DIR). Put it behind HTTPS and set TRUST_PROXY=1 if behind a proxy.
If the site is opened without the backend, it shows your content read-only from `public/content.json`
and the admin panel says the backend is not connected.
