(() => {
'use strict';
const S = window.Site;
const clone = o => JSON.parse(JSON.stringify(o));
let token = sessionStorage.getItem('adm_t') || '';
let draft = null, published = null, dirty = false, view = 'overview', q = '', root = null, main = null, side = null, statusEl = null, previewBar = null, defaultPw = false;
const open = new WeakSet();

const el = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  c.flat(Infinity).forEach(x => { if (x == null || x === false) return; e.append(x.nodeType ? x : document.createTextNode(String(x))); });
  return e;
};
const btn = (label, fn, cls = '') => el('button', { type: 'button', class: 'adm-btn ' + cls, onclick: fn }, label);

async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Cannot reach the server'); }
  let j = {}; try { j = await r.json(); } catch { }
  if (r.status === 401 && token && path !== '/login') { token = ''; sessionStorage.removeItem('adm_t'); destroyPanel(true); showLogin('Session expired. Please log in again.'); }
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

/* ---------- modal helpers ---------- */
function modal(content, { onClose, wide } = {}) {
  const back = el('div', { class: 'adm-back' });
  const box = el('div', { class: 'adm-modal adm-glass' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  back.append(box); document.body.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
  const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 300); onClose && onClose(); };
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  return { close, box };
}
const confirmBox = msg => new Promise(res => {
  let m; const done = v => { m.close(); res(v); };
  m = modal([el('p', { class: 'adm-msg' }, msg), el('div', { class: 'adm-row end' }, btn('Cancel', () => done(false)), btn('Confirm', () => done(true), 'danger'))], { onClose: () => res(false) });
});

/* ---------- entry ---------- */
async function openAdmin() {
  if (root) return;
  let ok = false;
  try { const r = await fetch('/api/health', { cache: 'no-store' }); ok = r.ok && (await r.json()).ok; } catch { }
  if (!ok) {
    modal([el('h2', {}, 'Admin backend not connected'),
      el('p', { class: 'adm-msg' }, 'This site is being served as static files, so there is no server to check a password or store changes. The admin panel is disabled instead of pretending to be secure.'),
      el('p', { class: 'adm-msg' }, 'Run the included Node server (node server.js) on a host that supports Node and a persistent disk, then open the site from that address.'),
      el('div', { class: 'adm-row end' }, btn('Close', function () { this.closest('.adm-back').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }))]);
    return;
  }
  if (token) { try { const s = await api('/session'); defaultPw = s.defaultPassword; return buildPanel(); } catch { } }
  showLogin();
}

function showLogin(msg) {
  const pw = el('input', { type: 'password', class: 'adm-in', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Admin password' });
  const err = el('div', { class: 'adm-err', role: 'alert' }, msg || '');
  let m;
  const go = async () => {
    err.textContent = ''; go.btn.disabled = true; go.btn.textContent = 'Checking…';
    try {
      const r = await api('/login', { method: 'POST', body: { password: pw.value } });
      token = r.token; sessionStorage.setItem('adm_t', token); defaultPw = r.defaultPassword; m.close(); buildPanel();
    } catch (e) { err.textContent = e.message; go.btn.disabled = false; go.btn.textContent = 'Login'; pw.select(); }
  };
  go.btn = btn('Login', go, 'primary');
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  m = modal([el('h2', {}, 'Admin Login'), err, pw, el('div', { class: 'adm-row' }, go.btn, btn('Back', () => m.close()))]);
  setTimeout(() => pw.focus(), 100);
}

/* ---------- panel ---------- */
const VIEWS = [
  ['overview', 'Overview'], ['personal', 'Personal Information'], ['hero', 'Hero Section'], ['about', 'About'], ['skills', 'Skills'],
  ['works', 'Projects'], ['certs', 'Certificates'], ['experience', 'Experience'], ['education', 'Education'], ['contact', 'Contact'],
  ['socials', 'Social Links'], ['media', 'Media Library'], ['theme', 'Theme Customization'], ['glass', 'Glass Effects'], ['settings', 'Website Settings'], ['security', 'Security & Password']
];

async function buildPanel() {
  const loader = el('div', { class: 'adm-loading' }, el('span'), ' Loading…');
  document.body.append(loader);
  try {
    const r = await api('/draft'); draft = S.normalize(r.draft); published = S.normalize(r.published); defaultPw = r.defaultPassword;
  } catch (e) { loader.remove(); S.toast(e.message, 'err'); return; }
  loader.remove();
  dirty = false; view = 'overview'; q = '';
  statusEl = el('span', { class: 'adm-status' });
  side = el('nav', { class: 'adm-side adm-glass', 'aria-label': 'Admin sections' });
  main = el('div', { class: 'adm-main' });
  const search = el('input', { class: 'adm-in', type: 'search', placeholder: 'Search sections & items…', 'aria-label': 'Search', oninput: e => { q = e.target.value.trim().toLowerCase(); drawSide(); drawView(); } });
  const top = el('header', { class: 'adm-top adm-glass' },
    el('button', { class: 'adm-btn burger', type: 'button', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open') }, '☰'),
    el('strong', {}, 'Admin'), statusEl, el('span', { class: 'sp' }),
    btn('Preview', preview), btn('Cancel changes', discard), btn('Previous version', revert),
    btn('Save draft', saveDraft), btn('Publish', publish, 'primary'), btn('Logout', logout, 'danger'), btn('✕', closePanel));
  side.append(search, el('div', { class: 'adm-navlist' }));
  root = el('div', { class: 'adm-root' }, top, el('div', { class: 'adm-body' }, side, main));
  document.body.append(root); document.body.classList.add('adm-open');
  requestAnimationFrame(() => root.classList.add('in'));
  drawSide(); drawView(); updateStatus();
  addEventListener('beforeunload', warnUnload);
  if (defaultPw) S.toast('You are still using the default password. Change it in Security & Password.', 'err');
}
const warnUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
function destroyPanel(keepRender) {
  removeEventListener('beforeunload', warnUnload);
  if (root) { root.remove(); root = null; }
  if (previewBar) { previewBar.remove(); previewBar = null; }
  document.body.classList.remove('adm-open');
  if (!keepRender) S.reload().catch(() => { });
}
async function closePanel() {
  if (dirty && !(await confirmBox('You have unsaved changes. Close without saving?'))) return;
  destroyPanel();
}
async function logout() {
  if (dirty && !(await confirmBox('You have unsaved changes. Log out anyway?'))) return;
  try { await api('/logout', { method: 'POST' }); } catch { }
  token = ''; sessionStorage.removeItem('adm_t'); destroyPanel();
}
function markDirty() { dirty = true; updateStatus(); clearTimeout(markDirty.t); markDirty.t = setTimeout(() => S.render(draft, { instant: true, noLight: true }), 200); }
function updateStatus() {
  if (!statusEl) return;
  const differs = JSON.stringify(draft) !== JSON.stringify(published);
  statusEl.textContent = dirty ? '● Unsaved changes' : differs ? '● Draft not published' : '● Up to date';
  statusEl.className = 'adm-status ' + (dirty ? 'warn' : differs ? 'info' : 'ok');
}
function drawSide() {
  const list = $1('.adm-navlist', side); list.replaceChildren();
  VIEWS.filter(([, l]) => !q || l.toLowerCase().includes(q) || contentMatches(l)).forEach(([id, l]) =>
    list.append(el('button', { type: 'button', class: 'adm-nav' + (id === view ? ' on' : ''), onclick: () => { view = id; side.classList.remove('open'); drawSide(); drawView(); } }, l)));
}
const $1 = (s, r = document) => r.querySelector(s);
function contentMatches(label) {
  const k = { Skills: 'skills', Projects: 'works', Certificates: 'certs', Experience: 'experience', Education: 'education', 'Social Links': 'socials' }[label];
  return k ? JSON.stringify(draft[k]).toLowerCase().includes(q) : false;
}

/* ---------- actions ---------- */
async function saveDraft(silent) {
  try { const r = await api('/draft', { method: 'PUT', body: draft }); draft = S.normalize(r.draft); dirty = false; updateStatus(); silent === true || S.toast('Draft saved'); return true; }
  catch (e) { S.toast(e.message, 'err'); return false; }
}
async function publish() {
  if (!(await confirmBox('Publish the draft to the live website?'))) return;
  if (!(await saveDraft(true))) return;
  try { const r = await api('/publish', { method: 'POST' }); published = S.normalize(r.published); updateStatus(); S.toast('Published — live for every visitor'); }
  catch (e) { S.toast(e.message, 'err'); }
}
async function discard() {
  if (!(await confirmBox('Discard all draft changes and go back to the published version?'))) return;
  try { const r = await api('/discard', { method: 'POST' }); draft = S.normalize(r.draft); dirty = false; S.render(draft, { instant: true, noLight: true }); updateStatus(); drawView(); S.toast('Changes discarded'); }
  catch (e) { S.toast(e.message, 'err'); }
}
async function revert() {
  if (!(await confirmBox('Restore the previously published version? The current version becomes the "previous" one, so you can swap back.'))) return;
  try { const r = await api('/revert', { method: 'POST' }); draft = S.normalize(r.content); published = clone(draft); dirty = false; S.render(draft, { instant: true, noLight: true }); updateStatus(); drawView(); S.toast('Previous version restored'); }
  catch (e) { S.toast(e.message, 'err'); }
}
function preview() {
  S.render(draft, { instant: true, noLight: true });
  root.classList.remove('in'); root.style.pointerEvents = 'none';
  previewBar = el('div', { class: 'adm-prevbar adm-glass' }, el('span', {}, 'Previewing draft'),
    btn('Back to editor', () => { previewBar.remove(); previewBar = null; root.style.pointerEvents = ''; root.classList.add('in'); }),
    btn('Publish', async () => { previewBar.remove(); previewBar = null; root.style.pointerEvents = ''; root.classList.add('in'); publish(); }, 'primary'));
  document.body.append(previewBar);
}

/* ---------- uploads ---------- */
const b64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
async function prepare(file) {
  if (file.size > 25e6) throw new Error('File too large');
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const bmp = await createImageBitmap(file), s = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.85));
      if (blob && blob.type === 'image/webp') return { data: await b64(blob), name: file.name };
    } catch { }
  }
  return { data: await b64(file), name: file.name };
}
async function upload(file) {
  S.toast('Uploading…');
  const p = await prepare(file);
  return (await api('/upload', { method: 'POST', body: p })).url;
}
async function pickMedia(kind) {
  return new Promise(async res => {
    let m; try {
      const { files } = await api('/media');
      const items = files.filter(f => kind === 'image' ? f.type === 'image' : true);
      const grid = el('div', { class: 'adm-media' }, items.length ? items.map(f => el('button', { type: 'button', class: 'adm-tile', onclick: () => { m.close(); res(f.url); } }, f.type === 'image' ? el('img', { src: f.url, alt: '', loading: 'lazy' }) : el('span', { class: 'pdf' }, 'PDF'), el('small', {}, f.name))) : el('p', { class: 'adm-msg' }, 'No uploads yet.'));
      m = modal([el('h2', {}, 'Media Library'), grid, el('div', { class: 'adm-row end' }, btn('Close', () => m.close()))], { wide: true, onClose: () => res(null) });
    } catch (e) { S.toast(e.message, 'err'); res(null); }
  });
}

/* ---------- field builders ---------- */
function mediaField(obj, key, label, kind = 'image') {
  const prev = el('img', { class: 'adm-prev', alt: '' });
  const inp = el('input', { class: 'adm-in', type: 'text', placeholder: kind === 'file' ? 'https://… or upload PDF' : 'https://… or upload', 'aria-label': label });
  const file = el('input', { type: 'file', hidden: true, accept: kind === 'file' ? 'application/pdf,image/*' : 'image/*' });
  const sync = () => { const u = obj[key] || ''; if (document.activeElement !== inp) inp.value = u; if (u && /^(https?:|\/)/.test(u) && !/\.pdf$/i.test(u)) { prev.src = u; prev.style.display = 'block'; } else { prev.removeAttribute('src'); prev.style.display = 'none'; } };
  const set = v => { obj[key] = v; sync(); inp.value = v; markDirty(); };
  inp.addEventListener('input', () => { obj[key] = inp.value.trim(); sync(); markDirty(); });
  file.addEventListener('change', async () => { if (!file.files[0]) return; try { set(await upload(file.files[0])); S.toast('Uploaded'); } catch (e) { S.toast(e.message, 'err'); } file.value = ''; });
  sync();
  return el('div', { class: 'adm-f' }, el('span', {}, label), prev, inp,
    el('div', { class: 'adm-row' }, btn('Upload', () => file.click()), btn('Library', async () => { const u = await pickMedia(kind === 'file' ? 'any' : 'image'); if (u) set(u); }), btn('Clear', () => set('')), file));
}
function galleryField(obj, key, label) {
  const arr = obj[key] = Array.isArray(obj[key]) ? obj[key] : [];
  const box = el('div', { class: 'adm-gal' }), file = el('input', { type: 'file', hidden: true, accept: 'image/*', multiple: true });
  const draw = () => { box.replaceChildren(...arr.map((u, i) => el('div', { class: 'adm-gi' }, el('img', { src: u, alt: '' }), btn('✕', () => { arr.splice(i, 1); draw(); markDirty(); })))); };
  file.addEventListener('change', async () => { for (const f of file.files) { try { arr.push(await upload(f)); } catch (e) { S.toast(e.message, 'err'); } } file.value = ''; draw(); markDirty(); });
  draw();
  return el('div', { class: 'adm-f' }, el('span', {}, label), box, el('div', { class: 'adm-row' }, btn('Upload images', () => file.click()), btn('Add from library', async () => { const u = await pickMedia('image'); if (u) { arr.push(u); draw(); markDirty(); } }), file));
}
function F(obj, key, label, type = 'text', o = {}) {
  if (type === 'image' || type === 'file') return mediaField(obj, key, label, type);
  if (type === 'gallery') return galleryField(obj, key, label);
  const wrap = el('label', { class: 'adm-f' + (type === 'bool' ? ' bool' : '') });
  const set = v => { obj[key] = v; markDirty(); };
  let inp;
  if (type === 'textarea') { inp = el('textarea', { class: 'adm-in', rows: o.rows || 4 }); inp.value = obj[key] ?? ''; inp.addEventListener('input', () => set(inp.value)); }
  else if (type === 'lines') { inp = el('textarea', { class: 'adm-in', rows: 4, placeholder: 'One per line' }); inp.value = (obj[key] || []).join('\n'); inp.addEventListener('input', () => set(inp.value.split('\n').map(s => s.trim()).filter(Boolean))); }
  else if (type === 'csv') { inp = el('input', { class: 'adm-in', type: 'text' }); inp.value = (obj[key] || []).join(', '); inp.addEventListener('input', () => set(inp.value.split(',').map(s => s.trim()).filter(Boolean))); }
  else if (type === 'range') {
    const out = el('output', {}, obj[key] ?? o.min);
    inp = el('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1 }); inp.value = obj[key] ?? o.min ?? 0;
    inp.addEventListener('input', () => { out.textContent = inp.value; set(Number(inp.value)); });
    return el('label', { class: 'adm-f range' }, el('span', {}, label, ' ', out), inp);
  }
  else if (type === 'bool') { inp = el('input', { type: 'checkbox' }); inp.checked = !!obj[key]; inp.addEventListener('change', () => set(inp.checked)); wrap.append(inp, el('span', {}, label)); return wrap; }
  else if (type === 'url') {
    inp = el('input', { class: 'adm-in', type: 'text', placeholder: 'https://…' }); inp.value = obj[key] ?? '';
    const hint = el('small', { class: 'adm-hint' });
    const chk = () => { const v = inp.value.trim(); const okF = !v || /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v); hint.textContent = okF ? '' : 'Links must start with https://, mailto:, tel: or /'; hint.className = 'adm-hint ' + (okF ? '' : 'bad'); };
    inp.addEventListener('input', () => { set(inp.value.trim()); chk(); }); chk();
    wrap.append(el('span', {}, label), el('div', { class: 'adm-row' }, inp, btn('Test', () => { const v = inp.value.trim(); if (!v || v === '#') return S.toast('Nothing to test', 'err'); if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(v)) return S.toast('Invalid link format', 'err'); window.open(v, '_blank', 'noopener'); })), hint);
    return wrap;
  }
  else { inp = el('input', { class: 'adm-in', type: 'text' }); inp.value = obj[key] ?? ''; inp.addEventListener('input', () => set(inp.value)); }
  wrap.append(el('span', {}, label), inp); return wrap;
}
const form = (obj, fields) => el('div', { class: 'adm-form' }, fields.map(([k, l, t, o]) => F(obj, k, l, t, o)));

function listEditor(arr, spec) {
  const box = el('div', { class: 'adm-list' });
  const draw = () => {
    box.replaceChildren();
    if (!arr.length) box.append(el('p', { class: 'adm-msg' }, 'Nothing here yet.'));
    arr.forEach((it, i) => {
      if (q && !JSON.stringify(it).toLowerCase().includes(q)) return;
      const label = el('span', {}, it[spec.title] || 'Untitled');
      const d = el('details', { class: 'adm-item' });
      d.open = open.has(it); d.addEventListener('toggle', () => d.open ? open.add(it) : open.delete(it));
      const act = (t, fn, c = '') => el('button', { type: 'button', class: 'adm-mini ' + c, 'aria-label': t, title: t, onclick: e => { e.preventDefault(); e.stopPropagation(); fn(); } }, t === 'Move up' ? '↑' : t === 'Move down' ? '↓' : '🗑');
      d.append(el('summary', {}, label, el('span', { class: 'sp' }),
        act('Move up', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); markDirty(); } }),
        act('Move down', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; draw(); markDirty(); } }),
        act('Delete', async () => { if (await confirmBox(`Delete "${it[spec.title] || 'this item'}"?`)) { arr.splice(i, 1); draw(); markDirty(); } }, 'danger')),
        form(it, spec.fields));
      d.addEventListener('input', () => { label.textContent = it[spec.title] || 'Untitled'; });
      box.append(d);
    });
  };
  draw();
  return el('div', {}, box, btn('+ Add ' + spec.noun, () => { const n = spec.blank(); arr.push(n); open.add(n); draw(); markDirty(); }, 'primary'));
}

/* ---------- views ---------- */
const SPEC = {
  skills: { noun: 'skill', title: 'name', blank: () => ({ name: 'New skill', category: '', level: 50, icon: '' }), fields: [['name', 'Skill name'], ['category', 'Category'], ['level', 'Proficiency %', 'range', { min: 0, max: 100 }], ['icon', 'Icon', 'image']] },
  works: { noun: 'project', title: 'title', blank: () => ({ title: 'New project', desc: '', link: '', github: '', category: '', tech: [], thumb: '', thumbAlt: '', images: [] }), fields: [['title', 'Title'], ['category', 'Category'], ['desc', 'Description', 'textarea'], ['tech', 'Technologies (comma separated)', 'csv'], ['link', 'Live link (use # for none)', 'url'], ['github', 'GitHub link', 'url'], ['thumb', 'Thumbnail', 'image'], ['thumbAlt', 'Thumbnail alt text'], ['images', 'Additional images', 'gallery']] },
  certs: { noun: 'certificate', title: 'title', blank: () => ({ title: 'New certificate', desc: '', issuer: '', date: '', credId: '', url: '', image: '', imageAlt: '', pdf: '' }), fields: [['title', 'Certificate name'], ['issuer', 'Issuing organisation'], ['date', 'Issue date'], ['credId', 'Credential ID'], ['desc', 'Description', 'textarea'], ['url', 'Verification URL', 'url'], ['image', 'Certificate image', 'image'], ['imageAlt', 'Image alt text'], ['pdf', 'Certificate PDF', 'file']] },
  experience: { noun: 'entry', title: 'role', blank: () => ({ role: 'New role', org: '', type: '', start: '', end: '', desc: '', achievements: [] }), fields: [['role', 'Job title'], ['org', 'Organisation'], ['type', 'Type (Job, Internship, Current work…)'], ['start', 'Start date'], ['end', 'End date (blank / Present)'], ['desc', 'Description', 'textarea'], ['achievements', 'Achievements', 'lines']] },
  education: { noun: 'entry', title: 'course', blank: () => ({ school: '', course: 'New course', start: '', end: '', desc: '', achievements: [] }), fields: [['school', 'Institution'], ['course', 'Course / qualification'], ['start', 'Start date'], ['end', 'End date'], ['desc', 'Description', 'textarea'], ['achievements', 'Achievements', 'lines']] },
  socials: { noun: 'link', title: 'label', blank: () => ({ label: 'New link', url: '', icon: '' }), fields: [['label', 'Button label'], ['url', 'URL', 'url'], ['icon', 'Icon', 'image']] }
};
const card = (title, ...c) => el('section', { class: 'adm-card adm-glass' }, el('h3', {}, title), ...c);

function drawView() {
  main.replaceChildren(); main.scrollTop = 0;
  const label = VIEWS.find(v => v[0] === view)[1];
  main.append(el('h2', { class: 'adm-h' }, label));
  const d = draft;
  if (SPEC[view]) { main.append(card(label, listEditor(d[view], SPEC[view]))); if (view === 'socials') main.append(card('Footer links', listEditor(d.footer.links, { noun: 'link', title: 'label', blank: () => ({ label: 'New link', url: '' }), fields: [['label', 'Label'], ['url', 'URL', 'url']] }))); return; }
  switch (view) {
    case 'overview': return overview();
    case 'personal': return main.append(card('Personal information', form(d.personal, [['name', 'Full name'], ['title', 'Professional title'], ['intro', 'Short introduction', 'textarea'], ['pic', 'Profile photograph', 'image'], ['picAlt', 'Photo alt text'], ['picPos', 'Photo position (CSS, e.g. 50% 30%)'], ['location', 'Location'], ['email', 'Email address'], ['phone', 'Phone number'], ['resume', 'Resume / CV (link or upload)', 'file']])));
    case 'hero': return main.append(card('Hero', form(d.hero, [['words', 'Rotating tagline words (comma separated)', 'csv'], ['heading', 'Main heading (blank = full name)'], ['sub', 'Subheading'], ['desc', 'Description', 'textarea'], ['image', 'Profile image (blank = personal photo)', 'image'], ['bg', 'Background image', 'image'], ['ctaText', 'CTA button text'], ['ctaLink', 'CTA link (blank = resume)', 'url'], ['cta2Text', 'Second button text'], ['cta2Link', 'Second button link', 'url']])));
    case 'about': return main.append(card('About', form(d.about, [['title', 'Section title'], ['headline', 'Headline'], ['text', 'Description (use **bold** for highlights)', 'textarea', { rows: 6 }], ['image', 'Image', 'image'], ['imageAlt', 'Image alt text'], ['highlights', 'Highlighted information', 'lines']])),
      card('Personal information rows', listEditor(d.about.info, { noun: 'row', title: 'label', blank: () => ({ label: 'Label', value: '' }), fields: [['label', 'Label'], ['value', 'Value']] })),
      card('Additional content blocks', listEditor(d.about.blocks, { noun: 'block', title: 'title', blank: () => ({ title: 'New block', text: '' }), fields: [['title', 'Title'], ['text', 'Text', 'textarea']] })));
    case 'contact': return main.append(card('Contact', form(d.contact, [['desc', 'Contact description', 'textarea'], ['email', 'Email'], ['phone', 'Phone number']])), card('Section titles', form(d.titles, [['contact', 'Contact section title']])), el('p', { class: 'adm-msg' }, 'Contact buttons and their labels are managed under Social Links.'));
    case 'media': return mediaView();
    case 'theme': return themeView();
    case 'glass': return main.append(card('Glass effects (live preview behind this panel)', glassForm()));
    case 'settings': return main.append(card('Website settings', form(d.settings, [['siteTitle', 'Site title'], ['description', 'SEO description', 'textarea'], ['favicon', 'Favicon', 'image'], ['showMatrix', 'Show digital-rain background', 'bool'], ['lightDefault', 'Start with the light on', 'bool']])),
      card('Section titles', form(d.titles, [['skills', 'Skills'], ['works', 'Projects'], ['certs', 'Certificates'], ['experience', 'Experience'], ['education', 'Education']])),
      card('Footer', form(d.footer, [['text', 'Copyright text'], ['desc', 'Footer description', 'textarea'], ['showSocials', 'Show social links in footer', 'bool']])),
      el('p', { class: 'adm-msg' }, 'Footer navigation links are edited under Social Links.'));
    case 'security': return securityView();
  }
}

function overview() {
  const d = draft, stat = (n, l) => el('div', { class: 'adm-stat' }, el('b', {}, n), el('span', {}, l));
  main.append(card('Content', el('div', { class: 'adm-stats' }, stat(d.works.length, 'Projects'), stat(d.certs.length, 'Certificates'), stat(d.skills.length, 'Skills'), stat(d.experience.length, 'Experience'), stat(d.education.length, 'Education'), stat(d.socials.length, 'Social links')),
    el('p', { class: 'adm-msg' }, 'Edits change a private draft and appear live behind this panel. Nothing reaches visitors until you press Publish.')),
    defaultPw ? card('Security warning', el('p', { class: 'adm-msg' }, 'The default password is still active. Anyone who guesses it can edit your site.'), btn('Change password', () => { view = 'security'; drawSide(); drawView(); }, 'danger')) : null,
    card('Backup', btn('Download backup (JSON)', exportBackup)));
}
async function exportBackup() {
  try { const r = await fetch('/api/export', { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Export failed'); const a = el('a', { href: URL.createObjectURL(await r.blob()), download: 'portfolio-backup.json' }); document.body.append(a); a.click(); a.remove(); } catch (e) { S.toast(e.message, 'err'); }
}

async function mediaView() {
  const box = el('div', { class: 'adm-media' }), file = el('input', { type: 'file', hidden: true, accept: 'image/*,application/pdf', multiple: true });
  const draw = async () => {
    try {
      const { files } = await api('/media'); box.replaceChildren();
      files.filter(f => !q || f.name.includes(q)).forEach(f => box.append(el('div', { class: 'adm-tile' }, f.type === 'image' ? el('img', { src: f.url, alt: '', loading: 'lazy' }) : el('span', { class: 'pdf' }, 'PDF'), el('small', {}, f.name), el('small', {}, `${Math.round(f.size / 1024)} KB · ${f.used ? 'in use' : 'unused'}`),
        el('div', { class: 'adm-row' }, btn('Copy URL', () => navigator.clipboard?.writeText(location.origin + f.url).then(() => S.toast('URL copied'))), btn('Delete', async () => { if (!(await confirmBox('Delete ' + f.name + '?'))) return; try { await api('/media/' + f.name, { method: 'DELETE' }); S.toast('Deleted'); draw(); } catch (e) { S.toast(e.message, 'err'); } }, 'danger')))));
      if (!files.length) box.append(el('p', { class: 'adm-msg' }, 'No uploads yet.'));
    } catch (e) { S.toast(e.message, 'err'); }
  };
  file.addEventListener('change', async () => { for (const f of file.files) { try { await upload(f); } catch (e) { S.toast(e.message, 'err'); } } file.value = ''; draw(); });
  main.append(card('Uploads (images are resized to 1920px and converted to WebP before upload)', el('div', { class: 'adm-row' }, btn('Upload files', () => file.click(), 'primary'), file), box)); draw();
}

const COLORS = [['brand', 'Primary brand color'], ['brand2', 'Secondary brand color'], ['accent', 'Accent color'], ['bg', 'Background color'], ['surface', 'Surface color'], ['tint', 'Glass tint'], ['text', 'Main text color'], ['text2', 'Secondary text color'], ['border', 'Border color'], ['button', 'Button color'], ['hover', 'Hover color']];
function themeView() {
  const t = draft.theme, wrap = el('div', { class: 'adm-colors' });
  COLORS.forEach(([k, l]) => {
    const pick = el('input', { type: 'color', 'aria-label': l + ' picker' }), hex = el('input', { class: 'adm-in', type: 'text', maxlength: 7, 'aria-label': l + ' hex' }), rgb = el('input', { class: 'adm-in', type: 'text', 'aria-label': l + ' rgb' });
    const show = () => { pick.value = /^#[0-9a-f]{6}$/i.test(t[k]) ? t[k] : '#000000'; hex.value = t[k]; rgb.value = S.hex2rgb(t[k]); };
    const set = v => { t[k] = v; show(); markDirty(); };
    pick.addEventListener('input', () => set(pick.value));
    hex.addEventListener('input', () => { let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) { t[k] = v.toLowerCase(); pick.value = t[k]; rgb.value = S.hex2rgb(v); markDirty(); } });
    rgb.addEventListener('change', () => { const m = rgb.value.match(/^\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*$/); if (m && m.slice(1).every(n => +n <= 255)) set('#' + m.slice(1).map(n => (+n).toString(16).padStart(2, '0')).join('')); else show(); });
    show();
    wrap.append(el('div', { class: 'adm-color' }, pick, el('div', {}, el('span', {}, l), el('div', { class: 'adm-row' }, hex, rgb))));
  });
  main.append(card('Colors (brand colors are independent of background and text)', wrap, el('p', { class: 'adm-msg' }, 'Hex or "r, g, b". Changes preview live behind this panel.'), el('div', { class: 'adm-row' }, btn('Reset to default', async () => { if (await confirmBox('Reset all theme colors to default?')) { draft.theme = clone(S.defaults.theme); markDirty(); drawView(); } }), btn('Save theme', () => saveDraft(), 'primary'))),
    card('Shadow & transparency', form(draft.glass, [['shadow', 'Shadow intensity', 'range', { min: 0, max: 1, step: 0.01 }], ['opacity', 'Glass transparency', 'range', { min: 0, max: 0.4, step: 0.005 }]])));
}
function glassForm() {
  return el('div', {}, form(draft.glass, [['blur', 'Blur intensity (px)', 'range', { min: 0, max: 60 }], ['opacity', 'Transparency (fill)', 'range', { min: 0, max: 0.4, step: 0.005 }], ['borderOpacity', 'Border opacity', 'range', { min: 0, max: 0.6, step: 0.01 }], ['reflection', 'Reflection intensity', 'range', { min: 0, max: 0.6, step: 0.01 }], ['shadow', 'Shadow intensity', 'range', { min: 0, max: 1, step: 0.01 }], ['radius', 'Card roundness (px)', 'range', { min: 0, max: 48 }], ['gradient', 'Background gradient', 'range', { min: 0, max: 1, step: 0.01 }], ['glow', 'Glow intensity', 'range', { min: 0, max: 1, step: 0.01 }], ['depth', 'Surface depth', 'range', { min: 0, max: 1, step: 0.01 }]]),
    btn('Reset glass to default', async () => { if (await confirmBox('Reset glass effects to default?')) { draft.glass = clone(S.defaults.glass); markDirty(); drawView(); } }));
}
function securityView() {
  const cur = el('input', { class: 'adm-in', type: 'password', placeholder: 'Current password', autocomplete: 'current-password' }), n1 = el('input', { class: 'adm-in', type: 'password', placeholder: 'New password (min 8 characters)', autocomplete: 'new-password' }), n2 = el('input', { class: 'adm-in', type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
  main.append(card('Change password', cur, n1, n2, btn('Update password', async () => {
    if (n1.value !== n2.value) return S.toast('Passwords do not match', 'err');
    try { await api('/password', { method: 'POST', body: { current: cur.value, next: n1.value } }); S.toast('Password changed. Please log in again.'); token = ''; sessionStorage.removeItem('adm_t'); dirty = false; destroyPanel(); }
    catch (e) { S.toast(e.message, 'err'); }
  }, 'primary')), card('How this is secured', el('p', { class: 'adm-msg' }, 'The password is stored only as a salted scrypt hash on the server. Login is rate-limited, sessions expire after 2 hours of inactivity, and every edit/upload endpoint verifies your session on the server. Changing the password signs out all sessions.')), card('Backup', btn('Download backup (JSON)', exportBackup)));
}

window.Admin = { open: openAdmin };
})();
