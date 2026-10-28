// Datenschicht: Chats, Zuordnung, Index, Konfiguration, Lernen, Backup.
import * as db from './db.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { compile, classify, learnTokens, learnAdd, targetKey } from './classify.js';
import { uniqueTokens } from './tokens.js';

export const state = { config: null, compiled: null, list: [], byId: new Map(), learned: new Map(), settings: { theme: 'auto' }, decisions: new Map() };
const tick = () => new Promise(r => setTimeout(r, 0));

export async function init() {
  const [cfg, settings, list, learn, decisions] = await Promise.all([
    db.get('kv', 'config'), db.get('kv', 'settings'), db.getAll('list'), db.getAll('learn'), db.getAll('decisions'),
  ]);
  state.config = cfg ? cfg.value : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  state.settings = Object.assign({ theme: 'auto' }, settings ? settings.value : {});
  state.learned = new Map(learn.map(r => [r.tok, r.counts]));
  state.decisions = new Map(decisions.map(d => [d.id, d]));
  setList(list);
  recompile();
}

function setList(list) {
  state.list = list;
  state.byId = new Map(list.map(c => [c.id, c]));
}
function recompile() { state.compiled = compile(state.config); }

export const saveSettings = async patch => { Object.assign(state.settings, patch); await db.put('kv', { key: 'settings', value: state.settings }); };

// ---------------------------------------------------------------- Konfiguration

export const findKat = id => state.config.kategorien.find(k => k.id === id) || null;
export const findFach = (katId, fachId) => (findKat(katId)?.faecher || []).find(f => f.id === fachId) || null;
export function targetName(kat, fach) {
  const k = findKat(kat);
  if (!k) return 'Nicht zugeordnet';
  const f = fach ? findFach(kat, fach) : null;
  return f ? f.name : k.name;
}

export async function saveConfig(cfg) {
  state.config = cfg;
  await db.put('kv', { key: 'config', value: cfg });
  recompile();
  await fixOrphans();
}

/** Chats, deren Kategorie/Fach nicht mehr existiert, werden neu eingeordnet. */
async function fixOrphans() {
  const broken = state.list.filter(c => c.status === 'ok' && (!findKat(c.kat) || (c.fach && !findFach(c.kat, c.fach))));
  if (!broken.length) return;
  const records = await Promise.all(broken.map(c => db.get('chats', c.id)));
  broken.forEach((c, i) => { applyClassification(c, classify(records[i], state.compiled, state.learned)); c.manual = false; });
  await db.putMany('list', broken);
}

function applyClassification(entry, r) {
  if (r.status === 'ok') { entry.kat = r.kat; entry.fach = r.fach; entry.status = 'ok'; entry.cand = []; }
  else { entry.kat = null; entry.fach = null; entry.status = 'unklar'; entry.cand = r.candidates; }
}

// ---------------------------------------------------------------- Import

function previewOf(chat) {
  const first = chat.msgs.find(m => m.r === 'h' && m.x) || chat.msgs.find(m => m.x);
  if (first) return first.x.replace(/\s+/g, ' ').slice(0, 140);
  const f = chat.msgs.find(m => m.f && m.f.length);
  return f ? '📎 ' + f.f.join(', ') : '';
}
const textOf = chat => chat.titel + '\n' + chat.msgs.map(m => m.x).join('\n');

/** Ergänzt neue und aktualisiert geänderte Chats. Zuordnungen manuell verschobener Chats bleiben erhalten. */
export async function importChats(chats, onProgress = () => {}) {
  const sum = { neu: 0, geaendert: 0, unveraendert: 0, unklar: 0, gesamt: chats.length };
  const todo = [];
  for (const c of chats) {
    const old = state.byId.get(c.id);
    if (!old) todo.push({ c, old: null });
    else if (old.updated !== c.updated || old.n !== c.msgs.length) todo.push({ c, old });
    else sum.unveraendert++;
  }
  const CHUNK = 40;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const slice = todo.slice(i, i + CHUNK);
    const add = new Map(), remove = new Map();
    const lists = [], recs = [];
    const oldRecs = await Promise.all(slice.map(({ old }) => old ? db.get('chats', old.id) : null));
    slice.forEach(({ c, old }, k) => {
      let entry;
      if (old) {
        entry = { ...old };
        if (oldRecs[k]) for (const t of uniqueTokens(textOf(oldRecs[k]))) (remove.get(t) || remove.set(t, new Set()).get(t)).add(c.id);
        if (entry.status !== 'ok') applyClassification(entry, classify(c, state.compiled, state.learned));
        sum.geaendert++;
      } else {
        entry = { id: c.id, manual: false };
        const decided = state.decisions.get(c.id);
        if (decided) Object.assign(entry, { ...splitTarget(decided.target), status: 'ok', cand: [], manual: true });
        else applyClassification(entry, classify(c, state.compiled, state.learned));
        sum.neu++;
      }
      Object.assign(entry, { titel: c.titel, created: c.created, updated: c.updated, n: c.msgs.length, preview: previewOf(c) });
      if (entry.status === 'unklar') sum.unklar++;
      for (const t of uniqueTokens(textOf(c))) (add.get(t) || add.set(t, new Set()).get(t)).add(c.id);
      lists.push(entry); recs.push(c);
    });
    await db.putMany('chats', recs);
    await db.updatePostings(add, remove);
    await db.putMany('list', lists);
    for (const e of lists) state.byId.set(e.id, e);
    onProgress(Math.min(i + CHUNK, todo.length), todo.length);
    await tick();
  }
  setList([...state.byId.values()]);
  return sum;
}
const splitTarget = t => { const [kat, fach] = t.split('/'); return { kat, fach: fach || null }; };

// ---------------------------------------------------------------- Zuordnung & Lernen

export const getChat = id => db.get('chats', id);

/** Manuelle Zuordnung. Die Entscheidung wird gespeichert und fließt in künftige Einordnungen ein. */
export async function assign(id, kat, fach) {
  const entry = state.byId.get(id);
  const chat = await getChat(id);
  const target = targetKey(kat, fach);
  const old = state.decisions.get(id);
  if (old) learnAdd(state.learned, old.tokens, old.target, -1);
  const tokens = learnTokens(chat);
  learnAdd(state.learned, tokens, target, +1);
  Object.assign(entry, { kat, fach: fach || null, status: 'ok', manual: true, cand: [] });
  const decision = { id, target, tokens };
  state.decisions.set(id, decision);
  const touched = new Set([...(old ? old.tokens : []), ...tokens]);
  await db.put('list', entry);
  await db.put('decisions', decision);
  await db.withTx(['learn'], 'readwrite', s => {
    for (const t of touched) {
      const counts = state.learned.get(t);
      if (counts) s.put({ tok: t, counts }); else s.delete(t);
    }
  });
}

/** Alle nicht manuell zugeordneten Chats mit den aktuellen Regeln neu einordnen. */
export async function reclassifyAuto(onProgress = () => {}) {
  const targets = state.list.filter(c => !c.manual);
  let changed = 0;
  for (let i = 0; i < targets.length; i += 50) {
    const slice = targets.slice(i, i + 50);
    const recs = await Promise.all(slice.map(c => db.get('chats', c.id)));
    slice.forEach((c, k) => {
      const prev = `${c.status}|${c.kat}|${c.fach}`;
      applyClassification(c, classify(recs[k], state.compiled, state.learned));
      if (prev !== `${c.status}|${c.kat}|${c.fach}`) changed++;
    });
    await db.putMany('list', slice);
    onProgress(Math.min(i + 50, targets.length), targets.length);
    await tick();
  }
  return { geprueft: targets.length, geaendert: changed };
}

// ---------------------------------------------------------------- Auswertungen

export function counts() {
  const kat = new Map(), fach = new Map(), last = new Map();
  let unklar = 0;
  for (const c of state.list) {
    if (c.status !== 'ok') { unklar++; continue; }
    kat.set(c.kat, (kat.get(c.kat) || 0) + 1);
    const keys = [c.kat, ...(c.fach ? [`${c.kat}/${c.fach}`] : [])];
    if (c.fach) fach.set(`${c.kat}/${c.fach}`, (fach.get(`${c.kat}/${c.fach}`) || 0) + 1);
    for (const k of keys) if (!last.has(k) || last.get(k) < c.created) last.set(k, c.created);
  }
  return { kat, fach, last, unklar };
}

// ---------------------------------------------------------------- Backup

export async function exportBackup() {
  const [chats, list, decisions, learn] = await Promise.all([db.getAll('chats'), db.getAll('list'), db.getAll('decisions'), db.getAll('learn')]);
  return { format: 'claude-chat-archiv-backup', version: 1, created: new Date().toISOString(), config: state.config, settings: state.settings, chats, list, decisions, learn };
}

export async function importBackup(b, onProgress = () => {}) {
  if (!b || b.format !== 'claude-chat-archiv-backup' || !Array.isArray(b.chats) || !Array.isArray(b.list)) throw new Error('Das ist keine Backup-Datei dieser App.');
  await db.clear(db.STORE_NAMES);
  await db.put('kv', { key: 'config', value: b.config || DEFAULT_CONFIG });
  await db.put('kv', { key: 'settings', value: b.settings || { theme: 'auto' } });
  await db.putMany('list', b.list);
  await db.putMany('decisions', b.decisions || []);
  await db.putMany('learn', b.learn || []);
  for (let i = 0; i < b.chats.length; i += 40) {
    const slice = b.chats.slice(i, i + 40);
    const add = new Map();
    for (const c of slice) for (const t of uniqueTokens(textOf(c))) (add.get(t) || add.set(t, new Set()).get(t)).add(c.id);
    await db.putMany('chats', slice);
    await db.updatePostings(add, new Map());
    onProgress(Math.min(i + 40, b.chats.length), b.chats.length);
    await tick();
  }
  await init();
}

export async function wipeAll() {
  await db.clear(db.STORE_NAMES);
  await init();
}
