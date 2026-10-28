// Parsen des Claude-Datenexports (conversations.json) in ein schlankes Chat-Modell.

function ts(v) {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function messageText(m) {
  const t = typeof m.text === 'string' ? m.text.trim() : '';
  if (t) return t;
  const blocks = Array.isArray(m.content) ? m.content : [];
  return blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text.trim()).filter(Boolean).join('\n\n');
}

/** Wandelt ein geparstes JSON (Liste von Chats) in das interne Modell. Leere Chats werden ignoriert. */
export function parseConversations(data) {
  if (!Array.isArray(data)) throw new Error('Das ist keine conversations.json (Liste von Chats erwartet).');
  const byId = new Map();
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const msgs = [];
    for (const m of Array.isArray(raw.chat_messages) ? raw.chat_messages : []) {
      if (!m || typeof m !== 'object') continue;
      const files = [...(m.attachments || []), ...(m.files || [])]
        .map(a => a && (a.file_name || a.name)).filter(Boolean);
      const x = messageText(m);
      if (!x && !files.length) continue;
      msgs.push({ r: m.sender === 'human' ? 'h' : 'a', t: ts(m.created_at), x, f: files });
    }
    if (!msgs.length) continue;
    const created = ts(raw.created_at) || msgs[0].t;
    let titel = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!titel) {
      const first = msgs.find(m => m.r === 'h' && m.x);
      titel = first ? first.x.replace(/\s+/g, ' ').slice(0, 60).trim() : 'Ohne Titel';
    }
    const id = String(raw.uuid || `${raw.name}|${raw.created_at}`);
    byId.set(id, { id, titel, created, updated: ts(raw.updated_at) || created, msgs });
  }
  return [...byId.values()];
}

/** Einzelne Chat-Listen zusammenführen; bei gleicher id gewinnt die neuere Fassung. */
export function mergeChats(lists) {
  const byId = new Map();
  for (const list of lists) for (const c of list) {
    const old = byId.get(c.id);
    if (!old || c.updated >= old.updated) byId.set(c.id, c);
  }
  return [...byId.values()];
}

const isConversationsName = n => /(^|\/)conversations[^/]*\.json$/i.test(n);

/**
 * Liest ausgewählte Dateien (ZIP oder JSON) und liefert die Chats.
 * `readers` kapselt den Dateizugriff, damit die Logik auch ohne Browser testbar ist:
 *   { bytes(file) -> Uint8Array, name(file) -> string }
 */
export async function chatsFromFiles(files, fflate, readers) {
  const found = [];
  const decoder = new TextDecoder('utf-8');
  for (const file of files) {
    const bytes = await readers.bytes(file);
    const name = readers.name(file);
    const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (isZip) {
      const entries = fflate.unzipSync(bytes, { filter: f => isConversationsName(f.name) });
      const names = Object.keys(entries);
      if (!names.length) throw new Error(`„${name}“ enthält keine conversations.json.`);
      for (const n of names) found.push(parseConversations(JSON.parse(stripBom(decoder.decode(entries[n])))));
    } else {
      let parsed;
      try { parsed = JSON.parse(stripBom(decoder.decode(bytes))); }
      catch { throw new Error(`„${name}“ ist weder eine ZIP-Datei noch gültiges JSON.`); }
      found.push(parseConversations(parsed));
    }
  }
  return mergeChats(found);
}

function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
