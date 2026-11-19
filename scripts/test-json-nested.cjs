const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const env = { ...process.env, TOOLBOX_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(process.env.TOOLBOX_EXECUTABLE ? { executablePath: process.env.TOOLBOX_EXECUTABLE, args: [] } : { args: [path.resolve(__dirname, '..')] }), env });
  try {
    await app.evaluate(async ({ clipboard, ClipboardItem }) => { globalThis.__nestedClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))); });
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#search');
    await page.locator('[data-tool=json]').click();
    const inner = '{"url":"../tracking/events","data":{"payload":{"clickId":"example"},"event_name":"landing_page_continue_click"},"response":{},"id":9223372036854775807}';
    const source = JSON.stringify({ requestId: 'request-test', method: 'POST', path: '/test/report', body: inner, bodyEncoding: 'utf-8' });
    await page.locator('#json-output').evaluate((editor, text) => {
      const data = new DataTransfer(); data.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, source);
    const before = await page.locator('#json-output').inputValue();
    assert.equal(typeof JSON.parse(before).body, 'string');
    await page.locator('#expand-json').click();
    const expanded = await page.locator('#json-output').inputValue();
    assert.equal(JSON.parse(expanded).body.data.event_name, 'landing_page_continue_click');
    assert.match(expanded, /"id": 9223372036854775807/);
    assert.match(await page.locator('#json-message').textContent(), /已展开 1 处/);
    await page.locator('#copy-json').click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), expanded);
    await fs.mkdir(path.resolve(__dirname, '../.impeccable/review'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../.impeccable/review/json-nested-desktop.png'), fullPage: true, animations: 'disabled' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.resolve(__dirname, '../.impeccable/review/json-nested-narrow.png'), fullPage: true, animations: 'disabled' });
    await page.locator('#undo-expand').click();
    assert.equal(await page.locator('#json-output').inputValue(), before);
    assert.equal(await page.locator('#undo-expand').isVisible(), false);
    await page.locator('#expand-json').click(); await page.locator('#expand-json').click();
    assert.match(await page.locator('#json-message').textContent(), /没有可展开/);
    await page.locator('#undo-expand').click(); assert.equal(await page.locator('#json-output').inputValue(), before);
    await page.locator('#expand-json').click(); await page.locator('#json-output').fill('{"changed":true}');
    assert.equal(await page.locator('#undo-expand').isVisible(), false);
    await page.locator('#json-output').fill('{"bad":}'); await page.locator('#expand-json').click();
    assert.equal(await page.locator('#json-output').inputValue(), '{"bad":}');
    assert.equal(await page.locator('#copy-json').isDisabled(), true);
    assert.match(await page.locator('#json-message').textContent(), /格式有误/);
    assert.deepEqual(errors, []);
    console.log('PASS: nested body paste, expansion, exact large IDs, copy, undo, repeated clicks, edits, errors and narrow layout.');
  } finally {
    try { await app.evaluate(async ({ clipboard }) => { if (globalThis.__nestedClipboard) await clipboard.write(globalThis.__nestedClipboard); }); }
    finally { await app.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
