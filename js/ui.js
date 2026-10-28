// Gemeinsame UI-Helfer: Formatierung, Icons, Toast, Sheets, Bestätigungsdialog.
import { escapeHtml } from './tokens.js';

export const esc = escapeHtml;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
export const fmtDay = ms => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = ms => (ms ? new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const bytes = n => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>'),
  ask: svg('<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M9.5 10a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>'),
};

export function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

/** Bottom-Sheet. Gibt { el, body, close } zurück; onClose wird einmalig aufgerufen. */
export function openSheet({ title, html = '', onClose } = {}) {
  const root = $('#sheet-root');
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || 'Dialog');
  sheet.innerHTML = `<div class="sheet-h"><span>${esc(title || '')}</span><button type="button" class="icon-btn" data-close aria-label="Schließen" style="font-size:22px">✕</button></div><div class="sheet-b">${html}</div>`;
  root.append(back, sheet);
  requestAnimationFrame(() => { back.classList.add('open'); sheet.classList.add('open'); });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.classList.remove('open'); sheet.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { back.remove(); sheet.remove(); }, 320);
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  sheet.querySelector('[data-close]').addEventListener('click', close);
  return { el: sheet, body: sheet.querySelector('.sheet-b'), close };
}

export function confirmDialog({ title, text, ok = 'OK', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const s = openSheet({
      title,
      html: `<p style="margin:4px 2px 16px;color:var(--muted)">${esc(text)}</p><button class="btn block ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button><button class="btn sec block" data-no>Abbrechen</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    s.body.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); s.close(); });
    s.body.querySelector('[data-no]').addEventListener('click', () => s.close());
  });
}

/** Hebt Suchbegriffe in schon gerendertem HTML hervor (nur Textknoten). */
export function markTextNodes(root, terms) {
  const ts = [...new Set(terms.filter(t => t.length >= 2))];
  if (!ts.length) return;
  const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      frag.append(text.slice(last, start));
      const mk = document.createElement('mark');
      mk.textContent = m[2];
      frag.append(mk);
      last = start + m[2].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* Fallback unten */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* nicht erlaubt */ }
  ta.remove();
  return ok;
}
