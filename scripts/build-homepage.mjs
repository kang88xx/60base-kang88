import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { renderEnglishHomepage } from './localize-homepage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function productionMetadata(source, language) {
  const imageUrl = 'https://60base.ai/homepage/assets/brand/social-homepage.png';
  const imageAlt = language === 'en'
    ? '60BASE — HUMAN ACTIONS. DATA FOR PHYSICAL AI. Large cream lettering on a black background.'
    : '60BASE — 검은 배경 위 크림색 큰 영문 문구 HUMAN ACTIONS. DATA FOR PHYSICAL AI.';
  const imageMetadata = {
    'og:image': imageUrl, 'og:image:width': '1200', 'og:image:height': '630', 'og:image:type': 'image/png',
    'og:image:alt': imageAlt, 'twitter:image': imageUrl, 'twitter:image:alt': imageAlt,
  };
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  if (!head) throw new Error('The existing production homepage head is missing.');
  const tags = [...head.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter(tag => /^<title\b/i.test(tag)
      || /^<meta\b[^>]*(?:name=["'](?:description|twitter:[^"']+)["']|property=["']og:[^"']+["'])/i.test(tag)
      || /^<link\b[^>]*rel=["'](?:canonical|alternate)["']/i.test(tag))
    .map(tag => tag.replace(/\sdata-i18n-(?:text|attrs)=(["'])[\s\S]*?\1/gi, ''))
    .map(tag => {
      const key = tag.match(/\b(?:name|property)=["']([^"']+)["']/i)?.[1];
      return imageMetadata[key] ? tag.replace(/\bcontent=(["'])[\s\S]*?\1/i, `content="${imageMetadata[key]}"`) : tag;
    });
  if (!tags.some(tag => /rel=["']canonical["']/i.test(tag))) throw new Error('Production canonical URL is missing.');
  return tags.join('\n');
}

function localizeShell(html, language, metadata) {
  return html
    .replace(/(<html\b[^>]*\blang=)["'][^"']+["']/i, `$1"${language}"`)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*rel=["'](?:canonical|alternate)["'][^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `${metadata}\n  </head>`);
}

export async function buildHomepage(output) {
  await build({ configFile: path.join(root, 'homepage/vite.config.mjs') });
  const template = await readFile(path.join(output, 'homepage/index.html'), 'utf8');
  const previousHomepage = await readFile(path.join(root, 'index.html'), 'utf8');
  const locales = {
    ko: productionMetadata(previousHomepage, 'ko'),
    en: productionMetadata(renderEnglishHomepage(previousHomepage), 'en'),
  };
  for (const language of ['en', 'ko']) {
    const html = localizeShell(template, language, locales[language]);
    await writeFile(path.join(output, `index.${language}.html`), html);
    if (language === 'en') {
      await writeFile(path.join(output, 'index.html'), html);
      await writeFile(path.join(output, 'homepage/index.html'), html);
    }
  }
  console.log('Built renewed homepage in /homepage/ with production EN/KO metadata; existing routes remain intact.');
}
