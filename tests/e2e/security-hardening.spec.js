const { test, expect } = require('@playwright/test');

const hardenedApps = [
  ['screensort', 12, 5],
  ['frigochef', 12, 5],
  ['parkmemo', 12, null],
  ['dealerflow', 12, 5],
];

test.describe('local file/import security hardening', () => {
  for (const [app, imageMb, backupMb] of hardenedApps) {
    test(`${app} bounds local file inputs`, async ({ request }) => {
      const response = await request.get(`/${app}/`);
      expect(response.ok(), app).toBeTruthy();
      const html = await response.text();
      expect(html, `${app}: image MIME validation`).toContain("startsWith('image/')");
      expect(html, `${app}: image size bound`).toContain(`${imageMb}*1024*1024`);
      if (backupMb) {
        expect(html, `${app}: backup import size bound`).toContain(`${backupMb}*1024*1024`);
      }
    });
  }

  test('ScreenSort pins the OCR dependency instead of using a floating latest build', async ({ request }) => {
    const html = await (await request.get('/screensort/')).text();
    expect(html).toMatch(/tesseract\.js@[0-9]+\.[0-9]+\.[0-9]+/i);
    expect(html).not.toMatch(/tesseract\.js@latest/i);
  });

  test('ParkMemo protects external map navigation', async ({ request }) => {
    const html = await (await request.get('/parkmemo/')).text();
    expect(html).toContain('noopener');
  });
});
