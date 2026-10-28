// Einstellungen: Darstellung, Kategorien/Fächer/Stichwörter bearbeiten, Einordnung, Backup, Speicher.
import * as store from './store.js';
import { state } from './store.js';
import * as nav from './nav.js';
import { $, $$, esc, plural, bytes, ICON, toast, openSheet, confirmDialog } from './ui.js';
import { DEFAULT_CONFIG } from './defaults.js';

const clone = o => JSON.parse(JSON.stringify(o));

export function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  for (const m of $$('meta[name="theme-color"]')) {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = t === 'dark' ? '#0C0F14' : t === 'light' ? '#F3F4F8' : m.dataset.orig;
  }
}

const kwList = text => [...new Set(String(text).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean))];
const slug = name => (name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'neu');
function uniqueId(name, taken) {
  let id = slug(name);
  while (taken.includes(id)) id = slug(name) + '-' + Math.random().toString(36).slice(2, 5);
  return id;
}

// ---------------------------------------------------------------- Editoren

function formHtml(o) {
  return `<label class="field"><span>Name</span><input type="text" id="e-name" value="${esc(o.name)}" autocomplete="off"></label>
    <div style="display:flex;gap:10px;margin-top:10px">
      <label class="field" style="flex:0 0 96px"><span>Symbol</span><input type="text" id="e-icon" value="${esc(o.icon)}" maxlength="4" style="text-align:center;font-size:22px"></label>
      <label class="field" style="flex:1"><span>Farbe</span><div style="display:flex;align-items:center;gap:10px;min-height:44px"><span class="swatch" id="e-sw" style="--h:${o.hue}"></span><input type="range" id="e-hue" min="0" max="360" value="${o.hue}"></div></label>
    </div>
    <label class="field" style="margin-top:10px"><span>Stichwörter (Komma oder Zeilenumbruch)</span><textarea id="e-kw" autocapitalize="off" spellcheck="false">${esc((o.keywords || []).join(', '))}</textarea></label>
    <p class="note" style="margin:6px 2px 12px">„Mathe“ findet auch „Mathematik“. Mit „=“ davor nur das ganze Wort, z. B. „=Deutsch“ (findet nicht „Deutschland“).</p>`;
}
function readForm(root) {
  return { name: $('#e-name', root).value.trim(), icon: $('#e-icon', root).value.trim() || '📁', hue: Number($('#e-hue', root).value), keywords: kwList($('#e-kw', root).value) };
}
function bindHue(root) { $('#e-hue', root).addEventListener('input', e => $('#e-sw', root).style.setProperty('--h', e.target.value)); }
const chatCount = (kat, fach) => state.list.filter(c => c.status === 'ok' && c.kat === kat && (!fach || c.fach === fach)).length;

export function openKatEditor(katId) {
  const cfg = clone(state.config);
  const isNew = !katId;
  const kat = isNew ? { id: '', name: '', icon: '📁', hue: Math.floor(Math.random() * 360), keywords: [], faecher: [] } : cfg.kategorien.find(k => k.id === katId);
  const fachRows = isNew ? '' : `<div class="h2" style="margin-top:8px"><span>Fächer</span></div>` + kat.faecher.map(f => `<div class="fach-line"><span class="swatch" style="--h:${f.hue}"></span><span class="n">${esc(f.icon)} ${esc(f.name)}</span><span class="c">${chatCount(kat.id, f.id)}</span><button class="btn sec" style="min-height:38px;padding:0 14px" data-fach="${esc(f.id)}">Ändern</button></div>`).join('') +
    `<button class="btn sec block" style="margin-top:10px" data-fach="__new">+ Fach hinzufügen</button>`;
  const s = openSheet({ title: isNew ? 'Neue Kategorie' : kat.name, html: formHtml(kat) + fachRows + `<button class="btn block" style="margin-top:16px" data-save>Speichern</button>${isNew ? '' : '<button class="btn danger block" data-del>Kategorie löschen</button>'}` });
  bindHue(s.el);
  const persist = async () => {
    const v = readForm(s.el);
    if (!v.name) { toast('Bitte einen Namen eingeben'); return false; }
    Object.assign(kat, v);
    if (isNew) { kat.id = uniqueId(v.name, cfg.kategorien.map(k => k.id)); cfg.kategorien.push(kat); }
    await store.saveConfig(cfg);
    return true;
  };
  s.body.addEventListener('click', async e => {
    if (e.target.closest('[data-save]')) { if (await persist()) { s.close(); toast('Gespeichert'); nav.refresh(); } return; }
    const f = e.target.closest('[data-fach]');
    if (f) { if (await persist()) { s.close(); openFachEditor(kat.id, f.dataset.fach === '__new' ? null : f.dataset.fach); } return; }
    if (e.target.closest('[data-del]')) {
      const n = chatCount(kat.id);
      if (await confirmDialog({ title: `„${kat.name}“ löschen?`, text: n ? `${plural(n, 'Chat wird', 'Chats werden')} danach neu eingeordnet (die Chats selbst bleiben erhalten).` : 'Die Kategorie wird entfernt.', ok: 'Löschen', danger: true })) {
        cfg.kategorien = cfg.kategorien.filter(k => k.id !== kat.id);
        await store.saveConfig(cfg);
        s.close(); toast('Gelöscht'); nav.refresh();
      }
    }
  });
}

export function openFachEditor(katId, fachId) {
  const cfg = clone(state.config);
  const kat = cfg.kategorien.find(k => k.id === katId);
  const isNew = !fachId;
  const fach = isNew ? { id: '', name: '', icon: '📘', hue: Math.floor(Math.random() * 360), keywords: [] } : kat.faecher.find(f => f.id === fachId);
  const s = openSheet({ title: isNew ? `Neues Fach in ${kat.name}` : fach.name, html: formHtml(fach) + `<button class="btn block" data-save>Speichern</button>${isNew ? '' : '<button class="btn danger block" data-del>Fach löschen</button>'}`, onClose: () => back() });
  let reopened = false;
  const back = () => { if (!reopened) { reopened = true; setTimeout(() => openKatEditor(katId), 330); } };
  bindHue(s.el);
  s.body.addEventListener('click', async e => {
    if (e.target.closest('[data-save]')) {
      const v = readForm(s.el);
      if (!v.name) { toast('Bitte einen Namen eingeben'); return; }
      Object.assign(fach, v);
      if (isNew) { fach.id = uniqueId(v.name, kat.faecher.map(f => f.id)); kat.faecher.push(fach); }
      await store.saveConfig(cfg);
      toast('Gespeichert'); s.close(); nav.refresh();
    } else if (e.target.closest('[data-del]')) {
      const n = chatCount(katId, fach.id);
      if (await confirmDialog({ title: `„${fach.name}“ löschen?`, text: n ? `${plural(n, 'Chat wird', 'Chats werden')} danach neu eingeordnet.` : 'Das Fach wird entfernt.', ok: 'Löschen', danger: true })) {
        kat.faecher = kat.faecher.filter(f => f.id !== fach.id);
        await store.saveConfig(cfg);
        toast('Gelöscht'); s.close(); nav.refresh();
      }
    }
  });
}

// ---------------------------------------------------------------- Backup

async function gzip(u8) {
  return new Promise(resolve => {
    try { window.fflate.gzip(u8, { level: 6 }, (err, out) => resolve(err ? window.fflate.gzipSync(u8) : out)); }
    catch { resolve(window.fflate.gzipSync(u8)); }
  });
}

export async function exportBackup() {
  toast('Backup wird erstellt …', 6000);
  const backup = await store.exportBackup();
  const data = await gzip(new TextEncoder().encode(JSON.stringify(backup)));
  const name = `chat-archiv-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
  const file = new File([data], name, { type: 'application/gzip' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); toast('Backup bereit'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }       // sonst Download als Rückfall
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup gespeichert: ' + name);
}

export function importBackupFlow() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gz,.json,application/gzip,application/json,application/x-gzip';
  input.style.display = 'none';
  document.body.append(input);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    let backup;
    try {
      let u8 = new Uint8Array(await file.arrayBuffer());
      if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = window.fflate.gunzipSync(u8);
      backup = JSON.parse(new TextDecoder().decode(u8));
      if (backup.format !== 'claude-chat-archiv-backup') throw new Error('Das ist keine Backup-Datei dieser App.');
    } catch (e) { toast(e.message && e.message.startsWith('Das ist') ? e.message : 'Datei konnte nicht gelesen werden'); return; }
    const ok = await confirmDialog({ title: 'Backup einspielen?', text: `Das Backup enthält ${plural(backup.chats.length, 'Chat', 'Chats')}. Alle jetzt gespeicherten Daten werden dadurch ersetzt.`, ok: 'Ersetzen', danger: true });
    if (!ok) return;
    const s = openSheet({ title: 'Backup einspielen', html: '<p id="bk-t">Stelle wieder her …</p><div class="progress"><i id="bk-p"></i></div>' });
    try {
      await store.importBackup(backup, (i, n) => { $('#bk-t', s.el).textContent = `Stelle wieder her … ${i} / ${n}`; $('#bk-p', s.el).style.width = Math.round(100 * i / n) + '%'; });
      applyTheme();
      s.close(); toast('Backup eingespielt'); nav.refresh();
    } catch (e) { s.body.innerHTML = `<p style="color:var(--danger)">${esc(e.message)}</p>`; }
  });
  input.click();
}

// ---------------------------------------------------------------- Ansicht

async function storageInfo() {
  const out = { usage: null, quota: null, persisted: null };
  try { if (navigator.storage?.estimate) Object.assign(out, await navigator.storage.estimate()); } catch { /* nicht verfügbar */ }
  try { if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted(); } catch { /* nicht verfügbar */ }
  return out;
}

export async function settingsView(view) {
  const cfg = state.config, info = await storageInfo();
  const theme = state.settings.theme;
  const decisions = state.decisions.size;
  const persisted = info.persisted === true ? 'Ja' : info.persisted === false ? 'Nein' : 'unbekannt';
  view.innerHTML = `<header class="bar"><button class="icon-btn" data-back aria-label="Zurück">${ICON.back}</button><h1>Einstellungen</h1></header><div class="content">
    <div class="h2" style="margin-top:12px">Darstellung</div>
    <div class="group"><div class="seg" role="group" aria-label="Darstellung">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, n]) => `<button data-set-theme="${v}" aria-pressed="${theme === v}">${n}</button>`).join('')}</div></div>

    <div class="h2">Ordner und Fächer</div>
    <div class="group">${cfg.kategorien.map(k => `<button class="setting" data-kat="${esc(k.id)}"><span style="font-size:24px">${esc(k.icon)}</span><span class="l">${esc(k.name)}<span class="s">${k.faecher.length ? plural(k.faecher.length, 'Fach', 'Fächer') + ' · ' : ''}${plural(k.keywords.length + k.faecher.reduce((n, f) => n + f.keywords.length, 0), 'Stichwort', 'Stichwörter')}</span></span><span class="v">${chatCount(k.id)}</span><span style="color:var(--muted)">›</span></button>`).join('')}</div>
    <div style="margin-top:10px"><button class="btn sec block" data-addkat>+ Neue Kategorie</button></div>

    <div class="h2">Einordnung</div>
    <div class="group" style="padding:14px 16px"><div style="display:flex;gap:10px">
      <label class="field"><span>Mindestpunkte</span><input type="number" id="min" step="0.5" min="0.5" value="${cfg.einstellungen.mindestpunkte}"></label>
      <label class="field"><span>Abstand zur Zweiten (×)</span><input type="number" id="abs" step="0.1" min="1" value="${cfg.einstellungen.abstandsfaktor}"></label></div>
      <p class="note" style="margin:8px 0 0">Höhere Werte: mehr Chats landen unter „Zuordnen“. Titel-Treffer zählen 3, deine Nachrichten 1, Claudes Antworten 0,5 Punkte.</p></div>
    <div class="group" style="margin-top:10px">
      <button class="setting" data-reclass><span class="l">Chats neu einordnen<span class="s">Nur automatisch einsortierte, manuelle Zuordnungen bleiben</span></span><span style="color:var(--muted)">›</span></button>
      <button class="setting" data-unlearn><span class="l">Gelerntes zurücksetzen<span class="s">${plural(decisions, 'gemerkte Entscheidung', 'gemerkte Entscheidungen')}</span></span><span style="color:var(--muted)">›</span></button></div>

    <div class="h2">Backup</div>
    <div class="group"><button class="setting" data-backup-out><span class="l">Backup exportieren<span class="s">Als Datei sichern (z. B. in „Dateien“), schützt vor Safari-Speicherbereinigung</span></span><span style="color:var(--muted)">›</span></button>
      <button class="setting" data-backup-in><span class="l">Backup importieren<span class="s">Ersetzt alle Daten auf diesem Gerät</span></span><span style="color:var(--muted)">›</span></button></div>

    <div class="h2">Speicher</div>
    <div class="group"><div class="setting"><span class="l">Belegt</span><span class="v">${info.usage != null ? bytes(info.usage) : '–'}${info.quota ? ' von ' + bytes(info.quota) : ''}</span></div>
      <div class="setting"><span class="l">Dauerhaft gesichert<span class="s">Verhindert, dass Safari die Daten automatisch löscht</span></span><span class="v" id="persist-v">${persisted}</span></div>
      ${info.persisted ? '' : '<button class="setting" data-persist><span class="l">Dauerhaften Speicher anfordern</span><span style="color:var(--muted)">›</span></button>'}</div>
    <p class="note">Safari kann gespeicherte Daten von Webseiten löschen, wenn sie lange nicht genutzt werden. Auf dem Home-Bildschirm installiert ist das deutlich seltener. Ein Backup bleibt die sichere Lösung.</p>

    <div class="h2">Daten</div>
    <div class="group"><button class="setting danger" data-wipe><span class="l">Alle Daten auf diesem Gerät löschen</span></button></div>
    <p class="note" style="margin-top:14px">Datenschutz: Diese App sendet keine Daten ins Internet. Es gibt keine Analytics und keine externen Schriften oder Skripte. Nach dem ersten Laden läuft sie komplett offline. ${plural(state.list.length, 'Chat', 'Chats')} gespeichert.</p></div>`;

  view.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.setTheme) { await store.saveSettings({ theme: t.dataset.setTheme }); applyTheme(); $$('[data-set-theme]', view).forEach(b => b.setAttribute('aria-pressed', String(b === t))); }
    else if (t.dataset.kat) openKatEditor(t.dataset.kat);
    else if ('addkat' in t.dataset) openKatEditor(null);
    else if ('reclass' in t.dataset) {
      const s = openSheet({ title: 'Neu einordnen', html: '<p id="rc-t">Ordne Chats ein …</p><div class="progress"><i id="rc-p"></i></div>' });
      const r = await store.reclassifyAuto((i, n) => { $('#rc-p', s.el).style.width = Math.round(100 * i / Math.max(1, n)) + '%'; });
      s.body.innerHTML = `<p>${plural(r.geprueft, 'Chat', 'Chats')} geprüft, bei <b>${r.geaendert}</b> hat sich die Zuordnung geändert.</p><button class="btn block" data-close2>Fertig</button>`;
      s.body.querySelector('[data-close2]').addEventListener('click', () => { s.close(); nav.refresh(); });
    } else if ('unlearn' in t.dataset) {
      if (await confirmDialog({ title: 'Gelerntes zurücksetzen?', text: 'Die gemerkten Entscheidungen werden vergessen. Chats bleiben, wo sie sind.', ok: 'Zurücksetzen', danger: true })) {
        const db = await import('./db.js');
        await db.clear(['learn', 'decisions']);
        state.learned.clear(); state.decisions.clear();
        toast('Zurückgesetzt'); nav.refresh();
      }
    } else if ('backupOut' in t.dataset) exportBackup();
    else if ('backupIn' in t.dataset) importBackupFlow();
    else if ('persist' in t.dataset) {
      const ok = navigator.storage?.persist ? await navigator.storage.persist() : false;
      toast(ok ? 'Dauerhafter Speicher aktiv' : 'Safari hat das abgelehnt (zum Home-Bildschirm hinzufügen hilft)');
      nav.refresh();
    } else if ('wipe' in t.dataset) {
      if (await confirmDialog({ title: 'Alles löschen?', text: 'Alle Chats, Zuordnungen und Einstellungen auf diesem Gerät werden gelöscht. Das lässt sich nicht rückgängig machen. Exportiere vorher ein Backup, falls du die Daten behalten willst.', ok: 'Alles löschen', danger: true })) {
        await store.wipeAll(); applyTheme(); toast('Alle Daten gelöscht'); nav.go('/');
      }
    }
  });
  const saveEinst = async () => {
    const cfg2 = clone(state.config);
    cfg2.einstellungen.mindestpunkte = Math.max(0.5, Number($('#min', view).value) || DEFAULT_CONFIG.einstellungen.mindestpunkte);
    cfg2.einstellungen.abstandsfaktor = Math.max(1, Number($('#abs', view).value) || DEFAULT_CONFIG.einstellungen.abstandsfaktor);
    await store.saveConfig(cfg2);
    toast('Gespeichert');
  };
  $('#min', view).addEventListener('change', saveEinst);
  $('#abs', view).addEventListener('change', saveEinst);
}
