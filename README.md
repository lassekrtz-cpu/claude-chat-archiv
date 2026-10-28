# Chat-Archiv

Eine App fürs iPhone, die deinen **Claude-Datenexport** einliest, die Chats automatisch nach Schule (mit Fächern), Privat,
Arbeit/Handwerk und Sonstiges sortiert und sie durchsuchbar macht.

**Alles bleibt auf deinem Gerät.** Kein Server, keine Cloud, keine Analytics, keine Schriften oder Skripte von außen.
Die Daten liegen in der IndexedDB von Safari. Nach dem ersten Öffnen läuft die App auch ohne Internet.

## 1. App öffnen und zum Home-Bildschirm hinzufügen
1. Öffne die Adresse der App in **Safari** (die GitHub-Pages-Adresse dieses Repositories, siehe unten).
2. Tippe auf **Teilen** (Quadrat mit Pfeil) und dann auf **„Zum Home-Bildschirm“**.
3. Starte die App über das neue Symbol. Erst so läuft sie wie eine richtige App (Vollbild, Wischen vom linken Rand zum Zurückgehen).

## 2. Export in Claude anfordern
1. Öffne **claude.ai** im Browser, dann **Einstellungen → Datenschutz → „Daten exportieren“**.
2. Du bekommst eine E-Mail von Anthropic mit einem Download-Link (24 Stunden gültig). Schau auch im **Spam-Ordner** nach.
3. Öffne den Link in **Safari** (nicht in der Mail-App) und lade die ZIP-Datei herunter. Sie landet in der Dateien-App unter „Downloads“.
   Manche Exporte bestehen aus mehreren Teilen (`conversations-000.zip`, `…-001.zip`): lade die mit den Chats herunter. Du kannst mehrere Dateien gleichzeitig importieren.

## 3. In die App importieren
1. Tippe in der App auf **„Export importieren“** und wähle die ZIP (oder die entpackte `conversations.json`) aus der Dateien-App.
2. Die App entpackt, sortiert und indexiert alles auf dem Gerät. Das dauert bei vielen Chats einige Sekunden bis Minuten.
3. Unsichere Chats erscheinen unter **„Zuordnen“**: Tippe das passende Fach oder den Ordner an. Deine Entscheidung wird gespeichert und bei künftigen Chats berücksichtigt.

**Erneuter Import:** Wähle einfach den neuen Export aus. Neue Chats werden ergänzt, geänderte Chats (neue Nachrichten) aktualisiert,
alles andere bleibt. Nichts wird doppelt angelegt, und manuell verschobene Chats bleiben in ihrem Ordner.

## 4. Benutzen
- **Start:** Kacheln pro Fach und Ordner mit Anzahl und letztem Datum.
- **Suche:** Lupe oben. Durchsucht Titel und Volltext (Wortanfang, z. B. „synap“ findet „Synapse“), filterbar nach Ordner/Fach und Zeitraum.
- **Chat:** Tippe einen Treffer an. Der Verlauf erscheint als Sprechblasen, Codeblöcke lassen sich kopieren.
- **Frag mein Fach:** Frage eintippen, die App zeigt die passendsten Stellen aus deinen Chats mit Verweis auf den Ursprungs-Chat.
  Das ist eine lokale Stichwort-Suche, **keine KI** und keine Antwort-Generierung.
- **Verschieben:** Im Chat auf den Ordner-Chip tippen.

## 5. Kategorien, Fächer und Stichwörter ändern
**Einstellungen → Ordner und Fächer.** Dort kannst du Kategorien und Fächer anlegen, umbenennen, einfärben, löschen und ihre Stichwörter bearbeiten.
- „Mathe“ findet auch „Mathematik“ (Wortanfang). Mit `=` davor nur das ganze Wort: `=Deutsch` findet nicht „Deutschland“.
- Nach Änderungen: **Einstellungen → Chats neu einordnen** (manuell zugeordnete Chats bleiben unangetastet).

## 6. Backup (wichtig)
Safari kann Webseiten-Daten löschen, wenn die App lange nicht benutzt wird. Die App fordert dauerhaften Speicher an (`navigator.storage.persist()`),
aber Safari entscheidet. Mach deshalb ab und zu **Einstellungen → Backup exportieren** und sichere die Datei in „Dateien“.
Mit **Backup importieren** stellst du alles wieder her (ersetzt die vorhandenen Daten).

## Technik
- Reines HTML/CSS/JavaScript ohne Build-Schritt. ZIP-Entpacken mit [fflate](https://github.com/101arrowz/fflate) (MIT, lokal in `vendor/`).
- Speicher: IndexedDB mit Index-Tabelle (Wort → Chat-IDs) für die Volltextsuche.
- Service Worker (`sw.js`) legt alle App-Dateien beim ersten Öffnen im Cache ab. Er macht keine Netzwerkanfragen zu fremden Servern.
- Tests: `node --test tests/*.test.mjs` (Logik) und `node tests/e2e.mjs` mit Playwright (Browser-Ablauf, braucht einen lokalen Server: `python3 -m http.server 8765`).
  Beispieldaten erzeugt `node tools/make-sample.mjs` (erfundene Chats).

## Veröffentlichung mit GitHub Pages
Das Repository enthält nur den App-Code, keine Chat-Daten. Einmalig einstellen: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
Danach veröffentlicht der Workflow `.github/workflows/pages.yml` bei jedem Push auf `main` (er führt vorher die Logik-Tests aus). Die Adresse lautet
`https://<benutzername>.github.io/<repository>/`.

## Grenzen
- Getestet mit Chromium (Playwright) und künstlichen Beispieldaten, **nicht auf einem echten iPhone**. Abweichungen in Safari sind möglich.
- Bilder und Dateianhänge sind im Claude-Export nicht enthalten, nur ihre Namen.
- Sehr große Exporte (hunderte MB) können auf dem iPhone den Speicher ausreizen.
- Der Export gehört dir: Die App ändert deine Originaldatei nie.
