const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const env = { ...process.env, TOOLBOX_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(process.env.TOOLBOX_EXECUTABLE ? { executablePath: process.env.TOOLBOX_EXECUTABLE, args: [] } : { args: [path.resolve(__dirname, '..')] }), env });
  try {
    await app.evaluate(async ({ clipboard, ClipboardItem }) => { globalThis.__fbclidClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))); });
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#search');
    await page.locator('#search').fill('fbclid'); await page.locator('#search').press('Enter');
    const source = 'IwVERFWAVctuVleHRuA2FlbQEwAHBkb2YFZmRpZBZRHYGLzeAgLriTZQX8mrRHjlzrtr1sYWRpZAAAL9vpcpVwc3J0YwZhcHBfaWQKNjYyODU2ODM3OQABH0pmP6fQsxo8PQf0twGCpAJ1d7myiHMv2GxoVeTFM0-T6c1LAi7g0oZT0lFX_aem_ORqRB734sDQON0_9l82-nA';
    const expected = 'TDEX.\\..extn.aem.0.pdof.fdid.Q..... ...e....G.\\...ladid../..r.psrtc.app_id.6628568379...Jf?....<=.......uw...s/.lhU..3O...K.....S.QW';
    await page.locator('#base64-input').evaluate((input, value) => {
      const transfer = new DataTransfer(); transfer.setData('text/plain', value);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, source);
    assert.equal(await page.locator('#base64-input').inputValue(), source);
    assert.equal(await page.locator('#copy-base64').isDisabled(), true);
    await page.locator('#decode-fbclid').click();
    assert.equal(await page.locator('#base64-output').inputValue(), expected);
    assert.equal(await page.locator('#base64-input').inputValue(), source);
    assert.equal(await page.locator('#base64-input').getAttribute('aria-invalid'), null);
    assert.match(await page.locator('#base64-message').textContent(), /临时规则/);
    await page.locator('#copy-base64').click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), expected);
    await fs.mkdir(path.resolve(__dirname, '../.impeccable/review'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../.impeccable/review/fbclid-desktop.png'), fullPage: true, animations: 'disabled' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await page.screenshot({ path: path.resolve(__dirname, '../.impeccable/review/fbclid-narrow.png'), fullPage: true, animations: 'disabled' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const id of ['base64-input', 'base64-output']) assert.ok(await page.locator('#' + id).evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.locator('#base64-input').fill('IwA');
    assert.equal(await page.locator('#base64-output').inputValue(), '');
    assert.equal(await page.locator('#copy-base64').isDisabled(), true);
    await page.locator('#decode-fbclid').click();
    assert.equal(await page.locator('#base64-input').inputValue(), 'IwA');
    assert.match(await page.locator('#base64-message').textContent(), /无法解码/);
    await page.locator('#base64-input').fill('PAAP8gf0F-');
    await page.locator('#decode-fbclid').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#base64-output').inputValue(), '.. .A~');
    await page.locator('#base64-input').fill('5L2g5aW9'); await page.locator('#decode-base64').click();
    assert.equal(await page.locator('#base64-output').inputValue(), '你好');
    await page.locator('#base64-input').fill('');
    await page.locator('#base64-input').evaluate(input => {
      const transfer = new DataTransfer(); transfer.setData('text/plain', 'aGVsbG8=');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.locator('#base64-output').inputValue(), 'hello');
    await page.locator('#base64-clear').click();
    assert.equal(await page.locator('#base64-input').inputValue(), '');
    assert.equal(await page.locator('#base64-output').inputValue(), '');
    assert.equal(await page.locator('#copy-base64').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: fbclid search, real TDEX sample, Python-compatible ASCII preview, copy, keyboard, invalidation, errors, ordinary decode and narrow layout.');
  } finally {
    try { await app.evaluate(async ({ clipboard }) => { if (globalThis.__fbclidClipboard) await clipboard.write(globalThis.__fbclidClipboard); }); }
    finally { await app.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
