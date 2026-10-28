// Volltextsuche und "Frag mein Fach" – rein lokal über den IndexedDB-Index, ohne KI-Dienst.
import * as db from './db.js';
import { state, getChat } from './store.js';
import { tokenize, isStop, stem, escapeHtml, highlight } from './tokens.js';

const dayStart = s => (s ? new Date(s + 'T00:00:00').getTime() : null);
const dayEnd = s => (s ? new Date(s + 'T23:59:59.999').getTime() : null);

/** filters: { kat, fach, unklar, von, bis } (von/bis als yyyy-mm-dd) */
export function filterList(filters = {}) {
  const from = dayStart(filters.von), to = dayEnd(filters.bis);
  return state.list.filter(c => {
    if (filters.unklar) { if (c.status === 'ok') return false; }
    else {
      if (filters.kat && c.kat !== filters.kat) return false;
      if (filters.fach === '-') { if (c.fach) return false; }
      else if (filters.fach && c.fach !== filters.fach) return false;
    }
    if (from !== null && c.created < from) return false;
    if (to !== null && c.created > to) return false;
    return true;
  });
}

async function postingSet(prefix) {
  const recs = await db.prefixScan('index', prefix);
  const set = new Set();
  for (const r of recs) for (const id of r.ids) set.add(id);
  return set;
}

/** Sucht alle Chats, in denen alle Suchbegriffe (als Wortanfang) vorkommen. */
export async function search(q, filters = {}) {
  const terms = [...new Set(tokenize(q))];
  const base = filterList(filters);
  if (!terms.length) return { terms, hits: base.slice().sort((a, b) => b.created - a.created) };
  const sets = [];
  for (const t of terms) sets.push(await postingSet(t));
  sets.sort((a, b) => a.size - b.size);
  const hits = base.filter(c => sets.every(s => s.has(c.id)));
  const titleHit = c => { const tt = tokenize(c.titel); return terms.every(t => tt.some(x => x.startsWith(t))); };
  hits.sort((a, b) => (titleHit(b) - titleHit(a)) || (b.created - a.created));
  return { terms, hits };
}

const wordRe = terms => new RegExp('(?:^|[^\\p{L}\\p{N}])(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'iu');

function cut(text, at, len, before = 60) {
  const start = Math.max(0, at - before);
  const piece = text.slice(start, start + len).replace(/\s+/g, ' ');
  return (start > 0 ? '… ' : '') + piece + (start + len < text.length ? ' …' : '');
}

/** Ausschnitt mit Treffer aus dem vollständigen Chat. Gibt { html, msg } zurück (msg = Index der Nachricht). */
export function snippet(chat, terms, len = 170) {
  if (!terms.length) return null;
  const re = wordRe(terms);
  for (let i = 0; i < chat.msgs.length; i++) {
    const m = re.exec(chat.msgs[i].x || '');
    if (m) return { html: highlight(cut(chat.msgs[i].x, m.index + m[0].length - m[1].length, len), terms), msg: i };
  }
  return null;
}

// ---------------------------------------------------------------- Frag mein Fach

function passages(chat) {
  const out = [];
  chat.msgs.forEach((m, mi) => {
    let buf = '';
    const flush = () => { if (buf.trim()) out.push({ msg: mi, r: m.r, text: buf.trim() }); buf = ''; };
    for (const para of (m.x || '').split(/\n{2,}/)) {
      if (buf && buf.length + para.length > 650) flush();
      buf += (buf ? '\n\n' : '') + para;
      if (buf.length > 650) flush();
    }
    flush();
  });
  return out;
}

/**
 * Findet passende Stellen in den Chats (optional eines Fachs). Keine Antwort-Generierung:
 * Es werden die relevantesten Textstellen mit Verweis auf den Ursprungs-Chat geliefert.
 */
export async function ask(question, filters = {}, maxPassages = 8) {
  const words = [...new Set(tokenize(question).filter(t => t.length >= 3 && !isStop(t)))];
  if (!words.length) return { words, results: [] };
  const stems = [...new Set(words.map(stem))];
  const base = new Map(filterList(filters).map(c => [c.id, c]));
  const N = Math.max(1, state.list.length);
  const idf = new Map(), chatScore = new Map();
  for (const st of stems) {
    const set = await postingSet(st);
    const df = Math.max(1, set.size);
    const w = Math.log(1 + N / df);
    idf.set(st, w);
    for (const id of set) if (base.has(id)) chatScore.set(id, (chatScore.get(id) || 0) + w);
  }
  const top = [...chatScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const found = [];
  for (const [id, cs] of top) {
    const chat = await getChat(id);
    if (!chat) continue;
    const titleToks = tokenize(chat.titel);
    const titleBonus = stems.filter(st => titleToks.some(t => t.startsWith(st))).length * 1.5;
    for (const p of passages(chat)) {
      const toks = tokenize(p.text);
      let score = 0;
      for (const st of stems) {
        const n = toks.filter(t => t.startsWith(st)).length;
        if (n) score += idf.get(st) * Math.min(n, 3);
      }
      if (!score) continue;
      score = (score + titleBonus + cs * 0.2) * (p.r === 'a' ? 1 : 0.8) / (1 + p.text.length / 1500);
      found.push({ id, msg: p.msg, role: p.r, text: p.text, score });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const perChat = new Map(), results = [];
  for (const f of found) {
    if ((perChat.get(f.id) || 0) >= 2) continue;
    perChat.set(f.id, (perChat.get(f.id) || 0) + 1);
    const entry = state.byId.get(f.id);
    const re = wordRe(stems);
    const m = re.exec(f.text);
    const at = m ? m.index : 0;
    results.push({ id: f.id, msg: f.msg, role: f.role, html: highlight(cut(f.text, at, 420, 90), stems), titel: entry.titel, created: entry.created, kat: entry.kat, fach: entry.fach });
    if (results.length >= maxPassages) break;
  }
  return { words, results };
}

export { escapeHtml };
