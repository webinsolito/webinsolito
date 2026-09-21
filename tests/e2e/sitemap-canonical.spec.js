const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ACTIVE = new Set(['MVP', 'BETA', 'STABLE']);

test('sitemap exposes only canonical active products', async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8'));
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);

  const merged = catalog.apps.filter(app => app.status === 'MERGED' && app.path);
  const planned = catalog.apps.filter(app => app.status === 'PLANNED' && app.path);
  const active = catalog.apps.filter(app => ACTIVE.has(app.status) && app.path);

  for (const app of merged) {
    expect(urls, `MERGED ${app.id} must stay reachable only as compatibility redirect, not in sitemap`).not.toContain(`https://webinsolito.github.io/webinsolito/${app.path}`);
  }
  for (const app of planned) {
    expect(urls, `PLANNED ${app.id} must not be indexed`).not.toContain(`https://webinsolito.github.io/webinsolito/${app.path}`);
  }
  for (const app of active) {
    expect(urls, `Active app ${app.id} must be discoverable`).toContain(`https://webinsolito.github.io/webinsolito/${app.path}`);
  }
});
