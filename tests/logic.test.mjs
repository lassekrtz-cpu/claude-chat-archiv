// Tests der reinen Logik: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tokenize, highlight, stem } from '../js/tokens.js';
import { parseConversations, chatsFromFiles } from '../js/parse.js';
import { compile, classify, learnAdd, learnTokens, parseKeyword } from '../js/classify.js';
import { renderMarkdown } from '../js/markdown.js';
import { DEFAULT_CONFIG } from '../js/defaults.js';
const fflate = createRequire(import.meta.url)('../vendor/fflate.min.js');

const chat = (name, human, assistant = 'Antwort.', extra = {}) => ({
  uuid: extra.uuid || name, name, created_at: '2026-09-01T10:00:00Z', updated_at: extra.updated || '2026-09-01T10:05:00Z',
  chat_messages: [
    { sender: 'human', text: human, created_at: '2026-09-01T10:00:00Z', attachments: extra.files || [] },
    { sender: 'assistant', text: '', content: [{ type: 'text', text: assistant }], created_at: '2026-09-01T10:01:00Z' },
  ],
});
const run = (c, learned) => classify(parseConversations([c])[0], compile(DEFAULT_CONFIG), learned);

test('tokenize/highlight/stem', () => {
  assert.deepEqual(tokenize('Größe: 5 cm, Über-Mathe!'), ['größe', 'cm', 'über', 'mathe']);
  assert.equal(highlight('Mathe <b>Test</b>', ['mat']), '<mark>Mat</mark>he &lt;b&gt;Test&lt;/b&gt;');
  assert.equal(stem('synapsen'), 'synaps');
});

test('Parser: Inhalte, leere Chats, Anhänge, Titel-Ersatz', () => {
  const data = [
    chat('Mathe', 'Hilfe', 'Klar', { files: [{ file_name: 'blatt.png' }] }),
    { uuid: 'leer', name: 'Leer', chat_messages: [] },
    { uuid: 'ohne', name: '', created_at: '2026-01-01T00:00:00Z', chat_messages: [{ sender: 'human', text: '  Was ist   eine Synapse? ' }] },
    null, 'x',
  ];
  const out = parseConversations(data);
  assert.equal(out.length, 2);
  assert.equal(out[0].msgs[1].x, 'Klar');          // aus content-Block
  assert.deepEqual(out[0].msgs[0].f, ['blatt.png']);
  assert.equal(out[1].titel, 'Was ist eine Synapse?');
  assert.throws(() => parseConversations({}), /Liste von Chats/);
});

test('Import aus ZIP (auch verschachtelt), JSON und Mehrfachdateien', async () => {
  const json = new TextEncoder().encode(JSON.stringify([chat('A', 'Mathe Aufgabe')]));
  const json2 = new TextEncoder().encode(JSON.stringify([chat('B', 'Rezept'), chat('A', 'Mathe Aufgabe', 'neu', { updated: '2026-09-02T00:00:00Z' })]));
  const zip = fflate.zipSync({ 'export/conversations.json': json, 'export/users.json': new TextEncoder().encode('[]') });
  const readers = { bytes: async f => f.bytes, name: f => f.name };
  const out = await chatsFromFiles([{ name: 'e.zip', bytes: zip }, { name: 'c.json', bytes: json2 }], fflate, readers);
  assert.equal(out.length, 2);
  assert.equal(out.find(c => c.id === 'A').msgs[1].x, 'neu');          // neuere Fassung gewinnt
  await assert.rejects(chatsFromFiles([{ name: 'x.zip', bytes: fflate.zipSync({ 'a.txt': json }) }], fflate, readers), /keine conversations\.json/);
  await assert.rejects(chatsFromFiles([{ name: 'k.json', bytes: new TextEncoder().encode('kaputt') }], fflate, readers), /weder eine ZIP/);
});

test('Einordnung: eindeutig, Fach, unklar', () => {
  const r1 = run(chat('Kurvendiskussion', 'Mache die Kurvendiskussion der Funktion', 'Ableitung bilden'));
  assert.deepEqual([r1.status, r1.kat, r1.fach], ['ok', 'schule', 'mathe']);
  const r2 = run(chat('Rezept für Pasta', 'Ich suche ein Rezept fürs Wochenende'));
  assert.deepEqual([r2.status, r2.kat, r2.fach], ['ok', 'privat', null]);
  const r3 = run(chat('Frage', 'Was ist die Hauptstadt von Frankreich?'));
  assert.equal(r3.status, 'unklar');
  const r4 = run(chat('Hausaufgabe', 'Hausaufgabe und Klausur', 'ok'));   // Schule klar, Fach unklar
  assert.equal(r4.status, 'unklar');
  assert.ok(r4.candidates.every(c => c.kat === 'schule' && c.fach));
});

test('Stichwort-Regeln: Wortanfang vs. ganzes Wort', () => {
  assert.deepEqual(parseKeyword('=Deutsch'), { k: 'deutsch', exact: true });
  const deutschland = run(chat('Reise nach Deutschland', 'Deutschland Reise Urlaub'));
  assert.equal(deutschland.kat, 'privat');          // "=Deutsch" darf "Deutschland" nicht treffen
  const aufsatz = run(chat('Deutsch Aufsatz', 'Deutsch Aufsatz Erörterung schreiben'));
  assert.deepEqual([aufsatz.kat, aufsatz.fach], ['schule', 'deutsch']);
  const mathe = run(chat('Mathematik', 'Mathematik Gleichung', 'Gleichung lösen'));
  assert.equal(mathe.fach, 'mathe');                // "Mathe" trifft "Mathematik"
});

test('Lernen aus manuellen Entscheidungen', () => {
  const c = chat('Frage zu Frankreich', 'Hauptstadt Frankreichs Geographie Paris', 'Paris');
  assert.equal(run(c).status, 'unklar');
  const learned = new Map();
  const parsed = parseConversations([c])[0];
  learnAdd(learned, learnTokens(parsed), 'schule/erdkunde');
  learnAdd(learned, learnTokens(parsed), 'schule/erdkunde');
  const r = run(chat('Frankreich Geographie', 'Hauptstadt von Frankreich, Paris Geographie'), learned);
  assert.deepEqual([r.status, r.kat, r.fach], ['ok', 'schule', 'erdkunde']);
  learnAdd(learned, learnTokens(parsed), 'schule/erdkunde', -2);        // Rücknahme
  assert.equal(learned.size, 0);
});

test('Markdown: Code, Listen, Tabellen, Sicherheit', () => {
  const html = renderMarkdown('# Titel\n\nText **fett** und `a<b`\n\n- eins\n  - zwei\n- drei\n\n```python\nprint("<x>")\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script> [l](https://x.de/a?b=1&c=2) [bad](javascript:alert(1))');
  assert.match(html, /<h4 class="md-h md-h1">Titel<\/h4>/);
  assert.match(html, /<strong>fett<\/strong>/);
  assert.match(html, /<code>a&lt;b<\/code>/);
  assert.match(html, /<ul><li>eins<ul><li>zwei<\/li><\/ul><\/li><li>drei<\/li><\/ul>/);
  assert.match(html, /<span>python<\/span>.*print\(&quot;&lt;x&gt;&quot;\)/s);
  assert.match(html, /<table>.*<td>1<\/td><td>2<\/td>/s);
  assert.doesNotMatch(html, /<script|href="javascript/);
  assert.match(html, /href="https:\/\/x\.de\/a\?b=1&amp;c=2"/);
  assert.match(renderMarkdown('```js\nnoch offen'), /noch offen/);   // unbeendeter Codeblock
});
