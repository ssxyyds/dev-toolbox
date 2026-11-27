const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const testShortcut = 'Control+Alt+Shift+F10';
function pressGlobalShortcut() {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class ToolboxKey { [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, System.UIntPtr extra); }'
    foreach ($key in @(0x11, 0x12, 0x10, 0x79)) { [ToolboxKey]::keybd_event($key, 0, 0, [System.UIntPtr]::Zero) }
    foreach ($key in @(0x79, 0x10, 0x12, 0x11)) { [ToolboxKey]::keybd_event($key, 0, 2, [System.UIntPtr]::Zero) }
  `], { windowsHide: true });
}
(async () => {
  const env = { ...process.env, TOOLBOX_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(process.env.TOOLBOX_EXECUTABLE ? { executablePath: process.env.TOOLBOX_EXECUTABLE, args: [] } : { args: [path.resolve(__dirname, '..')] }), env });
  const errors = [];
  try {
    await app.evaluate(async ({ clipboard, ClipboardItem }) => { globalThis.__toolboxSavedClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))); });
    const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    const search = page.locator('#search');
    const jsonEditor = page.locator('#json-output');
    const windowBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    const paste = (target, text) => target.evaluate((input, value) => {
      const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', value);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, text);
    const assertClipboardText = async expected => {
      const actual = await app.evaluate(async ({ clipboard }, expected) => {
        const deadline = Date.now() + 5000;
        let text;
        do {
          text = await clipboard.readText();
          if (text === expected) return text;
          await new Promise(resolve => setTimeout(resolve, 25));
        } while (Date.now() < deadline);
        return text;
      }, expected);
      assert.equal(actual, expected);
    };
    await page.emulateMedia({ colorScheme: 'light' });
    await search.waitFor();
    assert.equal(await app.evaluate(({ globalShortcut }, accelerator) => globalShortcut.isRegistered(accelerator), testShortcut), true, 'Test accelerator is occupied by another application');
    await app.evaluate(async ({ clipboard, BrowserWindow }) => { await clipboard.writeText('1700000000123'); BrowserWindow.getAllWindows()[0].hide(); });
    pressGlobalShortcut();
    await page.waitForFunction(() => document.hasFocus());
    assert.equal(await search.isVisible(), true, 'Numeric clipboard text does not open JSON');
    await app.evaluate(async ({ clipboard, BrowserWindow }) => { await clipboard.writeText('{"shortcut":"woke"}'); BrowserWindow.getAllWindows()[0].hide(); });
    pressGlobalShortcut();
    await page.waitForFunction(() => document.getElementById('json-output').value.includes('"woke"'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await page.locator('#back').click();
    await fs.mkdir(path.resolve(__dirname, '../.impeccable/review'), { recursive: true });
    const capture = name => page.screenshot({ path: path.resolve(__dirname, `../.impeccable/review/${name}.png`), fullPage: true, animations: 'disabled' });
    await capture('launcher');
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(17, 17, 19)');
    await capture('launcher-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await page.locator('.tool-row').count(), 5);
    assert.equal(await page.locator('[data-tool="base64"] strong').textContent(), 'Base64 编解码');
    assert.equal(await page.locator('[data-tool="timestamp"] strong').textContent(), '时间戳转换');
    assert.ok(await page.locator('[data-tool="note"]').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('footer').getBoundingClientRect().top), 'All five tools fit in the launcher');
    await search.press('ArrowUp'); assert.equal(await search.getAttribute('aria-activedescendant'), 'tool-option-note');
    await search.press('ArrowDown'); assert.equal(await search.getAttribute('aria-activedescendant'), 'tool-option-json');
    const legacy = '# 原有的笔记';
    await page.evaluate(text => localStorage.setItem('ssx-toolbox.notepad.v1', text), legacy);
    const noteFile = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'notepad.md');
    await search.fill('markdown');
    await search.press('Enter');
    const note = page.locator('#note-input');
    const loadedNote = () => page.waitForFunction(() => !document.getElementById('note-input').readOnly);
    await loadedNote();
    assert.equal(await note.inputValue(), legacy);
    assert.equal(await fs.readFile(noteFile, 'utf8'), legacy);
    assert.equal(await page.evaluate(() => localStorage.getItem('ssx-toolbox.notepad.v1')), null);
    assert.equal(await page.locator('#note-error').isVisible(), false);
    const sample = '# 随手记\n\n- **待办**\n- 整理笔记\n\n```js\nconst value = 1;\n```\n\n<b>原样显示</b>\n\n| 名称 | 数量 |\n| :--- | ---: |\n| 笔记 | 1 |';
    assert.ok(await note.evaluate(el => el === document.activeElement));
    await note.fill(sample);
    await note.press('Control+Enter');
    const preview = page.locator('#note-preview');
    assert.equal(await preview.locator('h1').textContent(), '随手记');
    assert.equal(await preview.locator('li strong').textContent(), '待办');
    assert.equal(await preview.locator('pre code').textContent(), 'const value = 1;\n');
    assert.equal(await preview.locator('b').count(), 0);
    assert.equal(await preview.locator('td').last().evaluate(el => getComputedStyle(el).textAlign), 'right');
    assert.equal(await page.locator('#note-error').isVisible(), false);
    await capture('notepad-preview');
    await page.reload();
    await page.locator('#tool-option-note').click();
    await loadedNote();
    assert.equal(await note.inputValue(), sample, 'Saved Markdown survives reload');
    // Make the staging file unwritable without touching the saved note.
    await fs.mkdir(noteFile + '.tmp');
    await note.fill('重试保存');
    await page.locator('#note-error').waitFor();
    assert.equal(await fs.readFile(noteFile, 'utf8'), sample);
    await fs.rmdir(noteFile + '.tmp');
    await page.locator('#note-retry').click();
    await page.locator('#note-error').waitFor({ state: 'hidden' });
    assert.equal(await fs.readFile(noteFile, 'utf8'), '重试保存');
    await note.fill('');
    await page.reload();
    await page.locator('#tool-option-note').click();
    await loadedNote();
    assert.equal(await note.inputValue(), '', 'An empty note stays empty');
    await note.press('Escape');
    await search.fill('nothing matches'); assert.equal(await page.locator('#no-results').isVisible(), true);
    await search.press('Escape'); assert.equal(await search.inputValue(), '');
    await search.fill('ＢＡＳＥ６４ 编码'); assert.equal(await search.getAttribute('aria-activedescendant'), 'tool-option-base64');
    await search.evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    assert.equal(await search.isVisible(), true, 'IME Enter must not activate a tool');
    await page.locator('#clear-search').click(); assert.equal(await search.inputValue(), '');
    await page.locator('#maximize-window').click();
    await page.getByRole('button', { name: '还原窗口' }).waitFor();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()), true);
    await page.locator('#maximize-window').click();
    await page.getByRole('button', { name: '最大化' }).waitFor();
    await search.fill('json'); await search.press('Enter');
    assert.equal(await page.locator('#json-tool textarea').count(), 1);
    assert.equal(await jsonEditor.isEditable(), true);
    await app.evaluate(async ({ clipboard }) => { await clipboard.writeText('{"autoPaste":true,"id":9223372036854775807}'); });
    await jsonEditor.press('Control+A'); await jsonEditor.press('Control+V');
    await page.waitForFunction(() => document.getElementById('json-output').value.includes('\n  "autoPaste": true'));
    assert.match(await page.locator('#json-output').inputValue(), /9223372036854775807/);
    await page.locator('#json-output').fill('{"id":9223372036854775807,"enabled":true,"items":[1,2,3]}');
    await page.locator('#json-output').press('Control+Enter'); assert.match(await page.locator('#json-output').inputValue(), /9223372036854775807/);
    await page.locator('#copy-json').click(); await assertClipboardText(await jsonEditor.inputValue());
    assert.ok(await page.locator('#main').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'The JSON toolbar and status fit at the default workspace size');
    await capture('desktop');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await capture('json-narrow'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1060, height: 740 }));
    await page.locator('#minify').click(); assert.equal((await page.locator('#json-output').inputValue()).includes('\n'), false);
    await page.locator('#indent').selectOption('4'); assert.match(await page.locator('#json-output').inputValue(), /\n    "id"/);
    await page.locator('#indent').selectOption('2');
    await page.locator('#json-output').fill('{"x":}'); await page.locator('#format').click();
    assert.equal(await page.locator('#json-message').evaluate(el => el.classList.contains('error')), true);
    assert.equal(await page.locator('#json-output').inputValue(), '{"x":}');
    assert.equal(await page.locator('#copy-json').isDisabled(), true);
    await page.locator('#clear').click();
    await app.evaluate(async ({ clipboard }) => { await clipboard.writeText('{"broken":}'); });
    await page.locator('#json-output').focus(); await page.keyboard.press('Control+V');
    await page.waitForFunction(() => document.getElementById('json-message').classList.contains('error'));
    assert.equal(await page.locator('#json-output').inputValue(), '{"broken":}');
    await page.locator('#json-output').fill('{"fixed":true}'); await page.locator('#json-output').press('Control+Enter');
    assert.equal(await page.locator('#copy-json').isDisabled(), false);
    await page.locator('#file').setInputFiles({ name: 'example.json', mimeType: 'application/json', buffer: Buffer.from('{"中文":"测试"}') });
    await page.waitForFunction(() => document.getElementById('json-output').value.includes('中文'));
    const exportPath = path.resolve(__dirname, '../.impeccable/review/export.json');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.locator('#download').click(); await page.waitForFunction(() => document.getElementById('toast').textContent === 'JSON 文件已保存');
    const downloaded = await fs.readFile(exportPath, 'utf8'); assert.match(downloaded, /中文/);
    await jsonEditor.evaluate(editor => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['{"dropped":true}'], 'drop.json', { type: 'application/json' }));
      editor.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
      if (document.getElementById('drop-hint').hidden) throw new Error('No drop target feedback');
      editor.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => document.getElementById('json-output').value.includes('dropped'));
    await page.locator('#json-wrap').check(); assert.equal(await jsonEditor.getAttribute('wrap'), 'soft');
    await page.locator('#json-wrap').uncheck();
    const largeInput = '['.repeat(64) + '0,'.repeat(8399) + '0' + ']'.repeat(64);
    await page.locator('#indent').selectOption('4');
    await jsonEditor.fill(largeInput); await page.locator('#format').click();
    assert.ok((await jsonEditor.inputValue()).length > 2 * 1024 * 1024);
    await page.locator('#minify').click(); assert.equal(await jsonEditor.inputValue(), largeInput);
    await page.locator('#indent').selectOption('2');
    await jsonEditor.fill('{"draft":, "keep":true}');
    await jsonEditor.evaluate(editor => editor.setSelectionRange(9, 9));
    await paste(jsonEditor, '{"part":true}');
    const draft = '{"draft":{"part":true}, "keep":true}';
    assert.equal(await jsonEditor.inputValue(), draft, 'Pasting a JSON object inside a draft does not replace the editor');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 950, height: 660 }));
    const customBounds = await windowBounds();
    await app.evaluate(({ BrowserWindow, app }) => {
      BrowserWindow.getAllWindows()[0].hide();
      app.emit('second-instance', {}, [process.execPath]);
    });
    await page.waitForFunction(() => document.hasFocus());
    assert.equal(await jsonEditor.isVisible(), true, 'Opening the app again preserves its active tool');
    assert.deepEqual(await windowBounds(), customBounds, 'Opening the app again preserves window bounds');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:wake', { json: '{"wakeup":true}' }));
    assert.equal(await page.locator('#clipboard-offer').count(), 0, 'No redundant clipboard banner is shown');
    assert.equal(await jsonEditor.inputValue(), draft, 'A hotkey does not replace the existing JSON');
    await jsonEditor.press('Control+K');
    await search.waitFor();
    await paste(search, '{"pasted":true}');
    await page.waitForFunction(() => document.getElementById('json-output').value.includes('pasted'));
    assert.match(await jsonEditor.inputValue(), /pasted/);
    const returnedBounds = await windowBounds();
    for (const key of ['width', 'height', 'x', 'y']) {
      assert.ok(Math.abs(returnedBounds[key] - customBounds[key]) <= 2, `The workspace remembers ${key} within Windows DPI rounding`);
    }
    await page.locator('#back').click(); await page.locator('#search').fill('mima'); await page.locator('#search').press('Enter');
    await page.locator('.generate').click(); assert.equal(await page.locator('.password-item').count(), 5);
    const passwords = await page.locator('.password-item code').allTextContents(); assert.ok(passwords.every(value => /^[A-Za-z0-9]{16}$/.test(value))); assert.equal(await page.locator("#symbols").isChecked(), false); assert.equal(await page.locator("#length-range").inputValue(), "16");
    await page.locator('#copy-all').click(); await assertClipboardText(passwords.join('\n'));
    await capture('password');
    for (const id of ['upper', 'lower', 'digits', 'symbols']) await page.locator('#' + id).uncheck();
    await page.locator('.generate').click(); assert.match(await page.locator('#password-message').textContent(), /至少/); assert.equal(await page.locator('#copy-all').isDisabled(), true);
    await page.locator('#upper').check(); await page.locator('#length').fill('128'); await page.locator('#count').fill('20'); await page.locator('.generate').click();
    assert.equal(await page.locator('.password-item').count(), 20);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await capture('mobile'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#length').fill('7');
    await page.locator('#back').click(); await page.locator('#search').fill('uuid'); await page.locator('#search').press('Enter');
    assert.equal(await page.locator('#generator-mode').inputValue(), 'uuid');
    assert.equal(await page.locator('#password-options').isVisible(), false);
    assert.equal(await page.locator('#length').isDisabled(), true);
    assert.equal(await page.locator('#copy-all').isDisabled(), true);
    await page.locator('#count').fill('3'); await page.locator('.generate').click();
    const uuids = await page.locator('.password-item code').allTextContents();
    assert.equal(uuids.length, 3);
    uuids.forEach(value => assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
    await page.locator('.password-item button').first().click(); await assertClipboardText(uuids[0]);
    await page.locator('#copy-all').click(); await assertClipboardText(uuids.join('\n'));
    await capture('uuid');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await capture('uuid-narrow'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#generator-mode').selectOption('password');
    assert.equal(await page.locator('#length').isDisabled(), false); assert.equal(await page.locator('#length').inputValue(), '7');
    assert.equal(await page.locator('.password-item').count(), 0); assert.equal(await page.locator('#copy-all').isDisabled(), true);
    await page.locator('#length').fill('20'); await page.locator('.generate').click();
    assert.equal(await page.locator('.password-item').count(), 3);
    await page.locator('#clear-password').click();
    assert.equal(await page.locator('.password-item').count(), 0);
    assert.equal(await page.locator('#copy-all').isDisabled(), true);
    await page.locator('#back').click(); await page.locator('#search').fill('base64url'); await page.locator('#search').press('Enter');
    const base64Mode = page.locator('#base64-mode');
    const base64Variant = page.locator('#base64-variant');
    const base64Input = page.locator('#base64-input');
    const base64Output = page.locator('#base64-output');
    const convertBase64 = page.locator('#convert-base64');
    const copyBase64 = page.locator('#copy-base64');
    assert.equal(await page.locator('#base64-tool').isVisible(), true);
    assert.equal(await page.locator('#tool-title').textContent(), 'Base64 编解码');
    assert.equal(await base64Mode.locator('input[value="decode"]').isChecked(), true);
    assert.ok(await base64Variant.isDisabled() || !(await base64Variant.isVisible()), 'Base64 variant is unavailable while decoding');
    assert.equal(await base64Output.isEditable(), false);
    assert.equal(await copyBase64.isDisabled(), true);
    await page.locator('#base64-example').click();
    assert.equal(await base64Output.inputValue(), '你好，Ssx 工具箱 👋');
    await copyBase64.click(); await assertClipboardText('你好，Ssx 工具箱 👋');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1060, height: 740 }));
    await capture('base64');
    const longDecoded = 'LongToken_0123456789-url_'.repeat(28) + '\n中文内容与原始换行';
    const longEncoded = Buffer.from(longDecoded).toString('base64url');
    await base64Input.fill(longEncoded); await convertBase64.click();
    for (const width of [390, 1060]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setBounds({ width, height: 844 }), width);
      for (const [field, locator] of [['Base64 input', base64Input], ['Base64 output', base64Output]]) {
        assert.ok(await locator.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${field} must wrap long content at ${width}px`);
      }
      assert.equal(await base64Input.inputValue(), longEncoded);
      assert.equal(await base64Output.inputValue(), longDecoded);
    }
    await copyBase64.click(); await assertClipboardText(longDecoded);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1060, height: 740 }));
    await base64Input.fill('broken!');
    assert.equal(await base64Output.inputValue(), ''); assert.equal(await copyBase64.isDisabled(), true);
    await convertBase64.click();
    assert.equal(await base64Input.getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('#base64-message').textContent(), /格式有误/);
    assert.equal(await base64Input.inputValue(), 'broken!');
    await capture('base64-error');

    const crlfText = '第一行\r\n第二行 👋\r\n';
    await base64Input.fill(Buffer.from(crlfText).toString('base64'));
    await convertBase64.click();
    assert.equal(await base64Output.inputValue(), crlfText.replace(/\r\n/g, '\n'));
    // Capture the IPC result before Windows normalizes clipboard line endings.
    await app.evaluate(({ clipboard }) => {
      const originalWriteText = clipboard.writeText;
      const written = new Promise(resolve => {
        clipboard.writeText = async function (text, ...args) {
          await originalWriteText.call(this, text, ...args);
          resolve(text);
        };
      });
      globalThis.__toolboxClipboardProbe = { written, restore: () => { clipboard.writeText = originalWriteText; } };
    });
    try {
      await copyBase64.click();
      const copied = await app.evaluate(async () => {
        let timer;
        try {
          return await Promise.race([
            globalThis.__toolboxClipboardProbe.written,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Base64 copy did not call clipboard.writeText')), 5000); }),
          ]);
        } finally { clearTimeout(timer); }
      });
      assert.equal(copied, crlfText, 'Base64 copy preserves the raw decoded CRLF');
    } finally {
      await app.evaluate(() => {
        globalThis.__toolboxClipboardProbe.restore();
        delete globalThis.__toolboxClipboardProbe;
      });
    }
    await base64Mode.locator('input[value="encode"]').check();
    await convertBase64.click();
    assert.equal(await base64Output.inputValue(), Buffer.from(crlfText).toString('base64'), 'Switching directions preserves the decoded line endings');
    const mixedLineEndings = '甲\r\n乙\r丙\n';
    await base64Input.evaluate((input, value) => {
      input.select();
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', value);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, mixedLineEndings);
    assert.equal(await base64Output.inputValue(), Buffer.from(mixedLineEndings).toString('base64'), 'Encoding pasted text preserves mixed line endings');
    await base64Mode.locator('input[value="decode"]').check();

    const unicodeText = '中文😿🌿';
    const standardEncoded = '5Lit5paH8J+Yv/CfjL8=';
    const urlEncoded = '5Lit5paH8J-Yv_CfjL8';
    await base64Input.fill(urlEncoded);
    await base64Input.press('Control+Enter');
    assert.equal(await base64Output.inputValue(), unicodeText);
    await page.locator('#base64-clear').click();
    assert.equal(await base64Output.inputValue(), ''); assert.equal(await base64Input.inputValue(), '');
    await app.evaluate(async ({ clipboard }) => { await clipboard.writeText('1234'); });
    await base64Input.focus(); await page.keyboard.press('Control+V');
    assert.equal(await page.locator('#base64-tool').isVisible(), true, 'Numeric Base64 input stays in the converter');
    assert.equal(await base64Input.inputValue(), '1234');
    await page.locator('#base64-clear').click();
    await app.evaluate(async ({ clipboard }, encoded) => { await clipboard.writeText(encoded); }, urlEncoded);
    await base64Input.focus(); await page.keyboard.press('Control+V');
    await page.waitForFunction(expected => document.getElementById('base64-output').value === expected, unicodeText);

    await base64Mode.locator('input[value="decode"]').press('ArrowRight');
    assert.equal(await base64Mode.locator('input[value="encode"]').isChecked(), true);
    assert.equal(await base64Input.inputValue(), unicodeText);
    assert.equal(await base64Output.inputValue(), ''); assert.equal(await copyBase64.isDisabled(), true);
    assert.equal(await base64Variant.isEnabled(), true);
    assert.equal(await base64Variant.inputValue(), 'base64');
    await convertBase64.click();
    assert.equal(await base64Output.inputValue(), standardEncoded);
    await base64Variant.selectOption('base64url');
    await base64Input.press('Control+Enter');
    assert.equal(await base64Output.inputValue(), urlEncoded);
    assert.ok(await page.locator('#main').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'The Base64 editor and status fit at the default workspace size');
    await capture('base64-encode');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await page.waitForFunction(() => innerWidth <= 400);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Base64 encoding fits a narrow window');
    await base64Mode.locator('input[value="decode"]').check();
    assert.ok(await base64Variant.isDisabled() || !(await base64Variant.isVisible()), 'Base64 variant is unavailable after switching to decoding');
    assert.equal(await base64Input.inputValue(), urlEncoded);
    assert.equal(await base64Output.inputValue(), ''); assert.equal(await copyBase64.isDisabled(), true);
    await convertBase64.click();
    assert.equal(await base64Output.inputValue(), unicodeText);
    await capture('base64-narrow'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#back').click(); await page.locator('#search').fill('北京时间'); await page.locator('#search').press('Enter');
    const timestampMode = page.locator('#timestamp-mode');
    const timestampUnit = page.locator('#timestamp-unit');
    const autoUnit = timestampUnit.locator('option[value="auto"]');
    const timestampInput = page.locator('#timestamp-input');
    const timestampOutput = page.locator('#timestamp-output');
    const copyTimestamp = page.locator('#copy-timestamp');
    const beijingTime = '2023-11-15 06:13:20.123';
    const unixMilliseconds = '1700000000123';
    const unixSeconds = '1700000000';
    // The same values must convert correctly even when the renderer is outside UTC+8.
    const timeZoneSession = await page.context().newCDPSession(page);
    await timeZoneSession.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    assert.equal(await page.evaluate(() => new Date().getTimezoneOffset()), 0);
    assert.equal(await page.locator('#tool-title').textContent(), '时间戳转换');
    assert.equal(await timestampMode.locator('input[value="to-date"]').isChecked(), true);
    assert.equal(await timestampUnit.inputValue(), 'auto');
    assert.equal(await page.locator('#timestamp-tool').isVisible(), true);
    assert.equal(await copyTimestamp.isDisabled(), true);
    await app.evaluate(async ({ clipboard }, value) => { await clipboard.writeText(value); }, unixMilliseconds);
    await timestampInput.focus(); await page.keyboard.press('Control+V');
    await page.waitForFunction(expected => document.getElementById('timestamp-output').value === expected, beijingTime);
    assert.equal(await page.locator('#timestamp-tool').isVisible(), true, 'Numeric paste stays in the timestamp converter');
    await copyTimestamp.click(); await assertClipboardText(beijingTime);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1060, height: 740 }));
    await capture('timestamp');
    await timestampInput.fill(unixSeconds);
    assert.equal(await timestampOutput.inputValue(), ''); assert.equal(await copyTimestamp.isDisabled(), true);
    await timestampInput.press('Enter'); assert.equal(await timestampOutput.inputValue(), '2023-11-15 06:13:20.000');
    await timestampInput.fill('0'); await timestampInput.press('Control+Enter');
    assert.equal(await timestampOutput.inputValue(), '1970-01-01 08:00:00.000');
    await timestampInput.fill('10000000000'); await timestampInput.press('Enter');
    assert.match(await page.locator('#timestamp-message').textContent(), /手动选择/);
    assert.equal(await timestampInput.getAttribute('aria-invalid'), 'true');
    assert.equal(await timestampOutput.inputValue(), ''); assert.equal(await copyTimestamp.isDisabled(), true);
    await timestampUnit.selectOption('seconds');
    assert.equal(await timestampOutput.inputValue(), '2286-11-21 01:46:40.000');
    await timestampUnit.selectOption('milliseconds');
    assert.equal(await timestampOutput.inputValue(), '1970-04-27 01:46:40.000');
    await timestampInput.fill('not a timestamp'); await page.locator('#timestamp-form .primary').click();
    assert.match(await page.locator('#timestamp-message').textContent(), /整数/);
    await capture('timestamp-error');
    await page.locator('#timestamp-clear').click();
    assert.equal(await timestampInput.inputValue(), ''); assert.equal(await timestampOutput.inputValue(), '');
    await timestampUnit.selectOption('auto');
    const beforeNow = Date.now(); await page.locator('#timestamp-now').click();
    const currentTimestamp = Number(await timestampInput.inputValue());
    assert.ok(currentTimestamp >= beforeNow && currentTimestamp <= Date.now());
    assert.match(await page.locator('#timestamp-message').textContent(), /毫秒/);
    assert.equal(await copyTimestamp.isDisabled(), false);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
    await capture('timestamp-narrow'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const currentBeijing = await timestampOutput.inputValue();
    await timestampMode.locator('input[value="to-unix"]').check();
    assert.equal(await timestampUnit.inputValue(), 'seconds');
    assert.ok(await autoUnit.evaluate(option => option.disabled || option.hidden), 'Auto unit is unavailable for Beijing-to-Unix');
    assert.equal(await timestampInput.inputValue(), currentBeijing);
    assert.equal(await timestampOutput.inputValue(), ''); assert.equal(await copyTimestamp.isDisabled(), true);
    await timestampInput.fill(beijingTime); await timestampInput.press('Enter');
    assert.equal(await timestampOutput.inputValue(), unixSeconds);
    await capture('timestamp-reverse-narrow');
    await timestampUnit.selectOption('milliseconds');
    await timestampInput.fill('');
    await app.evaluate(async ({ clipboard }, value) => { await clipboard.writeText(value); }, beijingTime);
    await timestampInput.press('Control+V');
    await page.waitForFunction(expected => document.getElementById('timestamp-output').value === expected, unixMilliseconds);
    await copyTimestamp.click(); await assertClipboardText(unixMilliseconds);

    await timestampInput.fill('2023-02-29 06:13:20.123');
    await page.locator('#timestamp-form .primary').click();
    assert.equal(await timestampInput.getAttribute('aria-invalid'), 'true');
    assert.equal(await timestampOutput.inputValue(), ''); assert.equal(await copyTimestamp.isDisabled(), true);
    const beforeReverseNow = Date.now(); await page.locator('#timestamp-now').click();
    const reverseNow = await timestampOutput.inputValue();
    assert.match(reverseNow, /^\d+$/);
    assert.ok(Number(reverseNow) >= beforeReverseNow && Number(reverseNow) <= Date.now(), 'Reverse current time returns the current Unix millisecond timestamp');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Beijing-to-Unix fits a narrow window');
    const oneMillisecond = '1970-01-01 08:00:00.001';
    await timestampInput.fill(oneMillisecond); await timestampInput.press('Enter');
    assert.equal(await timestampOutput.inputValue(), '1');
    await timestampMode.locator('input[value="to-date"]').check();
    assert.ok(await autoUnit.evaluate(option => !option.disabled && !option.hidden), 'Auto unit is available again for Unix-to-Beijing');
    assert.equal(await timestampUnit.inputValue(), 'milliseconds', 'The carried result retains its explicit unit');
    assert.equal(await timestampInput.inputValue(), '1');
    assert.equal(await timestampOutput.inputValue(), ''); assert.equal(await copyTimestamp.isDisabled(), true);
    await timestampInput.press('Enter');
    assert.equal(await timestampOutput.inputValue(), oneMillisecond);
    await timeZoneSession.send('Emulation.setTimezoneOverride', { timezoneId: '' });
    await timeZoneSession.detach();
    await page.locator('#minimize-window').click();
    await app.evaluate(async ({ BrowserWindow, app }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const deadline = Date.now() + 5000;
      while (!win.isMinimized()) {
        if (Date.now() >= deadline) throw new Error('Minimize button did not minimize the window');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      app.emit('second-instance', {}, [process.execPath]);
    });
    await page.waitForFunction(() => document.hasFocus());
    assert.equal(await timestampInput.isVisible(), true, 'Restoring the window keeps the selected tool');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.close(); });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDestroyed()), false);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    assert.deepEqual(errors, []);
    console.log('PASS: launcher keyboard navigation and theme, native window controls and remembered bounds, safe clipboard routing, JSON drop/import/export and large-document transforms, password generation and clearing, Base64 and timestamp round trips, copy/error states, narrow layouts and tray lifecycle.');
  } finally { try { await app.evaluate(async ({ clipboard }) => { if (globalThis.__toolboxSavedClipboard) await clipboard.write(globalThis.__toolboxSavedClipboard); }); } finally { await app.close(); } }
})().catch(error => { console.error(error); process.exitCode = 1; });
