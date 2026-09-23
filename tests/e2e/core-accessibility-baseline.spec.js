const { test, expect } = require('@playwright/test');

test('shared core stylesheet keeps keyboard focus and reduced-motion safeguards', async ({ request }) => {
  const r = await request.get('/assets/webinsolito-core.css');
  expect(r.ok()).toBeTruthy();
  const css = await r.text();
  expect(css).toContain(':focus-visible');
  expect(css).toContain('outline-offset:2px');
  expect(css).toContain('prefers-reduced-motion:reduce');
  expect(css).toContain('animation-duration:.01ms!important');
  expect(css).toContain('.wi-app-install{min-height:44px');
});
