// End-to-End-Test im Browser (Playwright/Chromium, Handy-Viewport). Start: node tests/e2e.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : '  ' + extra}`); };
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, colorScheme: 'light' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const external = [];
page.on('request', r => { const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin && !['data:', 'blob:'].includes(u.protocol)) external.push(r.url()); });

const text = sel => page.locator(sel).first().innerText();
const importFile = async (file) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-import]').first().click()]);
  await chooser.setFiles(file);
  await page.waitForSelector('[data-done]', { timeout: 20000 });
  const msg = await text('.sheet-b');
  await page.locator('[data-done]').click();
  await page.waitForTimeout(450);
  return msg;
};
const overflow = () => page.evaluate(() => { const v = [...document.querySelectorAll('.view')].pop(); return v.scrollWidth > v.clientWidth + 1; });
const shot = name => page.screenshot({ path: `test-results/${name}.png` });

await page.goto(BASE);
await page.waitForSelector('.empty-state');
check('Leerer Startbildschirm mit Import-Button', await page.locator('[data-import]').count() === 1);
await shot('01-leer');

// --- Import ZIP
let msg = await importFile('tests/fixtures/export.zip');
check('Import ZIP: 60 neu (leerer Chat ignoriert)', /60 neu/.test(msg), msg);
await page.waitForSelector('.tile');
const tileTexts = await page.locator('.tile').allInnerTexts();
check('Kacheln für Fächer und Ordner vorhanden', tileTexts.length >= 12, tileTexts.length);
const sumTiles = await page.evaluate(() => [...document.querySelectorAll('.tile')].reduce((n, t) => n + Number((t.querySelector('.tm').textContent.match(/^(\d+)/) || [0, 0])[1]), 0));
const unklarBanner = await page.locator('a.banner.warn').count();
const unklarN = unklarBanner ? Number((await text('a.banner.warn')).match(/(\d+) Chat/)[1]) : 0;
check('Alle 60 Chats sind einem Ordner oder „Zuordnen“ zugeordnet', sumTiles + unklarN === 60, `${sumTiles}+${unklarN}`);
check('Automatisch sortiert (Mehrheit ohne Rückfrage)', sumTiles >= 45, sumTiles);
check('Kein horizontales Scrollen (Start)', !(await overflow()));
await shot('02-start');

// --- Zuordnen
await page.locator('a.banner.warn').click();
await page.waitForSelector('.assign');
const before = await page.locator('.assign:not(.gone)').count();
await shot('03-zuordnen');
const firstOpt = page.locator('.assign .opt[data-id]').first();
const firstLabel = await firstOpt.innerText();
await firstOpt.click();
await page.waitForTimeout(500);
check('Zuordnen: Auswahl entfernt die Karte', (await page.locator('.assign:not(.gone)').count()) === before - 1, firstLabel);
await page.locator('[data-back]').first().click();
await page.waitForSelector('.tile');

// --- Fach öffnen, Suche
await page.locator('.tile', { hasText: 'Mathe' }).click();
await page.waitForSelector('.row');
const matheN = await page.locator('.row').count();
check('Fach-Ansicht listet Chats', matheN >= 4, matheN);
await page.locator('#q').fill('ableitung');
await page.waitForFunction(() => document.querySelector('#meta')?.textContent.includes('Treffer'));
check('Volltextsuche findet Treffer in Fach', (await page.locator('.row mark').count()) > 0);
await shot('04-suche');
check('Suche mit Wortanfang (Präfix) „ableit“', await (async () => { await page.locator('#q').fill('ableit'); await page.waitForTimeout(500); return (await page.locator('.row').count()) > 0; })());
await page.locator('#q').fill('quantenmechanik');
await page.waitForTimeout(500);
check('Suche im Fach Mathe findet Physik-Chat NICHT', (await page.locator('.row').count()) === 0);
await page.locator('#s').selectOption('');
await page.waitForTimeout(500);
check('Suche über alle Ordner findet ihn', (await page.locator('.row').count()) > 0);
await page.locator('#von').fill('2099-01-01');
await page.waitForTimeout(400);
check('Zeitraum-Filter schließt aus', (await page.locator('.row').count()) === 0);
await page.locator('#von').fill('');
await page.waitForTimeout(400);

// --- Chat öffnen
await page.locator('#q').fill('kurvendiskussion');
await page.waitForTimeout(500);
await page.locator('.row').first().click();
await page.waitForSelector('.bubble');
check('Chat als Sprechblasen (2 Nachrichten)', (await page.locator('.msg').count()) === 2);
check('Codeblock mit Kopieren-Knopf', (await page.locator('.code [data-copy]').count()) >= 1);
check('Treffer im Chat hervorgehoben', (await page.locator('.thread mark').count()) > 0);
check('Kein horizontales Scrollen (Chat)', !(await overflow()));
await shot('05-chat');

// --- Verschieben + merken (Reload)
const chatPath = await page.evaluate(() => location.hash);
await page.locator('#folderChip').click();
await page.locator('.pick', { hasText: 'Privat' }).first().click();
await page.waitForTimeout(700);
check('Verschieben aktualisiert den Ordner-Chip', /Privat/.test(await text('#folderChip')));
await page.reload();
await page.waitForSelector('#folderChip');
check('Zuordnung bleibt nach Neuladen (IndexedDB)', /Privat/.test(await text('#folderChip')));

// --- Frag mein Fach
await page.goto(BASE + '#/frag?s=schule%2Fbiologie&q=' + encodeURIComponent('Was passiert an der Synapse?'));
await page.reload();
await page.waitForSelector('.hit', { timeout: 8000 });
check('„Frag mein Fach“ liefert Stelle mit Quelle', /Neurotransmitter/i.test(await text('.hit')) && /Biologie/i.test(await page.locator('#s').evaluate(s => s.selectedOptions[0].textContent)));
await shot('06-frag');
await page.locator('.hit').first().click();
await page.waitForSelector('.bubble');
check('Treffer führt in den Ursprungs-Chat', (await page.locator('.msg').count()) >= 2);

// --- Re-Import: nur Neues/Geändertes, manuelle Zuordnung bleibt
await page.goto(BASE);
await page.waitForSelector('.tile');
const mathe0 = await page.locator('.tile', { hasText: 'Mathe' }).innerText();
msg = await importFile('tests/fixtures/conversations-2.json');
check('Re-Import: 1 neu, 1 aktualisiert, 59 unverändert', /1 neu/.test(msg) && /1 aktualisiert/.test(msg) && /59 unverändert/.test(msg), msg);
msg = await importFile('tests/fixtures/conversations-2.json');
check('Zweiter Re-Import: nichts doppelt (0 neu)', /0 neu/.test(msg) && /0 aktualisiert/.test(msg) && /61 unverändert|60 unverändert/.test(msg), msg);

// --- Einstellungen: Fach hinzufügen, Dark-Mode
await page.locator('[aria-label="Einstellungen"]').click();
await page.waitForSelector('.seg');
await page.locator('[data-set-theme="dark"]').click();
await page.waitForTimeout(300);
check('Dark Mode umschaltbar', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await shot('07-einstellungen-dunkel');
await page.locator('[data-kat="schule"]').click();
await page.waitForSelector('#e-name');
await page.locator('[data-fach="__new"]').click();
await page.waitForSelector('.sheet:last-of-type #e-name');
await page.locator('.sheet').last().locator('#e-name').fill('Informatik');
await page.locator('.sheet').last().locator('#e-kw').fill('python, =Code');
await page.locator('.sheet').last().locator('[data-save]').click();
await page.waitForTimeout(1000);
check('Nach dem Speichern eines Fachs öffnet sich wieder die Kategorie', (await page.locator('.sheet.open #e-name').count()) === 1);
await page.locator('.sheet.open [data-close]').click();
await page.waitForTimeout(500);
await page.locator('[data-set-theme="light"]').click();
await page.locator('[aria-label="Zurück"]').first().click();
await page.waitForSelector('.tile');
check('Neues Fach erscheint als Kachel', await page.locator('.tile', { hasText: 'Informatik' }).count() === 1);
// Neu einordnen: Mathe-Chat mit python-Code landet nun in Informatik (nicht manuell verschoben)
await page.locator('[aria-label="Einstellungen"]').click();
await page.waitForSelector('[data-reclass]');
await page.locator('[data-reclass]').click();
await page.waitForSelector('[data-close2]');
await page.locator('[data-close2]').click();
await page.waitForTimeout(400);

// --- Backup export -> Daten löschen -> Backup import
await page.waitForSelector('[data-backup-out]');
const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-backup-out]').click()]);
const backupPath = 'test-results/backup.json.gz';
await download.saveAs(backupPath);
check('Backup-Datei erzeugt (.json.gz)', /\.json\.gz$/.test(download.suggestedFilename()) && readFileSync(backupPath).length > 1000);
await page.locator('[data-wipe]').click();
await page.locator('[data-ok]').click();
await page.waitForSelector('.empty-state');
check('Nach „Alle Daten löschen“ leerer Zustand', true);
await page.locator('[aria-label="Einstellungen"]').click();
await page.waitForSelector('[data-backup-in]');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-backup-in]').click()]);
await chooser.setFiles(backupPath);
await page.locator('[data-ok]').click();
await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Backup eingespielt'), null, { timeout: 20000 });
await page.locator('[aria-label="Zurück"]').first().click();
await page.waitForSelector('.tile');
const sum2 = await page.evaluate(() => [...document.querySelectorAll('.tile')].reduce((n, t) => n + Number((t.querySelector('.tm').textContent.match(/^(\d+)/) || [0, 0])[1]), 0));
const unklar2 = (await page.locator('a.banner.warn').count()) ? Number((await text('a.banner.warn')).match(/(\d+) Chat/)[1]) : 0;
check('Backup wiederhergestellt: alle 61 Chats da', sum2 + unklar2 === 61, `${sum2}+${unklar2}`);
check('Neu angelegtes Fach nach Backup noch da', await page.locator('.tile', { hasText: 'Informatik' }).count() === 1);
await page.locator('button[aria-label="Suche"]').click();
await page.locator('#q').fill('kurvendiskussion');
await page.waitForTimeout(600);
check('Manuell verschobener Chat blieb nach Neu-Einordnung und Backup in „Privat“', (await page.locator('.row-m', { hasText: 'Privat' }).count()) >= 1);
await page.locator('#q').fill('photon');
await page.waitForTimeout(600);
check('Volltextindex nach Backup neu aufgebaut', (await page.locator('.row').count()) >= 1);

// --- Persistenz, Offline
const persisted = await page.evaluate(async () => (navigator.storage && navigator.storage.persist) ? await navigator.storage.persist() : null);
console.log('INFO storage.persist() ->', persisted);
await Promise.race([page.evaluate(() => navigator.serviceWorker.ready.then(() => true)), new Promise((_, rej) => setTimeout(() => rej(new Error('Service Worker nicht bereit')), 10000))]);
await page.reload();
await page.waitForTimeout(800);
await ctx.setOffline(true);
await page.goto(BASE);
await page.waitForSelector('.tile', { timeout: 8000 }).catch(() => {});
check('Offline-Start über Service Worker', await page.locator('.tile').count() > 0);
await page.locator('.tile', { hasText: 'Biologie' }).click();
await page.waitForSelector('.row');
check('Offline: Daten und Suche funktionieren', await page.locator('.row').count() >= 1);
await ctx.setOffline(false);

check('Keine externen Netzwerkanfragen', external.length === 0, external.join(', '));
check('Keine JavaScript-Fehler', errors.length === 0, errors.join(' | '));
const fails = results.filter(r => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} Prüfungen bestanden`);
await browser.close();
process.exit(fails.length ? 1 : 0);
