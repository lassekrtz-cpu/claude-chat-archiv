// Regelbasierte Einordnung + einfaches Lernen aus manuellen Entscheidungen (reine Logik, ohne DOM).
import { uniqueTokens, isStop } from './tokens.js';

const BOUND = '(?:^|[^\\p{L}\\p{N}])';
const END = '(?![\\p{L}\\p{N}])';
const PUNKTE_TITEL = 3, PUNKTE_ICH = 1, PUNKTE_CLAUDE = 0.5, MAX_TREFFER = 3, MAX_TEXT = 40000;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "=Wort" bedeutet: nur als ganzes Wort. */
export function parseKeyword(raw) {
  let k = String(raw).trim();
  let exact = false;
  if (k.startsWith('=')) { exact = true; k = k.slice(1).trim(); }
  return k ? { k: k.toLowerCase(), exact } : null;
}

export const targetKey = (kat, fach) => (fach ? `${kat}/${fach}` : kat);
export function splitKey(key) { const [kat, fach] = key.split('/'); return { kat, fach: fach || null }; }

/** Baut aus der Konfiguration einen schnellen Matcher (ein Regex für alle Stichwörter). */
export function compile(config) {
  const entries = new Map();              // "k" oder "=k" -> { k, exact, owners: Set }
  const owners = new Map();               // owner -> { kat, fach }
  const add = (owner, list) => {
    for (const raw of list || []) {
      const p = parseKeyword(raw);
      if (!p) continue;
      const id = (p.exact ? '=' : '') + p.k;
      if (!entries.has(id)) entries.set(id, { k: p.k, exact: p.exact, owners: new Set() });
      entries.get(id).owners.add(owner);
    }
  };
  for (const kat of config.kategorien) {
    owners.set(`k:${kat.id}`, { kat: kat.id, fach: null });
    add(`k:${kat.id}`, kat.keywords);
    for (const f of kat.faecher || []) {
      owners.set(`f:${kat.id}/${f.id}`, { kat: kat.id, fach: f.id });
      add(`f:${kat.id}/${f.id}`, f.keywords);
    }
  }
  const keys = [...new Set([...entries.values()].map(e => e.k))].sort((a, b) => b.length - a.length);
  const exactKeys = new Set([...entries.values()].filter(e => e.exact).map(e => e.k));
  const prefixKeys = new Set([...entries.values()].filter(e => !e.exact).map(e => e.k));
  // Ein Treffer ohne weiteren Buchstaben dahinter zählt für Wort- und Präfix-Stichwörter, sonst nur für Präfix-Stichwörter.
  const alt = keys.map(k => esc(k) + (exactKeys.has(k) && !prefixKeys.has(k) ? END : '')).join('|');
  const re = keys.length ? new RegExp(BOUND + '(' + alt + ')', 'giu') : null;
  return { entries, owners, re, config };
}

function countMatches(text, compiled) {
  const counts = new Map();
  if (!compiled.re || !text) return counts;
  const s = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  compiled.re.lastIndex = 0;
  let m;
  while ((m = compiled.re.exec(s))) {
    const k = m[1].toLowerCase();
    const end = m.index + m[0].length;
    const wordContinues = end < s.length && /[\p{L}\p{N}]/u.test(s[end]);
    const bump = id => { if (compiled.entries.has(id)) counts.set(id, (counts.get(id) || 0) + 1); };
    bump(k);
    if (!wordContinues) bump('=' + k);
    if (m[0].length === 0) compiled.re.lastIndex++;
  }
  return counts;
}

function ownerScores(chat, compiled) {
  const hText = chat.msgs.filter(m => m.r === 'h').map(m => m.x).join('\n');
  const aText = chat.msgs.filter(m => m.r === 'a').map(m => m.x).join('\n');
  const t = countMatches(chat.titel, compiled), h = countMatches(hText, compiled), a = countMatches(aText, compiled);
  const scores = new Map();
  for (const [id, e] of compiled.entries) {
    const pts = (t.get(id) ? PUNKTE_TITEL : 0) + PUNKTE_ICH * Math.min(h.get(id) || 0, MAX_TREFFER) + PUNKTE_CLAUDE * Math.min(a.get(id) || 0, MAX_TREFFER);
    if (!pts) continue;
    for (const o of e.owners) scores.set(o, (scores.get(o) || 0) + pts);
  }
  return scores;
}

/** Tokens, aus denen gelernt wird: Titel + Anfang der ersten eigenen Nachricht. */
export function learnTokens(chat) {
  const first = chat.msgs.find(m => m.r === 'h' && m.x);
  return uniqueTokens(chat.titel + ' ' + (first ? first.x.slice(0, 400) : ''), 4).filter(t => !isStop(t));
}

export function learnAdd(learned, tokens, target, delta = 1) {
  for (const t of tokens) {
    const e = learned.get(t) || {};
    e[target] = (e[target] || 0) + delta;
    if (e[target] <= 0) delete e[target];
    if (Object.keys(e).length) learned.set(t, e); else learned.delete(t);
  }
}

function learnedScores(chat, learned) {
  const out = new Map();
  if (!learned || !learned.size) return out;
  for (const tok of learnTokens(chat)) {
    const e = learned.get(tok);
    if (!e) continue;
    const total = Object.values(e).reduce((a, b) => a + b, 0);
    for (const [target, n] of Object.entries(e)) if (n / total >= 0.7) out.set(target, (out.get(target) || 0) + 1.5);
  }
  return out;
}

function decide(scores, einst) {
  const rank = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!rank.length) return null;
  const first = rank[0][1], second = rank[1] ? rank[1][1] : 0;
  return first >= einst.mindestpunkte && first >= einst.abstandsfaktor * second ? rank[0][0] : null;
}

/**
 * Ordnet einen Chat ein.
 * -> { status: 'ok', kat, fach } oder { status: 'unklar', candidates: [{ kat, fach, score }] }
 */
export function classify(chat, compiled, learned) {
  const cfg = compiled.config, einst = cfg.einstellungen;
  const own = ownerScores(chat, compiled);
  const lrn = learnedScores(chat, learned);
  const katScore = new Map(), fachScore = new Map();
  for (const kat of cfg.kategorien) {
    let s = (own.get(`k:${kat.id}`) || 0) + (lrn.get(kat.id) || 0);
    for (const f of kat.faecher || []) {
      const fs = (own.get(`f:${kat.id}/${f.id}`) || 0) + (lrn.get(`${kat.id}/${f.id}`) || 0);
      fachScore.set(`${kat.id}/${f.id}`, fs);
      s += fs;
    }
    katScore.set(kat.id, s);
  }
  const katId = decide(katScore, einst);
  const kat = katId && cfg.kategorien.find(k => k.id === katId);
  if (kat && !(kat.faecher || []).length) return { status: 'ok', kat: kat.id, fach: null };
  if (kat) {
    const scores = new Map(kat.faecher.map(f => [f.id, fachScore.get(`${kat.id}/${f.id}`) || 0]));
    const fachId = decide(scores, einst);
    if (fachId) return { status: 'ok', kat: kat.id, fach: fachId };
    const candidates = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([fach, score]) => ({ kat: kat.id, fach, score }));
    return { status: 'unklar', candidates };
  }
  // Kategorie unklar: Kandidaten über alle Ziele (Fächer und Kategorien ohne Fächer)
  const all = [];
  for (const k of cfg.kategorien) {
    if ((k.faecher || []).length) for (const f of k.faecher) all.push({ kat: k.id, fach: f.id, score: fachScore.get(`${k.id}/${f.id}`) || 0 });
    else all.push({ kat: k.id, fach: null, score: katScore.get(k.id) || 0 });
  }
  all.sort((a, b) => b.score - a.score);
  return { status: 'unklar', candidates: all.slice(0, 6) };
}
