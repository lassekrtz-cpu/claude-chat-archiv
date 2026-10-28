// Erzeugt eine frei erfundene Beispiel-conversations.json (+ ZIP) zum Testen. Enthält keine echten Daten.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const fflate = createRequire(import.meta.url)('../vendor/fflate.min.js');

const themen = [
  ['Mathe: Kurvendiskussion', 'Mache die Kurvendiskussion der Funktion f(x)=x^3-3x', 'Zuerst die **Ableitung** bilden:\n\n- f\'(x)=3x^2-3\n- Nullstellen: x=±1\n\n```python\nimport sympy as sp\nx = sp.symbols("x")\nprint(sp.diff(x**3-3*x, x))\n```'],
  ['Biologie: Synapse', 'Erkläre mir die Signaltransduktion an der Synapse', 'An der **Synapse** wird ein Neurotransmitter freigesetzt.\n\n| Schritt | Ort |\n|---|---|\n| Ausschüttung | präsynaptisch |\n| Bindung | postsynaptisch |'],
  ['Englisch: Brave New World', 'Analyse the character of Bernard in Brave New World', 'Bernard Marx is an outsider in the World State ...'],
  ['Deutsch Aufsatz', 'Hilf mir beim Aufsatz, Erörterung zum Thema Social Media', 'Eine Erörterung gliedert sich in Einleitung, Hauptteil und Schluss.'],
  ['Ethik: Kohlberg', 'Was sagt Kohlberg zur Moral und Gerechtigkeit?', 'Kohlberg unterscheidet drei Ebenen der Moralentwicklung.'],
  ['Erdkunde: Tourismus', 'Erkläre das Butler-Modell des Tourismus', 'Das Modell beschreibt den Lebenszyklus eines Reiseziels.'],
  ['Physik: Quantenmechanik', 'Aufgabe 3 zur Quantenmechanik lösen', 'Die Wellenfunktion beschreibt den Zustand eines Teilchens.'],
  ['Rezept für Pasta', 'Ich suche ein Rezept fürs Wochenende', 'Spaghetti Carbonara: Eier, Pecorino, Guanciale ...'],
  ['Urlaub in Italien', 'Plane einen Urlaub und eine Reise nach Italien', 'Drei Tage Rom, zwei Tage Florenz ...'],
  ['Rigipsdecke spachteln', 'Wie kann ich eine Rigipsdecke spachteln?', 'Fugen mit Fugenspachtel füllen, Bewehrungsstreifen einlegen ...'],
  ['Baustelle Material', 'Welches Werkzeug brauche ich für die Montage auf der Baustelle?', 'Akkuschrauber, Wasserwaage, Bohrhammer ...'],
  ['Frage', 'Was ist die Hauptstadt von Frankreich?', 'Paris.'],
  ['Kurzer Test', 'Wie spät ist es in Tokio?', 'Das hängt von deiner Zeitzone ab.'],
  ['Hausaufgabe', 'Hausaufgabe und Klausur nächste Woche', 'Fang mit den Lernzetteln an.'],
];
const chats = [];
for (let i = 0; i < 60; i++) {
  const [titel, frage, antwort] = themen[i % themen.length];
  const day = String(1 + (i % 27)).padStart(2, '0');
  const created = `2026-09-${day}T10:${String(i % 60).padStart(2, '0')}:00.000000Z`;
  chats.push({
    uuid: `sample-${i}`, name: i % 17 === 0 ? '' : `${titel} ${Math.floor(i / themen.length) || ''}`.trim(),
    summary: '', created_at: created, updated_at: created, account: { uuid: 'x' },
    chat_messages: [
      { uuid: `m-${i}-0`, sender: 'human', text: frage, content: [{ type: 'text', text: frage }], created_at: created, updated_at: created, attachments: i % 5 === 0 ? [{ file_name: 'arbeitsblatt.png' }] : [], files: [] },
      { uuid: `m-${i}-1`, sender: 'assistant', text: '', content: [{ type: 'text', text: antwort }], created_at: created, updated_at: created, attachments: [], files: [] },
    ],
  });
}
chats.push({ uuid: 'leer', name: 'Leerer Chat', created_at: '2026-09-01T00:00:00Z', chat_messages: [] });
mkdirSync('tests/fixtures', { recursive: true });
const json = JSON.stringify(chats);
writeFileSync('tests/fixtures/conversations.json', json);
writeFileSync('tests/fixtures/export.zip', fflate.zipSync({ 'conversations.json': new TextEncoder().encode(json), 'users.json': new TextEncoder().encode('[]') }));
// Zweiter Export: ein geänderter Chat (sample-0 hat eine neue Nachricht) und ein neuer Chat
const second = JSON.parse(json);
second[0].updated_at = '2026-10-01T08:00:00.000000Z';
second[0].chat_messages.push({ uuid: 'm-0-2', sender: 'human', text: 'Und die Wendepunkte?', created_at: '2026-10-01T08:00:00Z', attachments: [], files: [] });
second.push({ uuid: 'neu-1', name: 'Physik Photon Strahlung', created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z', chat_messages: [{ sender: 'human', text: 'Was ist ein Photon?', created_at: '2026-10-02T09:00:00Z' }, { sender: 'assistant', text: 'Ein Lichtteilchen.', created_at: '2026-10-02T09:01:00Z' }] });
writeFileSync('tests/fixtures/conversations-2.json', JSON.stringify(second));
console.log(chats.length, 'Beispiel-Chats');
