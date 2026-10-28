// Mini-Router mit Hash-Routen, Slide-Animationen, Scroll-Wiederherstellung und Wischen-zum-Zurückgehen.
import { $ } from './ui.js';

let routes = [], current = null, idx = 0, token = 0;
const scrolls = new Map();
const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

export const currentPath = () => location.hash.slice(1) || '/';
const saveScroll = () => { if (current) scrolls.set(idx, current.scrollTop); };

export function go(path) {
  saveScroll();
  history.pushState({ i: ++idx }, '', '#' + path);
  return show(path, 'fwd');
}
/** URL anpassen, ohne neu zu rendern (z. B. Suchbegriff merken). */
export function replaceUrl(path) { history.replaceState(history.state, '', '#' + path); }
export function back() {
  if (idx > 0) history.back();
  else { history.replaceState({ i: 0 }, '', '#/'); show('/', 'back'); }
}
export const refresh = () => show(currentPath(), '');

async function show(path, dir) {
  const mine = ++token;
  const [pathname, query = ''] = path.split('?');
  let route = null, args = [];
  for (const r of routes) {
    const m = pathname.match(r.re);
    if (m) { route = r; args = m.slice(1).map(decodeURIComponent); break; }
  }
  if (!route) { history.replaceState({ i: idx }, '', '#/'); return show('/', dir); }
  const view = document.createElement('section');
  view.className = 'view';
  try { await route.fn(view, args, new URLSearchParams(query)); }
  catch (e) {
    console.error(e);
    view.innerHTML = `<header class="bar"><button class="icon-btn" data-back aria-label="Zurück">‹</button><h1>Fehler</h1></header><div class="content"><p>Diese Ansicht konnte nicht geladen werden.</p><p style="color:var(--muted)">${String(e && e.message || e).replace(/</g, '&lt;')}</p></div>`;
  }
  if (mine !== token) return;
  const cls = dir === 'back' ? 'enter-back' : dir === 'fwd' ? 'enter-fwd' : '';
  if (cls) view.classList.add(cls);
  $('#app').append(view);
  if (current) {
    const old = current;
    if (dir) { old.classList.add(dir === 'back' ? 'leave-back' : 'leave-fwd'); setTimeout(() => old.remove(), 320); }
    else old.remove();
  }
  current = view;
  if (dir === 'back') view.scrollTop = scrolls.get(idx) || 0;
  if (view.afterMount) view.afterMount();
}

export function start(routeTable) {
  routes = routeTable;
  idx = history.state && typeof history.state.i === 'number' ? history.state.i : 0;
  if (!history.state || typeof history.state.i !== 'number') history.replaceState({ i: 0 }, '', '#' + currentPath());
  window.addEventListener('popstate', e => {
    saveScroll();
    const i = e.state && typeof e.state.i === 'number' ? e.state.i : 0;
    const dir = i < idx ? 'back' : 'fwd';
    idx = i;
    show(currentPath(), dir);
  });
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-go]');
    if (link) { e.preventDefault(); go(link.dataset.go); return; }
    if (e.target.closest('[data-back]')) { e.preventDefault(); back(); }
  });
  // Eigene Wisch-Geste nur in der installierten App (im Browser übernimmt Safari das selbst).
  let sx = 0, sy = 0, tracking = false;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    tracking = standalone() && idx > 0 && t.clientX < 26;
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 70) back();
  }, { passive: true });
  return show(currentPath(), '');
}
