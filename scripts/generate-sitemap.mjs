import fs from 'node:fs/promises';

const BASE = 'https://webinsolito.github.io/webinsolito/';
const CATEGORY_PATHS = {
  auto: 'auto/', food: 'food/', money: 'soldi/', events: 'eventi/', docs: 'documenti/',
  home: 'casa/', travel: 'viaggi/', style: 'persona/', shopping: 'shopping/',
  territory: 'territorio/', business: 'business/', study: 'studio/'
};
const ACTIVE = new Set(['MVP', 'BETA', 'STABLE']);

const catalog = JSON.parse(await fs.readFile(new URL('../apps.json', import.meta.url), 'utf8'));
const urls = [BASE];

for (const category of catalog.categories || []) {
  const path = CATEGORY_PATHS[category.id];
  if (path) urls.push(BASE + path);
}

for (const app of catalog.apps || []) {
  if (!ACTIVE.has(app.status) || !app.path) continue;
  urls.push(new URL(app.path, BASE).href);
}

const unique = [...new Set(urls)];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...unique.map(url => `  <url><loc>${url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loc></url>`),
  '</urlset>',
  ''
].join('\n');

await fs.writeFile(new URL('../sitemap.xml', import.meta.url), xml, 'utf8');
console.log(`sitemap.xml generated: ${unique.length} canonical URLs (${unique.length - 1 - Object.keys(CATEGORY_PATHS).length} active apps).`);
