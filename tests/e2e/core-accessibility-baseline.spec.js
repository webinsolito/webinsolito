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

test('shared focus treatment is visible at runtime', async ({ page }) => {
  await page.goto('/');
  // :focus-visible is intentionally modality-aware. Exercise the real keyboard
  // path instead of programmatic focus(), which Chromium may not match as
  // focus-visible and produced a false regression in CI.
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  await expect(focused).toBeFocused();
  const outline = await focused.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset };
  });
  expect(outline.style).not.toBe('none');
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(3);
  expect(parseFloat(outline.offset)).toBeGreaterThanOrEqual(2);
});

test('install control respects the 44px touch target when present', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const install = page.locator('.wi-app-install');
  if (await install.count()) {
    const box = await install.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
