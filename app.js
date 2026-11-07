(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => { u = String(u || '').trim(); return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(u) ? u : ''; };
const real = u => { u = safeUrl(u); return u && u !== '#' ? u : ''; };
const rich = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hex2rgb = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h, 16); return (h.length !== 6 || Number.isNaN(n)) ? '255,255,255' : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const lum = h => { const [r, g, b] = hex2rgb(h).split(',').map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

const DEF = {
  theme: { brand: '#00ffff', brand2: '#4d9bff', accent: '#a78bfa', bg: '#02050a', surface: '#0b1220', tint: '#ffffff', text: '#ffffff', text2: '#aab6c6', border: '#ffffff', button: '#00ffff', hover: '#7dffff' },
  glass: { blur: 22, opacity: 0.08, borderOpacity: 0.18, reflection: 0.25, shadow: 0.5, radius: 28, glow: 0.25, depth: 0.5, gradient: 0.6 },
  settings: { siteTitle: 'Karthik | Neon Blue Portfolio', description: '', favicon: '', showMatrix: true, lightDefault: false },
  titles: { skills: 'SKILLS', works: 'CURRENT WORK', certs: 'CERTIFICATES', experience: 'EXPERIENCE', education: 'EDUCATION', contact: 'GET IN TOUCH' }
};
const ARR = ['skills', 'works', 'certs', 'experience', 'education', 'socials'];
const OBJ = ['personal', 'hero', 'about', 'contact', 'footer'];
function normalize(d) {
  d = JSON.parse(JSON.stringify(d || {}));
  ARR.forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  OBJ.forEach(k => { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; });
  ['theme', 'glass', 'settings', 'titles'].forEach(k => { d[k] = { ...DEF[k], ...(d[k] || {}) }; });
  if (!Array.isArray(d.hero.words)) d.hero.words = [];
  ['highlights', 'info', 'blocks'].forEach(k => { if (!Array.isArray(d.about[k])) d.about[k] = []; });
  if (!Array.isArray(d.footer.links)) d.footer.links = [];
  return d;
}

/* ---- Forced Chrome redirection (preserved from original) ---- */
function forceChrome(event, targetUrl) {
  event.preventDefault();
  const cleanUrl = String(targetUrl).replace(/\\/g, '');
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const inApp = /Instagram|FBAN|FBAV|Threads/i.test(ua);
  if (inApp) {
    if (/Android/i.test(ua)) {
      window.location.href = `intent://${cleanUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = cleanUrl.replace(/^https?:\/\//, 'googlechromes://');
      setTimeout(() => window.open(cleanUrl, '_blank', 'noopener'), 1000);
    } else window.open(cleanUrl, '_blank', 'noopener');
  } else window.open(cleanUrl, '_blank', 'noopener');
}
window.forceChrome = forceChrome;
document.addEventListener('click', e => {
  const a = e.target.closest('a.ext');
  if (a) { const h = a.getAttribute('href'); if (/^https?:|^\//i.test(h) && h !== '#') { forceChrome(e, a.href); } else if (h === '#') e.preventDefault(); return; }
  const card = e.target.closest('[data-href]');
  if (card && !e.target.closest('a,button')) forceChrome(e, card.dataset.href);
});

/* ---- toasts ---- */
function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = (type === 'ok' ? '✓ ' : '⚠ ') + msg;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 3600);
}

/* ---- rendering ---- */
let cur = null, backend = false, io, spy;
const img = (u, alt, cls = '', pos) => { u = real(u); return u ? `<img src="${esc(u)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" ${cls ? `class="${cls}"` : ''}${pos ? ` style="object-position:${esc(pos)}"` : ''}>` : ''; };
const vnum = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
const dates = x => [x.start, x.end].filter(Boolean).join(' – ');

function applyTheme(c) {
  const r = document.documentElement.style, t = c.theme, g = c.glass;
  const set = (k, v) => r.setProperty(k, v);
  set('--brand', t.brand); set('--brand-rgb', hex2rgb(t.brand)); set('--brand2', t.brand2); set('--accent', t.accent);
  set('--bg', t.bg); set('--surface', t.surface); set('--tint', hex2rgb(t.tint)); set('--text', t.text); set('--text2', t.text2);
  set('--border-rgb', hex2rgb(t.border)); set('--button', t.button); set('--hover', t.hover);
  set('--btn-ink', lum(t.button) > 0.55 ? '#031014' : '#ffffff');
  set('--blur', vnum(g.blur, 0, 80) + 'px'); set('--g-op', vnum(g.opacity, 0, 1)); set('--g-bo', vnum(g.borderOpacity, 0, 1));
  set('--g-refl', vnum(g.reflection, 0, 1)); set('--g-sh', vnum(g.shadow, 0, 1)); set('--radius', vnum(g.radius, 0, 80) + 'px');
  set('--glow', vnum(g.glow, 0, 1)); set('--depth', vnum(g.depth, 0, 1)); set('--grad', vnum(g.gradient, 0, 1));
  const m = $('meta[name=theme-color]'); if (m) m.content = t.bg;
}

function render(data, opt = {}) {
  const c = cur = normalize(data), p = c.personal, h = c.hero, ab = c.about;
  applyTheme(c);
  document.title = c.settings.siteTitle || document.title;
  const md = $('meta[name=description]'); if (md && c.settings.description) md.content = c.settings.description;
  const og = $('meta[property="og:title"]'); if (og) og.content = document.title;
  if (real(c.settings.favicon)) { let l = $('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.append(l); } l.href = real(c.settings.favicon); }
  $('#hacking-canvas').style.display = c.settings.showMatrix === false ? 'none' : '';

  // hero
  const pi = $('#dom-profile-img'), pic = real(h.image || p.pic);
  pi.hidden = !pic; if (pic && pi.getAttribute('src') !== pic) pi.src = pic;
  pi.alt = p.picAlt || 'Profile'; pi.style.objectPosition = p.picPos || '50% 50%';
  $('#dom-name').textContent = h.heading || p.name || '';
  const sub = $('#dom-sub'), desc = $('#dom-desc');
  sub.textContent = h.sub || p.title || ''; sub.hidden = !sub.textContent;
  desc.textContent = h.desc || p.intro || ''; desc.hidden = !desc.textContent;
  const bg = real(h.bg), home = $('#home');
  home.classList.toggle('has-bg', !!bg); home.style.setProperty('--hero-bg', bg ? `url(${JSON.stringify(bg)})` : 'none');
  const cta = $('#dom-resume'); cta.textContent = h.ctaText || 'VIEW RESUME';
  const link = real(h.ctaLink || p.resume); cta.setAttribute('href', link || '#'); cta.hidden = !link;
  const c2 = $('#dom-cta2'), l2 = real(h.cta2Link); c2.hidden = !(h.cta2Text && l2); c2.textContent = h.cta2Text || ''; c2.setAttribute('href', l2 || '#');

  // titles
  $('#about-title').textContent = ab.title || 'ABOUT ME';
  [['skills', 'skills'], ['works', 'works'], ['certs', 'certs'], ['experience', 'experience'], ['education', 'education'], ['contact', 'contact']].forEach(([k, t]) => { const e = $('#' + t + '-title'); if (e) e.textContent = c.titles[k] || DEF.titles[k]; });

  // about
  const hasAbout = ab.headline || ab.text || ab.image || ab.highlights.length || ab.info.length || ab.blocks.length;
  $('#about').hidden = !hasAbout;
  $('#dom-about').innerHTML =
    (real(ab.image) ? `<img class="about-img" src="${esc(real(ab.image))}" alt="${esc(ab.imageAlt)}" loading="lazy">` : '') +
    (ab.headline ? `<p class="headline">${rich(ab.headline)}</p>` : '') +
    (ab.text ? `<p class="body">${rich(ab.text)}</p>` : '') +
    (ab.highlights.length ? `<div class="chips">${ab.highlights.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '') +
    (ab.info.length ? `<div class="info-grid">${ab.info.map(x => `<div><small>${esc(x.label)}</small><span>${esc(x.value)}</span></div>`).join('')}</div>` : '') +
    (ab.blocks.length ? `<div class="blocks">${ab.blocks.map(x => `<div><h4>${esc(x.title)}</h4><p>${rich(x.text)}</p></div>`).join('')}</div>` : '');

  // skills
  $('#skills').hidden = !c.skills.length;
  $('#dom-skills').innerHTML = c.skills.map((s, i) => `<div class="card glass skill rv tilt" style="--i:${i % 6};--w:${vnum(s.level, 0, 100)}%"><div class="top">${img(s.icon, '')}<h3>${esc(s.name)}</h3><span class="meta">${vnum(s.level, 0, 100)}%</span></div>${s.category ? `<span class="meta">${esc(s.category)}</span>` : ''}<div class="bar"><i></i></div></div>`).join('');

  // works
  $('#works').hidden = !c.works.length;
  $('#dom-works').innerHTML = c.works.map((w, i) => {
    const l = real(w.link), g = real(w.github);
    return `<article class="card glass rv tilt" style="--i:${i % 6}"${l ? ` data-href="${esc(l)}"` : ''}>
      ${real(w.thumb) ? `<div class="thumb">${img(w.thumb, w.thumbAlt || w.title)}</div>` : ''}
      ${w.category ? `<span class="chip">${esc(w.category)}</span>` : ''}
      <h3>${esc(w.title)}</h3><p>${esc(w.desc)}</p>
      ${(w.tech || []).length ? `<div class="chips">${w.tech.map(t => `<span class="meta">#${esc(t)}</span>`).join('')}</div>` : ''}
      ${(w.images || []).filter(real).length ? `<div class="gallery">${w.images.filter(real).map(u => img(u, w.title)).join('')}</div>` : ''}
      ${l || g ? `<div class="btnrow">${l ? `<a class="visit-btn ext" href="${esc(l)}">VISIT</a>` : ''}${g ? `<a class="visit-btn ghost ext" href="${esc(g)}">GITHUB</a>` : ''}</div>` : ''}
    </article>`;
  }).join('');

  // certificates
  $('#certificates').hidden = !c.certs.length;
  $('#dom-certs').innerHTML = c.certs.map((x, i) => {
    const u = real(x.url), pdf = real(x.pdf);
    return `<article class="card glass rv tilt" style="--i:${i % 6}">
      ${real(x.image) ? `<div class="thumb">${img(x.image, x.imageAlt || x.title)}</div>` : ''}
      <h3>${esc(x.title)}</h3>
      ${(x.issuer || x.date) ? `<span class="meta">${esc([x.issuer, x.date].filter(Boolean).join(' · '))}</span>` : ''}
      <p>${esc(x.desc)}</p>
      ${x.credId ? `<span class="meta">ID: ${esc(x.credId)}</span>` : ''}
      ${u || pdf ? `<div class="btnrow">${u ? `<a class="visit-btn ext" href="${esc(u)}">VERIFY</a>` : ''}${pdf ? `<a class="visit-btn ghost ext" href="${esc(pdf)}">PDF</a>` : ''}</div>` : ''}
    </article>`;
  }).join('');

  // experience / education
  const tl = (arr, mk) => arr.map((x, i) => `<article class="tl glass rv" style="--i:${i % 6}">${mk(x)}</article>`).join('');
  const ach = x => (x.achievements || []).length ? `<ul>${x.achievements.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
  $('#experience').hidden = !c.experience.length;
  $('#dom-exp').innerHTML = tl(c.experience, x => `<h3>${esc(x.role)}</h3><div class="org">${esc(x.org)}${x.type ? ` <span class="chip">${esc(x.type)}</span>` : ''}</div><span class="meta">${esc(dates(x))}</span>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${ach(x)}`);
  $('#education').hidden = !c.education.length;
  $('#dom-edu').innerHTML = tl(c.education, x => `<h3>${esc(x.course)}</h3><div class="org">${esc(x.school)}</div><span class="meta">${esc(dates(x))}</span>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${ach(x)}`);

  // contact
  const cd = $('#dom-contact-desc'); cd.textContent = c.contact.desc || ''; cd.hidden = !c.contact.desc;
  const mail = c.contact.email || p.email, phone = c.contact.phone || p.phone;
  const hasMailSocial = c.socials.some(s => /^mailto:/i.test(s.url || ''));
  $('#dom-contact-lines').innerHTML = (mail && !hasMailSocial ? `<a href="mailto:${esc(mail)}">${esc(mail)}</a>` : '') + (phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>` : '') + (p.location ? `<span>${esc(p.location)}</span>` : '');
  const socialHtml = (cls) => c.socials.filter(s => real(s.url)).map(s => {
    const u = real(s.url), ext = /^https?:/i.test(u);
    return `<a class="${cls}${ext ? ' ext' : ''}" href="${esc(u)}">${real(s.icon) ? `<img src="${esc(real(s.icon))}" alt="" class="social-png" loading="lazy">` : ''}<span class="social-label">${esc(s.label)}</span></a>`;
  }).join('');
  $('#dom-socials').innerHTML = c.socials.filter(s => real(s.url)).map((s, i) => {
    const u = real(s.url), ext = /^https?:/i.test(u);
    return `<a class="social-icon-link glass rv${ext ? ' ext' : ''}" style="--i:${i}" href="${esc(u)}" aria-label="${esc(s.label)}">${real(s.icon) ? `<img src="${esc(real(s.icon))}" alt="" class="social-png" loading="lazy">` : ''}<span class="social-label">${esc(s.label)}</span></a>`;
  }).join('');

  // footer
  const f = c.footer, ft = $('#footer');
  const fl = f.links.filter(l => real(l.url)).map(l => `<a class="${/^https?:/i.test(l.url) ? 'ext' : ''}" href="${esc(real(l.url))}">${esc(l.label)}</a>`).join('');
  const fs = f.showSocials ? c.socials.filter(s => real(s.url)).map(s => `<a class="${/^https?:/i.test(s.url) ? 'ext' : ''}" href="${esc(real(s.url))}">${esc(s.label)}</a>`).join('') : '';
  ft.hidden = !(f.text || f.desc || fl);
  ft.innerHTML = (f.desc ? `<p>${esc(f.desc)}</p>` : '') + (fl ? `<nav aria-label="Footer">${fl}</nav>` : '') + (fs && !ft.hidden ? `<nav aria-label="Social">${fs}</nav>` : '') + (f.text ? `<small>${esc(f.text)}</small>` : '');

  buildNav();
  watchReveals(opt.instant);
  if (!light && !opt.noLight && c.settings.lightDefault && !lightSet) { lightSet = true; setLight(true); }
}

/* ---- nav with animated indicator ---- */
const NAV = [['home', 'Home'], ['about', 'About'], ['skills', 'Skills'], ['works', 'Works'], ['certificates', 'Certificates'], ['experience', 'Experience'], ['education', 'Education'], ['contact', 'Contact']];
let activeId = 'home';
function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '<span class="ind"></span>' + NAV.filter(([id]) => !$('#' + id).hidden).map(([id, l]) => `<a href="#${id}" data-id="${id}">${l}</a>`).join('');
  setActive(activeId);
}
function setActive(id) {
  activeId = id;
  const nav = $('#nav'), ind = $('.ind', nav); let hit = null;
  $$('a', nav).forEach(a => { const on = a.dataset.id === id; a.classList.toggle('on', on); if (on) hit = a; });
  if (hit && ind) { ind.style.width = hit.offsetWidth + 'px'; ind.style.transform = `translateX(${hit.offsetLeft}px)`; nav.scrollTo({ left: hit.offsetLeft - nav.clientWidth / 2 + hit.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); }
  else if (ind) ind.style.width = '0';
}
function watchSpy() {
  spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-40% 0px -55% 0px' });
  $$('main > section').forEach(s => spy.observe(s));
}

/* ---- reveals ---- */
function watchReveals(instant) {
  $$('.reveal:not(.active), .rv:not(.active)').forEach(el => {
    if (instant || reduce) el.classList.add('active'); else io.observe(el);
  });
}

/* ---- bulb + secret admin ---- */
let light = false, lightSet = false, clicks = 0, clickTimer;
const statusText = $('#bulb-status-text'), sunGlow = $('#sun-glow'), bulb = $('#bulb');
function setLight(on) {
  light = on; document.body.classList.toggle('light-on', on);
  statusText.textContent = on ? 'TURN OFF THE LIGHT' : 'TURN ON THE LIGHT';
  $('#bulb-btn').setAttribute('aria-pressed', on);
  if (on) { const r = bulb.getBoundingClientRect(); sunGlow.style.background = `radial-gradient(circle at ${r.left + r.width / 2}px ${r.top + r.height / 2}px, rgba(${hex2rgb(cur ? cur.theme.brand : '#0ff')},.34) 0%, transparent 80%)`; }
  setTimeout(() => setActive(activeId), 50);
}
$('#bulb-btn').addEventListener('click', () => {
  setLight(!light); lightSet = true;
  clicks++; clearTimeout(clickTimer); clickTimer = setTimeout(() => { clicks = 0; }, 400);
  if (clicks === 5) { clicks = 0; openAdmin(); }
});
if (location.hash === '#admin') addEventListener('load', () => setTimeout(openAdmin, 600));

let adminLoading;
function openAdmin() {
  if (window.Admin) return window.Admin.open();
  if (adminLoading) return; adminLoading = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'admin.css'; document.head.append(l);
  const s = document.createElement('script'); s.src = 'admin.js';
  s.onload = () => { adminLoading = false; window.Admin && window.Admin.open(); };
  s.onerror = () => { adminLoading = false; toast('Could not load the admin module', 'err'); };
  document.body.append(s);
}

/* ---- mouse glow, parallax, tilt, back-to-top ---- */
const mouseGlow = $('#mouse-glow'), home = $('#home');
let tick = false;
addEventListener('scroll', () => {
  if (tick) return; tick = true;
  requestAnimationFrame(() => {
    tick = false;
    $('#topBtn').classList.toggle('show', scrollY > 500);
    if (!reduce) document.documentElement.style.setProperty('--py', (scrollY * -0.06) + 'px');
  });
}, { passive: true });
if (matchMedia('(hover:hover)').matches) {
  document.addEventListener('pointermove', e => {
    mouseGlow.style.opacity = e.clientY > home.getBoundingClientRect().bottom ? '1' : '0';
    mouseGlow.style.left = e.clientX + 'px'; mouseGlow.style.top = e.clientY + 'px';
    if (reduce) return;
    const t = e.target.closest && e.target.closest('.tilt');
    if (t) { const r = t.getBoundingClientRect(); t.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 6 + 'deg'); t.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - .5)) * 6 + 'deg'); }
  });
  document.addEventListener('pointerout', e => { const t = e.target.closest && e.target.closest('.tilt'); if (t && !t.contains(e.relatedTarget)) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); } });
}

/* ---- text scramble (preserved) ---- */
class TextScramble {
  constructor(el) { this.el = el; }
  setText(newText) {
    const oldText = this.el.textContent, length = Math.max(oldText.length, newText.length);
    const promise = new Promise(r => (this.resolve = r)); this.queue = [];
    for (let i = 0; i < length; i++) { const start = Math.floor(Math.random() * 40); this.queue.push({ from: oldText[i] || '', to: newText[i] || '', start, end: start + Math.floor(Math.random() * 40) }); }
    cancelAnimationFrame(this.fr); this.frame = 0; this.update(); return promise;
  }
  update() {
    let out = '', done = 0;
    for (const q of this.queue) {
      if (this.frame >= q.end) { done++; out += esc(q.to); }
      else if (this.frame >= q.start) { if (!q.char || Math.random() < .28) q.char = '!<>-_\\/[]{}—=+*^?#________'[Math.floor(Math.random() * 26)]; out += `<span style="color:var(--brand)">${esc(q.char)}</span>`; }
      else out += esc(q.from);
    }
    this.el.innerHTML = out;
    if (done === this.queue.length) this.resolve(); else { this.fr = requestAnimationFrame(() => this.update()); this.frame++; }
  }
}
let wi = 0; const sc = new TextScramble($('#scramble-text'));
const loop = () => {
  const w = cur && cur.hero.words.filter(Boolean); if (!w || !w.length) { setTimeout(loop, 1500); return; }
  if (reduce) { $('#scramble-text').textContent = w[wi % w.length]; wi++; setTimeout(loop, 2800); return; }
  sc.setText(w[wi % w.length]).then(() => { wi++; setTimeout(loop, 2800); });
};

/* ---- canvases (preserved, throttled) ---- */
const cv = $('#network-canvas'), ctx = cv.getContext('2d'), hv = $('#hacking-canvas'), hx = hv.getContext('2d');
let pts = [], hp = [], last = 0;
function initCanvas() {
  cv.width = hv.width = innerWidth; cv.height = hv.height = innerHeight;
  const n = innerWidth < 700 ? 60 : 130;
  pts = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: Math.random() * 1.5, vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2 }));
  hp = Array.from({ length: Math.floor(hv.width / 20) }, () => Math.random() * hv.height);
  hx.font = '14px monospace';
}
function draw(t) {
  requestAnimationFrame(draw);
  if (document.hidden || t - last < 33) return; last = t;
  const rgb = hex2rgb(cur ? cur.theme.brand : '#00ffff');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = `rgba(${rgb},${light ? .4 : .14})`;
  pts.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > cv.width) p.vx *= -1; if (p.y < 0 || p.y > cv.height) p.vy *= -1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
  });
  if (hv.style.display === 'none') return;
  hx.fillStyle = 'rgba(0,0,0,0.08)'; hx.fillRect(0, 0, hv.width, hv.height);
  hx.fillStyle = `rgba(${rgb},${light ? .5 : .3})`;
  hp.forEach((y, x) => { hx.fillText(Math.floor(Math.random() * 10), x * 20, y); hp[x] = y > hv.height ? 0 : y + 15; });
}
let rs; addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { initCanvas(); setActive(activeId); }, 150); });

/* ---- load ---- */
async function fetchContent() {
  try {
    const r = await fetch('/api/content', { cache: 'no-store' });
    if (r.ok) { backend = true; return await r.json(); }
  } catch { }
  backend = false;
  const r = await fetch('content.json', { cache: 'no-cache' });
  return await r.json();
}
async function reload() { const d = await fetchContent(); render(d, { instant: true, noLight: true }); return d; }

io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('active'); io.unobserve(e.target); } }), { threshold: 0.08 });

window.Site = { render, reload, normalize, toast, defaults: DEF, esc, hex2rgb, get backend() { return backend; } };

(async () => {
  initCanvas();
  try { render(await fetchContent()); }
  catch (e) { render({ personal: { name: 'Portfolio' } }); toast('Could not load content', 'err'); }
  watchSpy(); loop();
  if (reduce) draw(0); else requestAnimationFrame(draw);
  document.body.classList.add('ready');
  setTimeout(() => $('#loader').classList.add('done'), 250);
})();
})();
