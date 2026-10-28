// Tokenizer und Stoppwörter für die lokale Volltextsuche (reine Logik, ohne DOM).

const STOP = new Set(('aber alle allem allen aller alles also auch auf aus bei bin bis bist da damit dann das dass dein deine dem den der des die dies diese diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines er es etwas euch für gegen gibt hab habe haben hat hatte hier ich ihr ihre im in ist ja jede jedem jeden jeder jedes kann kein keine mach machen man mehr mein meine mich mir mit nach nicht noch nun nur ob oder ohne sehr sein seine sich sie sind so soll sollen über um und uns unter vom von vor war was weil wenn wer werden wie wir wird wo wurde zu zum zur ' +
  'about after all also and any are been but can could did does for from had has have how into its just like more not now one only other our out she than that the their them then there these they this was were what when where which who will with would you your').split(' '));

export function tokenize(text, minLen = 2) {
  const m = String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return m ? m.filter(t => t.length >= minLen) : [];
}

export function uniqueTokens(text, minLen = 2) {
  return [...new Set(tokenize(text, minLen))];
}

export const isStop = t => STOP.has(t);

/** Wortstamm-Näherung für deutsche Beugungen: Präfix-Vergleich. */
export function stem(t) {
  if (t.length <= 4) return t;
  return t.slice(0, Math.max(4, Math.ceil(t.length * 0.75)));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Hebt Treffer (Wortanfang) in Klartext hervor; gibt sicheres HTML zurück. */
export function highlight(text, terms) {
  const safe = escapeHtml(text);
  const ts = [...new Set(terms.filter(t => t.length >= 2))].sort((a, b) => b.length - a.length);
  if (!ts.length) return safe;
  const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + ts.map(t => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
  return safe.replace(re, (_, pre, hit) => pre + '<mark>' + hit + '</mark>');
}
