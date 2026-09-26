import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { renderEnglishHomepage } from '../scripts/localize-homepage.mjs';

const marker = value => JSON.stringify(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

test('replaces direct text while preserving nested decorative markup and whitespace', () => {
  const source = `<button data-i18n-text="${marker(['Contact & <ask>'])}">\n<img src="assets/a.svg" alt="">문의<span aria-hidden="true">→</span>\n</button>`;
  assert.equal(renderEnglishHomepage(source), source.replace('문의', 'Contact &amp; &lt;ask&gt;'));
});

test('handles nested bindings and multiple direct text nodes independently', () => {
  const source = `<p data-i18n-text="${marker(['Before', 'After'])}">이전<strong data-i18n-text="${marker(['Inside'])}">안</strong>이후</p>`;
  assert.equal(renderEnglishHomepage(source), source.replace('이전', 'Before').replace('안', 'Inside').replace('이후', 'After'));
});

test('escapes translated attributes, supports existing quote styles, and inserts absent attributes', () => {
  const source = `<input title='원문' data-i18n-attrs="${marker({ title: '"A" & <B>', placeholder: "Let's ask" })}">`;
  const result = renderEnglishHomepage(source);
  assert.ok(result.includes('title="&quot;A&quot; &amp; &lt;B&gt;"'));
  assert.ok(result.includes('placeholder="Let\'s ask"'));
  assert.ok(result.includes(`data-i18n-attrs="${marker({ title: '"A" & <B>', placeholder: "Let's ask" })}"`));
});

test('sets initial document language and toggle without changing links, raw scripts, or examples', () => {
  const source = '<!doctype html><html lang="ko"><body><button id="language-toggle" aria-checked="false" aria-label="영어">KR/EN</button><a href="/?q=한글&amp;x=1">한글</a><pre>{"clip_id":"한글"}</pre><script>if (a < b) x = "<p>한글</p>";</script><!-- <p>comment</p> --></body></html>';
  assert.equal(renderEnglishHomepage(source), source.replace('lang="ko"', 'lang="en"').replace('aria-checked="false"', 'aria-checked="true"').replace('aria-label="영어"', 'aria-label="View in Korean"'));
});

test('decodes numeric HTML entities exactly once', () => {
  const source = '<p data-i18n-text="[&#34;A &#x26; B &amp;lt;&#34;]">원문</p>';
  assert.ok(renderEnglishHomepage(source).endsWith('>A &amp; B &amp;lt;</p>'));
});

test('rejects malformed, unsupported, and mismatched bindings instead of silently losing content', () => {
  for (const source of [
    '<p data-i18n-text="bad">원문</p>',
    `<p data-i18n-text="${marker({ en: 'English' })}">원문</p>`,
    `<p data-i18n-text="${marker([4])}">원문</p>`,
    `<p data-i18n-text="${marker(['English'])}"><span>원문</span></p>`,
    `<p data-i18n-text="${marker(['English'])}">원문<span>장식</span>추가</p>`,
    `<input data-i18n-text="${marker(['English'])}">`,
    `<script data-i18n-text="${marker(['English'])}">text</script>`,
    `<p data-i18n-attrs="${marker(['title'])}">원문</p>`,
    `<p data-i18n-attrs="${marker({ title: 4 })}">원문</p>`,
    '<p><span>unbalanced</p>',
  ]) assert.throws(() => renderEnglishHomepage(source), Error, source);
});

test('renders the real homepage with every bound English string and unchanged media/example content', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const english = renderEnglishHomepage(source);
  const bindings = [...source.matchAll(/data-i18n-text="([^"]+)"/g)];
  const baseline = await readFile(process.env.HOMEPAGE_BASELINE || new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(bindings.length, [...baseline.matchAll(/data-i18n-text="([^"]+)"/g)].length);
  assert.ok(bindings.length > 0);
  for (const [, binding] of bindings) {
    const values = JSON.parse(binding.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    for (const value of values) assert.ok(english.includes(`>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`) || english.includes(value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '<'), value);
  }
  assert.match(english, /<html lang="en"/);
  assert.match(english, />Human actions\.</);
  assert.doesNotMatch(english, />로봇이 배울 동작,/);
  assert.deepEqual([...english.matchAll(/(?:src|href)="[^"]*"/g)].map(match => match[0]), [...source.matchAll(/(?:src|href)="[^"]*"/g)].map(match => match[0]));
  assert.deepEqual([...english.matchAll(/<pre>[\s\S]*?<\/pre>/g)].map(match => match[0]), [...source.matchAll(/<pre>[\s\S]*?<\/pre>/g)].map(match => match[0]));
  assert.equal(renderEnglishHomepage(english), english);
});
