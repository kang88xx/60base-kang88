// Build-time rendering of the homepage's explicit i18n markers. This deliberately
// requires balanced, explicit closing tags; it is not a general HTML parser.
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const rawTags = new Set(['script', 'style']);
const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0' };
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
  if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(key[1].toLowerCase() === 'x' ? 2 : 1), key[1].toLowerCase() === 'x' ? 16 : 10));
  if (!(key in entities)) throw new Error(`Unsupported entity in translation binding: ${entity}`);
  return entities[key];
});
const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = value => escapeText(value).replace(/"/g, '&quot;');

function readAttributes(tag, name) {
  const attributes = new Map();
  const end = tag.length - (/\/\s*>$/.test(tag) ? 2 : 1);
  let position = 1 + name.length;
  while (position < end) {
    const match = /^\s+([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>`"'=]+)))?/.exec(tag.slice(position, end));
    if (!match) {
      if (tag.slice(position, end).trim()) throw new Error(`Unsupported attributes: ${tag}`);
      break;
    }
    const key = match[1].toLowerCase();
    if (attributes.has(key)) throw new Error(`Duplicate attribute: ${key}`);
    attributes.set(key, { start: position, end: position + match[0].length, value: match[2] ?? match[3] ?? match[4] ?? '' });
    position += match[0].length;
  }
  return attributes;
}

function jsonBinding(attributes, name) {
  if (!attributes.has(name)) return undefined;
  try { return JSON.parse(decode(attributes.get(name).value)); }
  catch (error) { throw new Error(`Invalid ${name}: ${error.message}`); }
}

export function renderEnglishHomepage(html) {
  const output = [];
  const stack = [];
  let position = 0;
  const addText = text => {
    const parent = stack.at(-1);
    if (parent?.translations && decode(text).trim()) {
      const translation = parent.translations[parent.used++];
      if (translation === undefined) throw new Error(`Too many direct text nodes in <${parent.name}>`);
      output.push(escapeText(translation));
    } else output.push(text);
  };
  while (position < html.length) {
    const parent = stack.at(-1);
    if (parent && rawTags.has(parent.name)) {
      const closing = new RegExp(`</${parent.name}\\s*>`, 'ig');
      closing.lastIndex = position;
      const match = closing.exec(html);
      if (!match) throw new Error(`Unclosed <${parent.name}>`);
      output.push(html.slice(position, match.index), match[0]);
      stack.pop();
      position = closing.lastIndex;
      continue;
    }
    if (html[position] !== '<') {
      const next = html.indexOf('<', position);
      const end = next === -1 ? html.length : next;
      addText(html.slice(position, end));
      position = end;
      continue;
    }
    const match = /^(?:<!--[\s\S]*?-->|<!doctype\s+html\s*>|<\/?[a-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>)/i.exec(html.slice(position));
    if (!match) throw new Error(`Unsupported markup at offset ${position}`);
    const tag = match[0];
    position += tag.length;
    if (tag.startsWith('<!')) { output.push(tag); continue; }
    const name = /^<\/?([\w:-]+)/.exec(tag)[1].toLowerCase();
    if (tag.startsWith('</')) {
      const element = stack.pop();
      if (!element || element.name !== name) throw new Error(`Mismatched closing tag: ${tag}`);
      if (element.translations && element.used !== element.translations.length) throw new Error(`Missing direct text nodes in <${name}>`);
      output.push(tag);
      continue;
    }
    const attributes = readAttributes(tag, name);
    const translations = jsonBinding(attributes, 'data-i18n-text');
    if (translations !== undefined && (!Array.isArray(translations) || !translations.length || !translations.every(value => typeof value === 'string' && value.trim()))) {
      throw new Error(`Unsupported data-i18n-text on <${name}>: expected nonempty string array`);
    }
    const translatedAttributes = jsonBinding(attributes, 'data-i18n-attrs');
    if (translatedAttributes !== undefined && (!translatedAttributes || Array.isArray(translatedAttributes) || typeof translatedAttributes !== 'object')) {
      throw new Error(`Unsupported data-i18n-attrs on <${name}>: expected object`);
    }
    const updates = new Map(Object.entries(translatedAttributes ?? {}));
    if (name === 'html') updates.set('lang', 'en');
    if (attributes.get('id')?.value === 'language-toggle') {
      updates.set('aria-checked', 'true');
      updates.set('aria-label', 'View in Korean');
    }
    const edits = [];
    for (const [key, value] of updates) {
      if (!/^[a-z][a-z0-9:-]*$/.test(key) || key.startsWith('data-i18n-') || typeof value !== 'string') throw new Error(`Unsupported translated attribute: ${key}`);
      const existing = attributes.get(key);
      const insertion = tag.length - (/\/\s*>$/.test(tag) ? 2 : 1);
      edits.push({ start: existing?.start ?? insertion, end: existing?.end ?? insertion, text: ` ${key}="${escapeAttribute(value)}"` });
    }
    let renderedTag = tag;
    for (const edit of edits.sort((a, b) => b.start - a.start)) renderedTag = renderedTag.slice(0, edit.start) + edit.text + renderedTag.slice(edit.end);
    output.push(renderedTag);
    if (voidTags.has(name) || /\/\s*>$/.test(tag)) {
      if (translations) throw new Error(`Text binding on empty <${name}>`);
    } else {
      if (translations && rawTags.has(name)) throw new Error(`Text binding on raw <${name}> is unsupported`);
      stack.push({ name, translations, used: 0 });
    }
  }
  if (stack.length) throw new Error(`Unclosed <${stack.at(-1).name}>`);
  return output.join('');
}
