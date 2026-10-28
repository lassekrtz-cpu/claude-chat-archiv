// Kleiner, sicherer Markdown-Renderer für Chat-Verläufe (ohne Bibliothek). Alles wird zuerst HTML-escaped.
import { escapeHtml } from './tokens.js';

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w])__([^_\n]+?)__(?!\w)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => '<code>' + escapeHtml(codes[+n]) + '</code>');
}

export function codeBlock(lang, code) {
  const label = lang ? escapeHtml(lang) : 'Code';
  return '<div class="code"><div class="code-h"><span>' + label + '</span><button type="button" class="copy" data-copy>Kopieren</button></div>' +
    '<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre></div>';
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

function renderList(items, from, indent) {
  const ordered = /\d/.test(items[from].marker);
  let html = ordered ? '<ol>' : '<ul>';
  let i = from;
  while (i < items.length && items[i].indent >= indent) {
    if (items[i].indent > indent) {
      const [inner, next] = renderList(items, i, items[i].indent);
      html = html.replace(/<\/li>$/, inner + '</li>');
      i = next;
      continue;
    }
    html += '<li>' + inline(items[i].text) + '</li>';
    i++;
  }
  return [html + (ordered ? '</ol>' : '</ul>'), i];
}

export function renderMarkdown(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const startsBlock = (l, next) =>
    FENCE_OPEN.test(l) || HEADING.test(l) || HR.test(l) || LIST_ITEM.test(l) || /^\s{0,3}>/.test(l) ||
    (l.includes('|') && next !== undefined && TABLE_SEP.test(next));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const f = line.match(FENCE_OPEN);
    if (f) {
      const mark = f[1][0], buf = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s{0,3}' + (mark === '`' ? '`' : '~') + '{' + f[1].length + ',}\\s*$').test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(codeBlock(f[2], buf.join('\n')));
      continue;
    }
    const h = line.match(HEADING);
    if (h) { out.push(`<h4 class="md-h md-h${h[1].length}">${inline(h[2])}</h4>`); i++; continue; }
    if (HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      out.push('<div class="table-wrap"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (m) items.push({ indent: m[1].replace(/\t/g, '    ').length, marker: m[2], text: m[3] });
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1].text += ' ' + lines[i].trim();
        else break;
        i++;
      }
      const base = Math.min(...items.map(x => x.indent));
      out.push(renderList(items, 0, base)[0]);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && (buf.length === 0 || !startsBlock(lines[i], lines[i + 1]))) buf.push(lines[i++]);
    out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
  }
  return out.join('');
}
