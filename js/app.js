// Chat-Archiv: Ansichten (Start, Liste/Suche, Chat, Zuordnen, Frag mein Fach) und Import.
import * as store from './store.js';
import { state, findKat, findFach } from './store.js';
import { search, snippet, ask } from './search.js';
import { tokenize, highlight } from './tokens.js';
import { renderMarkdown } from './markdown.js';
import { chatsFromFiles } from './parse.js';
import * as nav from './nav.js';
import { settingsView, applyTheme } from './settings.js';
import { $, $$, esc, fmtDate, fmtDay, fmtTime, plural, debounce, ICON, toast, openSheet, markTextNodes, copyText } from './ui.js';

const enc = encodeURIComponent;
const hueOf = (kat, fach) => (fach ? findFach(kat, fach)?.hue : findKat(kat)?.hue) ?? 215;
export function folderLabel(c) {
  if (c.status !== 'ok') return 'Nicht zugeordnet';
  const k = findKat(c.kat), f = c.fach ? findFach(c.kat, c.fach) : null;
  return f ? `${k.name} › ${f.name}` : k ? k.name : 'Nicht zugeordnet';
}
const header = (title, { big = false, left = true, right = '' } = {}) =>
  `<header class="bar${big ? ' big' : ''}">${left ? `<button class="icon-btn" data-back aria-label="Zurück">${ICON.back}</button>` : ''}<h1>${esc(title)}</h1>${right}</header>`;
const iconBtn = (go, icon, label) => `<button class="icon-btn" data-go="${go}" aria-label="${label}">${icon}</button>`;

// ------------------------------------------------------------------ Start

function tile(go, icon, name, n, lastMs, hue, wide = false) {
  return `<a class="tile${n ? '' : ' empty'}${wide ? ' wide' : ''}" href="#${go}" data-go="${go}" style="--h:${hue}"><span class="ti">${esc(icon)}</span><span class="tn">${esc(name)}</span><span class="tm">${plural(n, 'Chat', 'Chats')}${lastMs ? ' · ' + fmtDate(lastMs) : ''}</span></a>`;
}

function installHint() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('hint-install') === '1'; } catch { /* Speicher gesperrt */ }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (dismissed || !ios || standalone) return '';
  return `<div class="hint-install"><span>📲</span><span>Tippe in Safari auf <b>Teilen</b> und dann auf <b>„Zum Home-Bildschirm“</b>, damit die App wie eine normale App startet.</span><button data-dismiss-install>OK</button></div>`;
}

async function homeView(view) {
  const c = store.counts(), total = state.list.length;
  let html = header('Chat-Archiv', { big: true, left: false, right: iconBtn('/suche', ICON.search, 'Suche') + iconBtn('/einstellungen', ICON.gear, 'Einstellungen') }) + '<div class="content">';
  if (!total) {
    html += `<div class="empty-state"><div class="big">🗂️</div><h2>Dein Chat-Archiv</h2><p>Importiere deinen Claude-Datenexport (ZIP oder conversations.json). Alles wird nur auf diesem Gerät gespeichert.</p><button class="btn" data-import>${ICON.upload.replace('<svg', '<svg width="22" height="22"')} Export importieren</button></div>`;
  } else {
    html += `<form class="search" data-home-search>${ICON.search}<input name="q" type="search" placeholder="In allen ${total} Chats suchen" enterkeyhint="search" autocomplete="off" autocapitalize="off" aria-label="Suche"></form>`;
    if (c.unklar) html += `<a class="banner warn" href="#/zuordnen" data-go="/zuordnen"><span class="em">🧭</span><span>${plural(c.unklar, 'Chat wartet', 'Chats warten')} auf Zuordnung<span class="sub">Kurz antippen, der Rest läuft automatisch</span></span><span class="chev">${ICON.chevron.replace('<svg', '<svg width="20" height="20"')}</span></a>`;
    html += `<a class="banner" href="#/frag" data-go="/frag"><span class="em">💡</span><span>Frag mein Fach<span class="sub">Passende Stellen aus deinen Chats finden</span></span><span class="chev">${ICON.chevron.replace('<svg', '<svg width="20" height="20"')}</span></a>`;
    const flat = [];
    for (const k of state.config.kategorien) {
      if (!k.faecher.length) { flat.push(k); continue; }
      const tiles = k.faecher.map(f => tile(`/f/${k.id}/${f.id}`, f.icon, f.name, c.fach.get(`${k.id}/${f.id}`) || 0, c.last.get(`${k.id}/${f.id}`), f.hue)).join('');
      const withFach = k.faecher.reduce((n, f) => n + (c.fach.get(`${k.id}/${f.id}`) || 0), 0);
      const ohne = (c.kat.get(k.id) || 0) - withFach;
      const extra = ohne > 0 ? tile(`/f/${k.id}/-`, '📂', 'Ohne Fach', ohne, null, k.hue) : '';
      html += `<div class="h2"><span>${esc(k.icon)} ${esc(k.name)} · ${c.kat.get(k.id) || 0}</span><a href="#/k/${enc(k.id)}" data-go="/k/${enc(k.id)}">Alle ansehen</a></div><div class="grid">${tiles}${extra}</div>`;
    }
    if (flat.length) {
      html += `<div class="h2"><span>Ordner</span></div><div class="grid">${flat.map(k => tile(`/k/${k.id}`, k.icon, k.name, c.kat.get(k.id) || 0, c.last.get(k.id), k.hue)).join('')}</div>`;
    }
    html += `<div style="margin-top:26px"><button class="btn sec block" data-import>${ICON.upload.replace('<svg', '<svg width="22" height="22"')} Weiteren Export importieren</button></div>`;
    html += installHint();
  }
  html += '</div>';
  view.innerHTML = html;
  view.querySelector('[data-home-search]')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    nav.go('/suche' + (q ? '?q=' + enc(q) : ''));
  });
  view.querySelector('[data-dismiss-install]')?.addEventListener('click', e => {
    try { localStorage.setItem('hint-install', '1'); } catch { /* egal */ }
    e.target.closest('.hint-install').remove();
  });
}

// ------------------------------------------------------------------ Liste & Suche

export function scopeOptions() {
  const out = [['', 'Alle Ordner']];
  for (const k of state.config.kategorien) {
    out.push([k.id, k.name + (k.faecher.length ? ' (alle Fächer)' : '')]);
    for (const f of k.faecher) out.push([`${k.id}/${f.id}`, `${k.name} › ${f.name}`]);
    if (k.faecher.length) out.push([`${k.id}/-`, `${k.name} › ohne Fach`]);
  }
  out.push(['_unklar', 'Nicht zugeordnet']);
  return out;
}
export function filtersFor(scope, von = '', bis = '') {
  if (scope === '_unklar') return { unklar: true, von, bis };
  const [kat, fach] = scope.split('/');
  return { kat: kat || undefined, fach, von, bis };
}
const scopeName = scope => (scopeOptions().find(o => o[0] === scope) || ['', 'Suche'])[1].replace(' (alle Fächer)', '');

async function listScreen(view, scope0, params, basePath) {
  const st = { q: params.get('q') || '', s: scope0 ?? params.get('s') ?? '', von: params.get('von') || '', bis: params.get('bis') || '', limit: 40 };
  const title = () => (st.s ? scopeName(st.s).replace(/^.* › /, '') : 'Suche');
  view.innerHTML = header(title(), { right: `<button class="icon-btn" id="askBtn" aria-label="Frag mein Fach">${ICON.ask}</button>` }) + `<div class="content">
    <label class="search">${ICON.search}<input id="q" type="search" placeholder="Titel und Volltext durchsuchen" enterkeyhint="search" autocomplete="off" autocapitalize="off" aria-label="Suche"></label>
    <div class="filters">
      <label class="field">Ordner<select id="s">${scopeOptions().map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></label>
      <label class="field">Von<input type="date" id="von"></label>
      <label class="field">Bis<input type="date" id="bis"></label>
    </div>
    <div class="meta" id="meta"></div><div class="list" id="list"></div><button class="btn sec more" id="more" hidden>Mehr anzeigen</button></div>`;
  const $q = $('#q', view), $s = $('#s', view), $von = $('#von', view), $bis = $('#bis', view);
  $q.value = st.q; $s.value = st.s; $von.value = st.von; $bis.value = st.bis;
  let req = 0;

  async function run() {
    const mine = ++req;
    const { terms, hits } = await search(st.q, filtersFor(st.s, st.von, st.bis));
    if (mine !== req) return;
    const shown = hits.slice(0, st.limit);
    const chats = terms.length ? await Promise.all(shown.map(h => store.getChat(h.id))) : [];
    if (mine !== req) return;
    $('#meta', view).textContent = terms.length ? `${plural(hits.length, 'Treffer', 'Treffer')} für „${st.q.trim()}“` : plural(hits.length, 'Chat', 'Chats');
    $('#list', view).innerHTML = shown.length ? shown.map((c, i) => {
      const sn = terms.length && chats[i] ? snippet(chats[i], terms) : null;
      const target = `/chat/${enc(c.id)}` + (terms.length ? `?q=${enc(st.q.trim())}${sn ? '&m=' + sn.msg : ''}` : '');
      return `<a class="row" href="#${target}" data-go="${target}"><div class="row-t">${highlight(c.titel, terms)}</div>
        <div class="row-m"><span class="dot" style="--h:${hueOf(c.kat, c.fach)}"></span><span>${esc(folderLabel(c))}</span><span>· ${fmtDate(c.created)}</span><span>· ${plural(c.n, 'Nachr.', 'Nachr.')}</span></div>
        ${sn ? `<div class="row-s">${sn.html}</div>` : c.preview ? `<div class="row-s">${esc(c.preview)}</div>` : ''}</a>`;
    }).join('') : `<div class="empty-state" style="padding-top:28px"><div class="big">🔎</div><p>Keine Chats gefunden.</p></div>`;
    $('#more', view).hidden = hits.length <= st.limit;
    $('.bar h1', view).textContent = title();
    const qs = new URLSearchParams();
    if (st.q) qs.set('q', st.q);
    if (basePath === '/suche' && st.s) qs.set('s', st.s);
    if (st.von) qs.set('von', st.von);
    if (st.bis) qs.set('bis', st.bis);
    nav.replaceUrl(basePath + (qs.toString() ? '?' + qs : ''));
  }
  const runSoon = debounce(run, 180);
  $q.addEventListener('input', () => { st.q = $q.value; st.limit = 40; runSoon(); });
  $q.addEventListener('keydown', e => { if (e.key === 'Enter') $q.blur(); });
  $s.addEventListener('change', () => { st.s = $s.value; st.limit = 40; run(); });
  $von.addEventListener('change', () => { st.von = $von.value; st.limit = 40; run(); });
  $bis.addEventListener('change', () => { st.bis = $bis.value; st.limit = 40; run(); });
  $('#more', view).addEventListener('click', () => { st.limit += 40; run(); });
  $('#askBtn', view).addEventListener('click', () => nav.go('/frag' + (st.s && st.s !== '_unklar' ? '?s=' + enc(st.s) : '')));
  await run();
}

// ------------------------------------------------------------------ Chat

function openMoveSheet(id, onDone) {
  const entry = state.byId.get(id);
  const row = (k, f, label, icon, sub) => {
    const cur = entry.status === 'ok' && entry.kat === k && (entry.fach || null) === (f || null);
    return `<button class="pick${sub ? ' sub' : ''}" data-kat="${esc(k)}" data-fach="${esc(f || '')}" aria-current="${cur}"><span class="ic">${esc(icon)}</span><span>${esc(label)}</span>${cur ? '<span style="margin-left:auto">✓</span>' : ''}</button>`;
  };
  let html = '';
  for (const k of state.config.kategorien) {
    html += row(k.id, '', k.faecher.length ? `${k.name} (ohne Fach)` : k.name, k.icon, false);
    for (const f of k.faecher) html += row(k.id, f.id, f.name, f.icon, true);
  }
  const s = openSheet({ title: 'Verschieben nach', html });
  s.body.addEventListener('click', async e => {
    const b = e.target.closest('.pick');
    if (!b) return;
    await store.assign(id, b.dataset.kat, b.dataset.fach || null);
    s.close();
    toast('Verschoben nach ' + store.targetName(b.dataset.kat, b.dataset.fach || null) + ' – gemerkt');
    if (onDone) onDone();
  });
}

async function chatView(view, [id], params) {
  const chat = await store.getChat(id), entry = state.byId.get(id);
  if (!chat || !entry) {
    view.innerHTML = header('Chat') + '<div class="content"><div class="empty-state"><div class="big">🫥</div><h2>Chat nicht gefunden</h2></div></div>';
    return;
  }
  const terms = tokenize(params.get('q') || '');
  let lastDay = '';
  const bubbles = chat.msgs.map((m, i) => {
    const day = m.t ? new Date(m.t).toDateString() : '';
    const chip = day && day !== lastDay ? `<div class="day">${esc(fmtDay(m.t))}</div>` : '';
    if (day) lastDay = day;
    const files = m.f && m.f.length ? `<div class="attach">📎 ${esc(m.f.join(', '))}</div>` : '';
    return `${chip}<article class="msg ${m.r === 'h' ? 'me' : 'ai'}" id="m-${i}"><div class="bubble">${m.x ? renderMarkdown(m.x) : ''}${files}<time>${esc(fmtTime(m.t))}</time></div></article>`;
  }).join('');
  view.innerHTML = header('Chat', { right: `<button class="icon-btn" id="moreBtn" aria-label="Aktionen">${ICON.more}</button>` }) +
    `<div class="chat-head"><div class="t">${esc(chat.titel)}</div><div class="chips"><button class="chip" id="folderChip"><span class="dot" style="--h:${hueOf(entry.kat, entry.fach)}"></span>${esc(folderLabel(entry))} ▾</button><span class="chip">${esc(fmtDate(chat.created))}</span><span class="chip">${plural(chat.msgs.length, 'Nachricht', 'Nachrichten')}</span></div></div>
     <div class="thread">${bubbles}</div>`;
  markTextNodes($('.thread', view), terms);
  const rerender = () => nav.refresh();
  $('#folderChip', view).addEventListener('click', () => openMoveSheet(id, rerender));
  $('#moreBtn', view).addEventListener('click', () => {
    const s = openSheet({ title: 'Aktionen', html: '<button class="btn sec block" data-a="move">Verschieben …</button><button class="btn sec block" data-a="copy">Chat als Text kopieren</button>' });
    s.body.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      s.close();
      if (a === 'move') openMoveSheet(id, rerender);
      if (a === 'copy') {
        const text = `${chat.titel}\n\n` + chat.msgs.map(m => `${m.r === 'h' ? 'Ich' : 'Claude'}:\n${m.x}`).join('\n\n');
        toast((await copyText(text)) ? 'Kopiert' : 'Kopieren nicht möglich');
      }
    });
  });
  const m = params.get('m');
  view.afterMount = () => {
    const el = m !== null ? view.querySelector('#m-' + Number(m)) : null;
    if (el) { view.scrollTop = Math.max(0, el.offsetTop - 80); el.classList.add('flash'); }
  };
}

// ------------------------------------------------------------------ Zuordnen

async function assignView(view) {
  const open = state.list.filter(c => c.status !== 'ok').sort((a, b) => b.created - a.created);
  const quick = ['privat', 'sonstiges'].map(findKat).filter(Boolean);
  const card = c => {
    const cands = (c.cand || []).filter(x => x.score > 0).slice(0, 2);
    const names = new Set();
    const opts = [];
    const add = (k, f, label, hot) => { const key = k + '/' + (f || ''); if (names.has(key)) return; names.add(key); opts.push(`<button class="opt${hot ? ' hot' : ''}" data-id="${esc(c.id)}" data-kat="${esc(k)}" data-fach="${esc(f || '')}">${esc(label)}</button>`); };
    for (const x of cands) add(x.kat, x.fach, store.targetName(x.kat, x.fach), true);
    for (const k of quick) add(k.id, '', k.name, false);
    return `<article class="assign" data-card="${esc(c.id)}"><a class="row-t" href="#/chat/${enc(c.id)}" data-go="/chat/${enc(c.id)}">${esc(c.titel)}</a>
      <div class="row-m"><span>${fmtDate(c.created)}</span><span>· ${plural(c.n, 'Nachr.', 'Nachr.')}</span></div>
      <div class="row-s">${esc(c.preview || '')}</div><div class="opts">${opts.join('')}<button class="opt" data-more="${esc(c.id)}">Weitere …</button></div></article>`;
  };
  view.innerHTML = header('Zuordnen') + `<div class="content"><div class="meta" id="cnt"></div><div class="list" id="cards">${open.map(card).join('')}</div>
    <div class="empty-state" id="done" ${open.length ? 'hidden' : ''}><div class="big">✅</div><h2>Alles zugeordnet</h2><p>Deine Auswahl wird gemerkt und bei neuen Chats berücksichtigt.</p><button class="btn" data-back>Zurück</button></div></div>`;
  const count = () => { const n = $$('[data-card]', view).filter(e => !e.classList.contains('gone')).length; $('#cnt', view).textContent = n ? `${plural(n, 'Chat wartet', 'Chats warten')} – tippe das passende Ziel` : ''; if (!n) $('#done', view).hidden = false; };
  count();
  view.addEventListener('click', async e => {
    const more = e.target.closest('[data-more]');
    if (more) { openMoveSheet(more.dataset.more, () => { view.querySelector(`[data-card="${more.dataset.more}"]`)?.classList.add('gone'); count(); }); return; }
    const b = e.target.closest('.opt[data-id]');
    if (!b) return;
    await store.assign(b.dataset.id, b.dataset.kat, b.dataset.fach || null);
    toast('→ ' + store.targetName(b.dataset.kat, b.dataset.fach || null));
    const el = b.closest('[data-card]');
    el.classList.add('gone');
    setTimeout(() => { el.remove(); count(); }, 300);
    count();
  });
}

// ------------------------------------------------------------------ Frag mein Fach

async function askView(view, args, params) {
  let scope = params.get('s') || '';
  let q = params.get('q') || '';
  view.innerHTML = header('Frag mein Fach') + `<div class="content">
    <p class="note" style="margin:4px 4px 10px">Zeigt die passendsten Stellen aus deinen Chats mit Verweis auf den Chat. Läuft nur auf diesem Gerät, ohne KI-Dienst.</p>
    <label class="field">Fach / Ordner<select id="s">${scopeOptions().filter(o => o[0] !== '_unklar').map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></label>
    <form class="asked" id="f"><label class="search">${ICON.search}<input id="q" type="search" placeholder="z. B. Was ist eine Synapse?" enterkeyhint="search" autocomplete="off" aria-label="Frage"></label><button class="btn" type="submit">Suchen</button></form>
    <div class="list" id="res" style="margin-top:14px"></div></div>`;
  $('#s', view).value = scope; $('#q', view).value = q;
  let req = 0;
  async function run() {
    const question = $('#q', view).value.trim();
    scope = $('#s', view).value;
    const box = $('#res', view);
    if (!question) { box.innerHTML = ''; return; }
    const mine = ++req;
    box.innerHTML = '<div class="meta">Suche …</div>';
    const { words, results } = await ask(question, filtersFor(scope));
    if (mine !== req) return;
    nav.replaceUrl('/frag?' + new URLSearchParams({ s: scope, q: question }));
    if (!results.length) { box.innerHTML = `<div class="empty-state" style="padding-top:24px"><div class="big">🤷</div><p>Dazu habe ich in ${esc(scopeName(scope).replace(/^Alle Ordner$/, 'allen Chats'))} nichts gefunden. Versuche andere Wörter.</p></div>`; return; }
    box.innerHTML = `<div class="meta">${plural(results.length, 'passende Stelle', 'passende Stellen')}</div>` + results.map(r => {
      const target = `/chat/${enc(r.id)}?m=${r.msg}&q=${enc(words.join(' '))}`;
      return `<a class="hit" href="#${target}" data-go="${target}"><div class="txt">${r.html}</div>
        <div class="src"><span class="dot" style="--h:${hueOf(r.kat, r.fach)}"></span>${esc(r.titel)} · ${fmtDate(r.created)} · ${r.role === 'a' ? 'Claude' : 'Ich'} ›</div></a>`;
    }).join('');
  }
  $('#f', view).addEventListener('submit', e => { e.preventDefault(); $('#q', view).blur(); run(); });
  $('#s', view).addEventListener('change', run);
  if (q) await run();
}

// ------------------------------------------------------------------ Import

export function importFlow() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.zip,.json,application/zip,application/json,application/x-zip-compressed';
  input.style.display = 'none';
  document.body.append(input);
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.remove();
    if (files.length) await runImport(files);
  });
  input.click();
}

async function runImport(files) {
  const s = openSheet({ title: 'Import', html: '<p id="imp-t">Lese Datei …</p><div class="progress"><i id="imp-p"></i></div>' });
  const text = t => { const el = $('#imp-t', s.el); if (el) el.textContent = t; };
  const prog = (i, n) => { const el = $('#imp-p', s.el); if (el) el.style.width = (n ? Math.round(100 * i / n) : 100) + '%'; };
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (!window.fflate) throw new Error('ZIP-Bibliothek nicht geladen. App neu starten.');
    const chats = await chatsFromFiles(files, window.fflate, { bytes: async f => new Uint8Array(await f.arrayBuffer()), name: f => f.name });
    if (!chats.length) throw new Error('Die Datei enthält keine Chats.');
    text(`${plural(chats.length, 'Chat', 'Chats')} gefunden. Sortiere und indexiere …`);
    const sum = await store.importChats(chats, (i, n) => { text(`Sortiere und indexiere … ${i} / ${n}`); prog(i, n); });
    prog(1, 1);
    s.body.innerHTML = `<p style="margin:2px 0 14px;font-size:17px"><b>${sum.neu} neu</b>, ${sum.geaendert} aktualisiert, ${sum.unveraendert} unverändert.</p>
      ${sum.unklar ? `<p style="color:var(--muted)">${plural(sum.unklar, 'Chat ist', 'Chats sind')} noch unklar. Du kannst sie jetzt kurz zuordnen.</p><button class="btn block" data-z>Jetzt zuordnen</button>` : ''}
      <button class="btn sec block" data-done>Fertig</button>`;
    s.body.querySelector('[data-z]')?.addEventListener('click', () => { s.close(); nav.go('/zuordnen'); });
    s.body.querySelector('[data-done]').addEventListener('click', s.close);
    nav.refresh();
  } catch (e) {
    console.error(e);
    s.body.innerHTML = `<p style="color:var(--danger)">${esc(e.message || String(e))}</p><button class="btn sec block" data-done>Schließen</button>`;
    s.body.querySelector('[data-done]').addEventListener('click', s.close);
  }
}

// ------------------------------------------------------------------ Start der App

const routes = [
  { re: /^\/$/, fn: homeView },
  { re: /^\/suche$/, fn: (v, a, p) => listScreen(v, null, p, '/suche') },
  { re: /^\/k\/([^/]+)$/, fn: (v, [k], p) => listScreen(v, k, p, '/k/' + enc(k)) },
  { re: /^\/f\/([^/]+)\/([^/]+)$/, fn: (v, [k, f], p) => listScreen(v, `${k}/${f}`, p, `/f/${enc(k)}/${enc(f)}`) },
  { re: /^\/chat\/(.+)$/, fn: chatView },
  { re: /^\/zuordnen$/, fn: assignView },
  { re: /^\/frag$/, fn: askView },
  { re: /^\/einstellungen$/, fn: settingsView },
];

function registerGlobalHandlers() {
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-import]')) { e.preventDefault(); importFlow(); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const code = copy.closest('.code').querySelector('code').textContent;
      toast((await copyText(code)) ? 'Code kopiert' : 'Kopieren nicht möglich');
    }
  });
}

async function boot() {
  await store.init();
  applyTheme();
  registerGlobalHandlers();
  await nav.start(routes);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
  }
}
boot().catch(err => {
  console.error(err);
  $('#app').innerHTML = `<div class="view"><div class="content"><div class="empty-state"><div class="big">⚠️</div><h2>Start fehlgeschlagen</h2><p>${esc(err.message || String(err))}</p><p>Möglicherweise blockiert der private Modus von Safari den Speicher.</p></div></div></div>`;
});
